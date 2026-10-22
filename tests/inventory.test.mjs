import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const adminId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000002';
const sqlDirectory = new URL('../supabase/sql/', import.meta.url);

async function createDatabase({ inventory = true } = {}) {
  const database = new PGlite();
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  const files = (await readdir(sqlDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    if (file > '050_inventory.sql' || (!inventory && file === '050_inventory.sql')) continue;
    await database.exec(await readFile(new URL(file, sqlDirectory), 'utf8'));
  }
  await database.query(`
    insert into auth.users(id, email, raw_user_meta_data) values
      ($1, 'admin@example.test', '{"full_name":"Owner"}'),
      ($2, 'customer@example.test', '{"full_name":"Customer"}')
  `, [adminId, customerId]);
  await database.query("update public.profiles set role='admin' where id=$1", [adminId]);
  return database;
}

async function asRole(database, role, userId, operation) {
  await database.exec(`set role ${role}`);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
  try {
    return await operation();
  } finally {
    await database.exec('reset role');
    await database.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function makeItem(database, slug = 'stock-item') {
  const category = (await database.query(
    "insert into public.menu_categories(name,slug,is_published) values ('Stock',$1,true) returning id",
    [`stock-category-${slug}`],
  )).rows[0].id;
  const item = (await database.query(
    "insert into public.menu_items(category_id,name,slug,price_pence,is_published,is_available) values ($1,'Taco',$2,500,true,true) returning id",
    [category, slug],
  )).rows[0].id;
  const section = (await database.query(`
    insert into public.menu_set_sections(menu_set_id,title)
    select id,'Stock' from public.menu_sets where is_default returning id,menu_set_id
  `)).rows[0];
  await database.query('insert into public.menu_set_items(menu_set_id,section_id,menu_item_id) values($1,$2,$3)',
    [section.menu_set_id, section.id, item]);
  return item;
}

async function makeEvent(database, slug = 'stock-event', isPrivate = false) {
  return (await database.query(`
    insert into public.events(slug,title,venue_name,address_line_1,town,postcode,starts_at,ends_at,
      is_published,pickup_enabled,ordering_status,orders_open_at,is_private)
    values ($1,'Stock Event','Venue','Street','Town','AB1 2CD',now()-interval '1 hour',
      now()+interval '5 hours',true,true,'open',now()-interval '1 hour',$2) returning id
  `, [slug, isPrivate])).rows[0].id;
}

async function configure(database, item, mode, version = 0, request = crypto.randomUUID()) {
  return asRole(database, 'authenticated', adminId, () => database.query(
    `select public.admin_inventory_action($1,null,'configure',0,$2,'Initial configuration',$3,'each',$4)`,
    [item, version, mode, request],
  ));
}

async function adminAction(database, item, event, action, quantity, version, reason = null, request = crypto.randomUUID()) {
  return asRole(database, 'authenticated', adminId, () => database.query(
    'select public.admin_inventory_action($1,$2,$3,$4,$5,$6,null,null,$7)',
    [item, event, action, quantity, version, reason, request],
  ));
}

async function makeOrder(database, event, item, { method = 'card', quantity = 1, duplicateLines = false } = {}) {
  return database.transaction(async (database) => {
  const slot = (await database.query(`
    insert into public.pickup_slots(event_id,starts_at,ends_at,capacity)
    values($1,now()+interval '2 hours',now()+interval '2 hours 15 minutes',10) returning id
  `, [event])).rows[0].id;
  const order = (await database.query(`
    insert into public.orders(checkout_key,customer_id,event_id,pickup_slot_id,customer_name,customer_email,
      customer_phone,pickup_starts_at,pickup_ends_at,pickup_location,status,payment_method,payment_status,
      subtotal_pence,reservation_expires_at)
    values(gen_random_uuid(),$1,$2,$3,'Customer','customer@example.test','07000000000',
      now()+interval '2 hours',now()+interval '2 hours 15 minutes','{}',
      case when $4='card' then 'pending_payment' else 'ordered' end,$4,'unpaid',$5,
      case when $4='card' then now()+interval '10 minutes' else null end) returning id
  `, [customerId, event, slot, method, quantity * 500])).rows[0].id;
  const lineCount = duplicateLines ? quantity : 1;
  const lineQuantity = duplicateLines ? 1 : quantity;
  for (let index = 0; index < lineCount; index += 1) {
    await database.query(`
      insert into public.order_items(order_id,menu_item_id,item_name,quantity,unit_price_pence)
      values($1,$2,'Taco',$3,500)
    `, [order, item, lineQuantity]);
  }
  if (method === 'card') {
    await database.query(
      "insert into public.payments(order_id,provider,amount_pence) values($1,'stripe',$2)",
      [order, quantity * 500],
    );
  }
  return order;
  });
}

async function checkoutFixture(database, quantity = 2) {
  await database.exec("update public.business_settings set ordering_status='open',card_enabled=true");
  const item = await makeItem(database);
  const event = await makeEvent(database);
  const slot = (await database.query(`
    insert into public.pickup_slots(event_id,starts_at,ends_at,capacity)
    values($1,now()+interval '2 hours',now()+interval '2 hours 15 minutes',100) returning id
  `, [event])).rows[0].id;
  await configure(database, item, 'global');
  await adminAction(database, item, null, 'receive', quantity, 1, 'Opening balance');
  await adminAction(database, item, event, 'allocate', quantity, null);
  const payload = {
    eventId: event, slotId: slot, name: 'Customer', email: 'customer@example.test',
    phone: '07000000000', note: '', expectedTotal: 500,
    lines: [{ itemId: item, quantity: 1, optionIds: [] }],
  };
  const reserve = async (body = payload, key = crypto.randomUUID(), customer = customerId) =>
    (await database.query('select * from public.reserve_card_order($1,$2,$3)', [customer, key, body])).rows[0];
  const pay = async (order, eventId = `evt_${order.id}`, occurredAt = null) =>
    (await database.query(`select public.process_stripe_checkout($1,'checkout.session.completed',$2,
      $3,$4,$5,'gbp',$6) as refund`, [
      eventId, order.id, `cs_${order.id}`, `pi_${order.id}`, order.total_pence, occurredAt,
    ])).rows[0].refund;
  return { item, event, slot, payload, reserve, pay };
}

test('real reserve checkout preserves 048/049, aggregates duplicates, retries once and rolls back insufficient lines', async () => {
  const database = await createDatabase();
  try {
    const { item, event, payload, reserve } = await checkoutFixture(database, 2);
    const key = crypto.randomUUID();
    await database.query('update public.menu_set_items set price_pence=650 where menu_item_id=$1', [item]);
    const duplicatePayload = { ...payload, expectedTotal: 1300, lines: [payload.lines[0], payload.lines[0]] };
    await database.query('delete from public.profiles where id=$1', [customerId]);
    const order = await asRole(database, 'service_role', null, () => reserve(duplicatePayload, key));
    assert.equal(order.customer_id, customerId);
    assert.equal(order.total_pence, 1300);
    assert.equal((await database.query('select role from public.profiles where id=$1', [customerId])).rows[0].role, 'customer');
    assert.equal((await reserve(duplicatePayload, key)).id, order.id);
    assert.deepEqual((await database.query(
      'select quantity,state,expires_at from public.inventory_order_stock where order_id=$1', [order.id],
    )).rows[0], { quantity: 2, state: 'held', expires_at: order.reservation_expires_at });
    assert.equal((await database.query('select count(*)::integer as n from public.order_items where order_id=$1', [order.id])).rows[0].n, 2);
    assert.equal((await database.query('select min(unit_price_pence) as price from public.order_items where order_id=$1', [order.id])).rows[0].price, 650);
    assert.equal((await database.query('select count(*)::integer as n from public.payments where order_id=$1', [order.id])).rows[0].n, 1);
    await assert.rejects(reserve({ ...payload, expectedTotal: 650 }), /Stock changed\. Review your bag before paying\./);
    assert.equal((await database.query('select count(*)::integer as n from public.orders')).rows[0].n, 1);
    const other = await makeItem(database, 'extra-item');
    await configure(database, other, 'global');
    await adminAction(database, other, null, 'receive', 2, 1, 'Additional item');
    await adminAction(database, other, event, 'allocate', 2, null);
    await assert.rejects(reserve({
      ...payload, expectedTotal: 1150,
      lines: [{ ...payload.lines[0], itemId: other }, payload.lines[0]],
    }), /Stock changed/);
    assert.equal((await database.query('select count(*)::integer as n from public.orders')).rows[0].n, 1);
    assert.equal((await database.query('select count(*)::integer as n from public.inventory_order_stock where menu_item_id=$1', [other])).rows[0].n, 0);
    await assert.rejects(database.query('insert into public.order_items(order_id,menu_item_id,item_name,quantity,unit_price_pence) values($1,$2,\'Extra\',1,500)', [order.id, item]), /snapshots are immutable/);
    await assert.rejects(database.query('update public.order_items set order_id=gen_random_uuid() where order_id=$1', [order.id]), /snapshots are immutable/);
    await assert.rejects(database.query('delete from public.order_items where order_id=$1', [order.id]), /snapshots are immutable/);
    await assert.rejects(database.query('update public.orders set event_id=$1 where id=$2', [await makeEvent(database, 'different-event'), order.id]), /snapshots are immutable/);
    await assert.rejects(database.query('delete from public.orders where id=$1', [order.id]), /foreign key|snapshots are immutable/);
  } finally { await database.close(); }
});

test('last-item checkout contenders have one winner and hold the shared transaction lock', async () => {
  const database = await createDatabase();
  try {
    const { item, reserve } = await checkoutFixture(database, 1);
    const otherCustomer = crypto.randomUUID();
    await database.query("insert into auth.users(id,email) values($1,'other@example.test')", [otherCustomer]);
    const results = await Promise.allSettled([
      reserve(), reserve(undefined, crypto.randomUUID(), otherCustomer),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.match(results.find((result) => result.status === 'rejected').reason.message, /Stock changed/);
    assert.equal((await database.query('select sum(quantity)::integer as n from public.inventory_order_stock where menu_item_id=$1 and state=\'held\'', [item])).rows[0].n, 1);
    await database.transaction(async (transaction) => {
      await transaction.query('select private.inventory_lock()');
      assert.equal((await transaction.query(`select count(*)::integer as n from pg_locks
        where locktype='advisory' and classid=731050 and objid=1 and granted`)).rows[0].n, 1);
    });
    const functionBody = (name) => database.query('select pg_get_functiondef($1::regprocedure) as body', [name]);
    const reserveBody = (await functionBody('public.reserve_card_order(uuid,uuid,jsonb)')).rows[0].body;
    assert.ok(reserveBody.indexOf('in share mode;') < reserveBody.indexOf('perform private.inventory_lock();'));
    assert.ok(reserveBody.indexOf('perform private.inventory_lock();') < reserveBody.indexOf('for update'));
    for (const signature of [
      'public.attach_stripe_checkout(uuid,text,timestamptz)', 'public.cancel_card_checkout(uuid,uuid)',
      'public.admin_set_order_status(uuid,text,text)', 'public.admin_mark_cash_paid(uuid)',
      'public.process_stripe_refund(text,text,integer)', 'public.admin_lock_pickup_slot(uuid,timestamptz,boolean)',
      'public.admin_restock_order(uuid,text)', 'public.admin_return_event_stock(uuid,jsonb,text)',
      'public.process_stripe_checkout(text,text,uuid,text,text,integer,text,timestamptz)',
    ]) {
      const body = (await functionBody(signature)).rows[0].body;
      assert.ok(body.indexOf('perform private.inventory_lock();') < body.indexOf('for update'), signature);
    }
  } finally { await database.close(); }
});

test('timely Stripe completion delivered after hold expiry and resale cancels for refund without webhook retries consuming stock', async () => {
  const database = await createDatabase();
  try {
    const { item, reserve, pay } = await checkoutFixture(database, 1);
    const oldOrder = await reserve();
    const deadline = (await database.query(`update public.orders set reservation_expires_at=now()-interval '1 minute'
      where id=$1 returning reservation_expires_at`, [oldOrder.id])).rows[0].reservation_expires_at;
    assert.deepEqual((await database.query('select expires_at from public.inventory_order_stock where order_id=$1', [oldOrder.id])).rows[0].expires_at, deadline);
    const timelyPayment = new Date(new Date(deadline).getTime() - 1000).toISOString();
    const replacement = await reserve();
    assert.equal(await pay(replacement), false);
    assert.equal(await pay(oldOrder, 'evt_delayed', timelyPayment), true);
    assert.equal(await pay(oldOrder, 'evt_delayed', timelyPayment), true);
    assert.equal(await pay(oldOrder, 'evt_delayed_retry', timelyPayment), true);
    assert.deepEqual((await database.query('select status,payment_status from public.orders where id=$1', [oldOrder.id])).rows[0], { status: 'cancelled', payment_status: 'paid' });
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 0);
    assert.equal((await database.query('select state from public.inventory_order_stock where order_id=$1', [oldOrder.id])).rows[0].state, 'released');
    assert.deepEqual((await database.query('select status from public.order_status_history where order_id=$1 order by created_at,id', [oldOrder.id])).rows.map((row) => row.status), ['pending_payment', 'cancelled']);
    assert.equal((await database.query("select count(*)::integer as n from public.inventory_movements where menu_item_id=$1 and action='sale'", [item])).rows[0].n, 1);
    await database.query('select public.process_stripe_refund($1,$2,500)', ['evt_refund', `pi_${oldOrder.id}`]);
    assert.equal(await pay(oldOrder, 'evt_delayed', timelyPayment), false);
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 0);
  } finally { await database.close(); }
});

test('multi-item late payment validates every item before deducting any, and untracked commitments block mode changes', async () => {
  const database = await createDatabase();
  try {
    const { item, event, payload, reserve, pay } = await checkoutFixture(database, 1);
    const secondItem = await makeItem(database, 'second-stock-item');
    const untrackedOrder = await reserve({
      ...payload, lines: [{ ...payload.lines[0], itemId: secondItem }],
    });
    assert.equal((await database.query('select count(*)::integer as n from public.inventory_order_stock where order_id=$1', [untrackedOrder.id])).rows[0].n, 0);
    await assert.rejects(configure(database, secondItem, 'global'), /outstanding orders exist/);
    await database.query('select public.cancel_card_checkout($1,$2)', [untrackedOrder.id, customerId]);
    await configure(database, secondItem, 'global');
    await adminAction(database, secondItem, null, 'receive', 1, 1, 'Second receipt');
    await adminAction(database, secondItem, event, 'allocate', 1, null);
    const oldOrder = await reserve({
      ...payload, expectedTotal: 1000, lines: [payload.lines[0], { ...payload.lines[0], itemId: secondItem }],
    });
    const deadline = (await database.query(`update public.orders set reservation_expires_at=now()-interval '1 minute'
      where id=$1 returning reservation_expires_at`, [oldOrder.id])).rows[0].reservation_expires_at;
    const replacement = await reserve();
    assert.equal(await pay(replacement), false);
    assert.equal(await pay(oldOrder, 'evt_multi_late', new Date(new Date(deadline).getTime() - 1000).toISOString()), true);
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 0);
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [secondItem])).rows[0].on_hand, 1);
    assert.equal((await database.query("select count(*)::integer as n from public.inventory_order_stock where order_id=$1 and state='released'", [oldOrder.id])).rows[0].n, 2);
    assert.equal((await database.query("select count(*)::integer as n from public.inventory_movements where order_id=$1 and action='sale'", [oldOrder.id])).rows[0].n, 0);
  } finally { await database.close(); }
});

test('inventory activation refuses active orders and never deducts historical completed orders', async () => {
  const database = await createDatabase({ inventory: false });
  try {
    await database.exec("update public.business_settings set ordering_status='open',card_enabled=true");
    const item = await makeItem(database);
    const event = await makeEvent(database);
    const order = await makeOrder(database, event, item);
    const migration = await readFile(new URL('050_inventory.sql', sqlDirectory), 'utf8');
    await assert.rejects(database.exec(migration), /ordering maintenance window/);
    await database.exec('rollback');
    await database.query("update public.orders set status='collected',payment_status='paid' where id=$1", [order]);
    await database.exec(migration);
    assert.deepEqual((await database.query('select tracking_mode,on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0], { tracking_mode: 'none', on_hand: 0 });
    assert.equal((await database.query('select count(*)::integer as n from public.inventory_movements')).rows[0].n, 0);
    assert.equal((await database.query('select count(*)::integer as n from public.inventory_order_stock')).rows[0].n, 0);
  } finally { await database.close(); }
});

test('expiry webhooks release once and cancelled paid restoration requires admin, reason and sold snapshots', async () => {
  const database = await createDatabase();
  try {
    const { item, reserve, pay } = await checkoutFixture(database, 2);
    const expired = await reserve();
    const expire = () => database.query(`select public.process_stripe_checkout('evt_expire','checkout.session.expired',
      $1,$2,null,500,'gbp',null)`, [expired.id, `cs_${expired.id}`]);
    await expire(); await expire();
    assert.equal((await database.query("select count(*)::integer as n from public.inventory_movements where order_id=$1 and action='release'", [expired.id])).rows[0].n, 1);
    const sold = await reserve();
    assert.equal(await pay(sold), false);
    await assert.rejects(asRole(database, 'authenticated', adminId, () => database.query('select public.admin_restock_order($1,\'Not cancelled\')', [sold.id])), /Only cancelled paid/);
    await asRole(database, 'authenticated', adminId, () =>
      database.query('select public.admin_set_order_status($1,\'cancelled\',\'Cancellation\')', [sold.id]));
    for (const [role, user] of [['anon', null], ['authenticated', customerId], ['service_role', null]]) {
      await assert.rejects(asRole(database, role, user, () => database.query('select public.admin_restock_order($1,\'Forged\')', [sold.id])), /permission denied|Admin access required/);
    }
    await assert.rejects(asRole(database, 'authenticated', adminId, () => database.query('select public.admin_restock_order($1,\' \')', [sold.id])), /reason is required/);
    await asRole(database, 'authenticated', adminId, async () => {
      await database.query('select public.admin_restock_order($1,\'Returned safely\')', [sold.id]);
      await database.query('select public.admin_restock_order($1,\'Returned safely\')', [sold.id]);
    });
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 2);
    assert.equal((await database.query("select count(*)::integer as n from public.inventory_movements where order_id=$1 and action='restore_order'", [sold.id])).rows[0].n, 1);
    assert.equal((await asRole(database, 'authenticated', adminId, () => database.query(
      'select sold_quantity from public.admin_inventory_sales() where menu_item_id=$1', [item],
    ))).rows[0].sold_quantity, 0);
  } finally { await database.close(); }
});

test('inventory seed, receipt, event allocation, sale and return preserve exact stock accounting', async () => {
  const database = await createDatabase();
  try {
    const item = await makeItem(database);
    const event = await makeEvent(database);
    assert.deepEqual(
      (await database.query('select tracking_mode,unit_label,on_hand,version from public.inventory_items where menu_item_id=$1', [item])).rows[0],
      { tracking_mode: 'none', unit_label: 'each', on_hand: 0, version: 0 },
    );
    await configure(database, item, 'global');
    await adminAction(database, item, null, 'receive', 40, 1, 'Supplier receipt');
    await adminAction(database, item, event, 'allocate', 10, null);
    await adminAction(database, item, event, 'sale', 9, 0, 'Walk-up sale');
    await adminAction(database, item, event, 'return', 1, 1, 'Unused stock');
    const stock = (await database.query(`
      select i.on_hand,a.remaining from public.inventory_items i
      join public.inventory_allocations a on a.menu_item_id=i.menu_item_id
      where i.menu_item_id=$1 and a.event_id=$2
    `, [item, event])).rows[0];
    assert.deepEqual(stock, { on_hand: 31, remaining: 0 });
    const movements = (await database.query(
      'select action,quantity from public.inventory_movements where menu_item_id=$1 order by created_at,id',
      [item],
    )).rows;
    assert.deepEqual(movements.map((row) => [row.action, row.quantity]), [
      ['configure', 0], ['receive', 40], ['allocate', 10], ['sale', -9], ['return', -1],
    ]);
    await assert.rejects(adminAction(database, item, null, 'waste', 2, null, 'Spoilage'), /Inventory item changed/);
    await adminAction(database, item, null, 'waste', 2, 3, 'Spoilage');
    assert.deepEqual((await asRole(database, 'authenticated', adminId, () => database.query(
      'select * from public.admin_inventory_sales()',
    ))).rows, [{ menu_item_id: item, event_id: event, sold_quantity: 9 }]);
    await assert.rejects(asRole(database, 'authenticated', customerId, () => database.query(
      'select * from public.admin_inventory_sales()',
    )), /Admin access required/);
  } finally {
    await database.close();
  }
});

test('allocation targets, optimistic versions, quantities and idempotent request UUIDs are enforced', async () => {
  const database = await createDatabase();
  try {
    const item = await makeItem(database);
    const first = await makeEvent(database, 'stock-one');
    const second = await makeEvent(database, 'stock-two');
    await configure(database, item, 'global');
    await adminAction(database, item, null, 'receive', 10, 1, 'Receipt');
    await adminAction(database, item, first, 'allocate', 6, null);
    await adminAction(database, item, second, 'allocate', 4, null);
    await assert.rejects(adminAction(database, item, second, 'allocate', 5, 0), /Allocations cannot exceed stock on hand/);
    await assert.rejects(adminAction(database, item, null, 'correct', 9, 2, 'Over-allocated correction'), /allocations greater than stock/);
    await assert.rejects(adminAction(database, item, first, 'return', 1, 1), /Event allocation changed/);
    await assert.rejects(adminAction(database, item, first, 'return', -1, 0), /Quantity is out of range/);
    await assert.rejects(adminAction(database, item, null, 'receive', 1000001, 2, 'Too large'), /Quantity is out of range/);
    await assert.rejects(asRole(database, 'authenticated', adminId, () => database.query(
      'select public.admin_inventory_action($1,null,$2,0,2,$3,null,$4,null)',
      [item, 'configure', null, 'x'.repeat(31)],
    )), /Unit label must contain 1 to 30 characters/);

    const requestId = crypto.randomUUID();
    await asRole(database, 'authenticated', adminId, () => database.query(
      'select public.admin_inventory_action($1,null,$2,$3,$4,$5,null,null,$6)',
      [item, 'receive', 2, 2, 'Duplicate-safe receipt', requestId],
    ));
    await asRole(database, 'authenticated', adminId, () => database.query(
      'select public.admin_inventory_action($1,null,$2,$3,$4,$5,null,null,$6)',
      [item, 'receive', 2, 2, 'Duplicate-safe receipt', requestId],
    ));
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 12);
    await assert.rejects(asRole(database, 'authenticated', adminId, () => database.query(
      'select public.admin_inventory_action($1,null,$2,$3,$4,$5,null,null,$6)',
      [item, 'receive', 3, 2, 'Changed payload', requestId],
    )), /Request UUID was already used/);
    await assert.rejects(adminAction(database, item, null, 'correct', -1, 3, 'Invalid correction'), /Quantity is out of range/);
  } finally {
    await database.close();
  }
});

test('bulk event return requires a closed event, exact allocation versions and no active holds', async () => {
  const database = await createDatabase();
  try {
    const item = await makeItem(database);
    const event = await makeEvent(database);
    await configure(database, item, 'event');
    await asRole(database, 'authenticated', adminId, () => database.query(
      "select public.admin_inventory_action($1,$2,'allocate',8,null,'Initial allocation',null,null,null)", [item, event],
    ));
    const expected = [{ menu_item_id: item, version: 0, remaining: 8 }];
    await assert.rejects(asRole(database, 'authenticated', adminId, () => database.query(
      'select public.admin_return_event_stock($1,$2,$3)', [event, expected, 'Return leftovers'],
    )), /Close ordering or wait/);
    await database.query("update public.events set ordering_status='closed' where id=$1", [event]);
    await assert.rejects(asRole(database, 'authenticated', adminId, () => database.query(
      'select public.admin_return_event_stock($1,$2,$3)', [event, [{ ...expected[0], version: 2 }], 'Return leftovers'],
    )), /allocations changed/);
    await asRole(database, 'authenticated', adminId, () => database.query(
      'select public.admin_return_event_stock($1,$2,$3)', [event, expected, 'Return leftovers'],
    ));
    assert.equal((await database.query('select remaining from public.inventory_allocations where menu_item_id=$1 and event_id=$2', [item, event])).rows[0].remaining, 0);
  } finally {
    await database.close();
  }
});

test('event-only portions allocate independently without receipts and never change on_hand across sales waste or restoration', async () => {
  const database = await createDatabase();
  try {
    const { item, event, payload, reserve, pay } = await checkoutFixture(database, 1);
    // Use a fresh item so the path is exactly none -> event, with no receipt history.
    const portions = await makeItem(database, 'event-only-portions');
    await configure(database, portions, 'event');
    await adminAction(database, portions, event, 'allocate', 100, null, 'Prepared portions');
    await adminAction(database, portions, event, 'sale', 9, 0, 'Walk-up portions');
    assert.deepEqual((await database.query(`select i.on_hand,a.remaining from public.inventory_items i
      join public.inventory_allocations a using(menu_item_id) where i.menu_item_id=$1 and a.event_id=$2`,
    [portions, event])).rows[0], { on_hand: 0, remaining: 91 });
    const otherEvent = await makeEvent(database, 'other-portions-event');
    await adminAction(database, portions, otherEvent, 'allocate', 200, null, 'Independent portions');
    const order = await reserve({ ...payload, lines: [{ ...payload.lines[0], itemId: portions }] });
    assert.equal((await database.query('select available_quantity from public.get_event_stock($1,null) where menu_item_id=$2', [event, portions])).rows[0].available_quantity, 90);
    assert.equal(await pay(order), false);
    await asRole(database, 'authenticated', adminId, () =>
      database.query("select public.admin_set_order_status($1,'cancelled','Return portions')", [order.id]));
    await asRole(database, 'authenticated', adminId, () =>
      database.query("select public.admin_restock_order($1,'Unused portions restored')", [order.id]));
    await adminAction(database, portions, event, 'waste', 1, 3, 'Dropped portion');
    const cash = await makeOrder(database, event, portions, { method: 'cash', quantity: 2 });
    assert.equal((await database.query('select state from public.inventory_order_stock where order_id=$1', [cash])).rows[0].state, 'sold');
    assert.deepEqual((await database.query(`select i.on_hand,a.remaining from public.inventory_items i
      join public.inventory_allocations a using(menu_item_id) where i.menu_item_id=$1 and a.event_id=$2`,
    [portions, event])).rows[0], { on_hand: 0, remaining: 88 });
    assert.equal((await database.query('select remaining from public.inventory_allocations where menu_item_id=$1 and event_id=$2', [portions, otherEvent])).rows[0].remaining, 200);
    await assert.rejects(adminAction(database, portions, null, 'receive', 1, 2, 'Invalid receipt'), /requires global tracking/);
    assert.equal((await database.query("select count(*)::integer as n from public.inventory_movements where menu_item_id=$1 and action='receive'", [portions])).rows[0].n, 0);
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 1);
  } finally { await database.close(); }
});

test('checkout holds expire, successful payment consumes once, late payment cancels for refund, and restock is explicit', async () => {
  const database = await createDatabase();
  try {
    await database.exec("update public.business_settings set ordering_status='open',card_enabled=true");
    const item = await makeItem(database);
    const event = await makeEvent(database);
    await configure(database, item, 'global');
    await adminAction(database, item, null, 'receive', 1, 1, 'Opening receipt');
    await adminAction(database, item, event, 'allocate', 1, null);

    const paidOrder = await makeOrder(database, event, item);
    assert.equal((await database.query(
      'select state,quantity from public.inventory_order_stock where order_id=$1', [paidOrder],
    )).rows[0].state, 'held');
    assert.equal((await database.query(
      'select available_quantity from public.get_event_stock($1,null) where menu_item_id=$2', [event, item],
    )).rows[0].available_quantity, 0);
    await assert.rejects(configure(database, item, 'global', 3), /active commitments exist/);
    await assert.rejects(adminAction(database, item, event, 'allocate', 1, 0), /Active checkout holds/);
    const completion = (await asRole(database, 'service_role', null, () => database.query(
      "select public.process_stripe_checkout('evt_stock_paid','checkout.session.completed',$1,'cs_stock_paid','pi_stock_paid',500,'gbp') as refund",
      [paidOrder],
    ))).rows[0];
    assert.equal(completion.refund, false);
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 0);
    const duplicateWebhook = (await asRole(database, 'service_role', null, () => database.query(
      "select public.process_stripe_checkout('evt_stock_paid','checkout.session.completed',$1,'cs_stock_paid','pi_stock_paid',500,'gbp') as refund",
      [paidOrder],
    ))).rows[0];
    assert.equal(duplicateWebhook.refund, false);
    assert.equal((await database.query('select count(*)::integer as count from public.inventory_movements where order_id=$1 and action=\'sale\'', [paidOrder])).rows[0].count, 1);
    assert.equal((await database.query('select state from public.inventory_order_stock where order_id=$1', [paidOrder])).rows[0].state, 'sold');
    await database.query("update public.orders set status='cancelled',cancellation_reason='Customer cancelled' where id=$1", [paidOrder]);
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 0);
    assert.equal((await database.query('select state from public.inventory_order_stock where order_id=$1', [paidOrder])).rows[0].state, 'sold');
    await asRole(database, 'authenticated', adminId, () => database.query(
      "select public.admin_restock_order($1,'Customer cancellation restoration')", [paidOrder],
    ));
    await asRole(database, 'authenticated', adminId, () => database.query(
      "select public.admin_restock_order($1,'Retry must be harmless')", [paidOrder],
    ));
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 1);
    assert.equal((await database.query('select state from public.inventory_order_stock where order_id=$1', [paidOrder])).rows[0].state, 'restocked');
    await assert.rejects(database.exec('update public.order_items set quantity=2 where order_id=' + `'${paidOrder}'`), /inventory snapshots are immutable/);

    const cancelOrder = await makeOrder(database, event, item);
    await database.query("update public.orders set status='cancelled',cancellation_reason='Customer cancelled' where id=$1", [cancelOrder]);
    assert.equal((await database.query('select state from public.inventory_order_stock where order_id=$1', [cancelOrder])).rows[0].state, 'released');
    const lateOrder = await makeOrder(database, event, item);
    await database.query("update public.inventory_order_stock set expires_at=now()-interval '1 minute' where order_id=$1", [lateOrder]);
    await adminAction(database, item, event, 'sale', 1, 2, 'Walk-up after checkout expired');
    const lateResult = (await asRole(database, 'service_role', null, () => database.query(
      "select public.process_stripe_checkout('evt_stock_late','checkout.session.completed',$1,'cs_stock_late','pi_stock_late',500,'gbp') as refund",
      [lateOrder],
    ))).rows[0];
    assert.equal(lateResult.refund, true);
    const state = (await database.query(
      'select o.status,o.payment_status,s.state from public.orders o join public.inventory_order_stock s on s.order_id=o.id where o.id=$1',
      [lateOrder],
    )).rows[0];
    assert.deepEqual(state, { status: 'cancelled', payment_status: 'paid', state: 'released' });
    assert.equal((await database.query('select on_hand from public.inventory_items where menu_item_id=$1', [item])).rows[0].on_hand, 0);
  } finally {
    await database.close();
  }
});

test('cash acceptance deducts aggregated duplicate item lines exactly once', async () => {
  const database = await createDatabase();
  try {
    await database.exec("update public.business_settings set ordering_status='open'");
    const item = await makeItem(database);
    const event = await makeEvent(database);
    await configure(database, item, 'global');
    await adminAction(database, item, null, 'receive', 3, 1, 'Opening receipt');
    await adminAction(database, item, event, 'allocate', 3, null);
    const order = await makeOrder(database, event, item, { method: 'cash', quantity: 2, duplicateLines: true });
    const stock = (await database.query(
      'select quantity,state from public.inventory_order_stock where order_id=$1', [order],
    )).rows[0];
    assert.deepEqual(stock, { quantity: 2, state: 'sold' });
    assert.deepEqual((await database.query(
      'select on_hand from public.inventory_items where menu_item_id=$1', [item],
    )).rows[0], { on_hand: 1 });
    await asRole(database, 'authenticated', adminId, () => database.query(
      'select public.admin_mark_cash_paid($1)', [order],
    ));
    assert.equal((await database.query(
      'select on_hand from public.inventory_items where menu_item_id=$1', [item],
    )).rows[0].on_hand, 1);
    assert.equal((await database.query(
      "select count(*)::integer as count from public.inventory_movements where order_id=$1 and action='sale'", [order],
    )).rows[0].count, 2);
  } finally {
    await database.close();
  }
});

test('public stock hides global totals, private events require the saved access key, and inventory reads are admin-only', async () => {
  const database = await createDatabase();
  try {
    const item = await makeItem(database);
    const untrackedItem = await makeItem(database, 'untracked-stock-item');
    const event = await makeEvent(database);
    const privateEvent = await makeEvent(database, 'private-stock-event', true);
    await configure(database, item, 'global');
    await adminAction(database, item, null, 'receive', 5, 1, 'Opening receipt');
    await database.exec("update public.business_settings set ordering_status='open',card_enabled=true");
    await assert.rejects(makeOrder(database, event, item), /Stock changed\. Review your bag before paying\./);
    const noEvent = (await database.query('select * from public.get_event_stock() where menu_item_id=$1', [item])).rows[0];
    assert.equal(noEvent.available_quantity, null);
    const untracked = (await database.query('select * from public.get_event_stock($1,null) where menu_item_id=$2', [event, untrackedItem])).rows[0];
    assert.equal(untracked.tracking_mode, 'none');
    assert.equal(untracked.available_quantity, null);
    const selected = (await database.query('select * from public.get_event_stock($1,null) where menu_item_id=$2', [event, item])).rows[0];
    assert.equal(selected.available_quantity, 0);
    await assert.rejects(database.query('select * from public.get_event_stock($1,null)', [privateEvent]), /Event access required/);
    const key = (await asRole(database, 'authenticated', adminId, () => database.query(
      'select * from public.admin_event_ordering_key($1)', [privateEvent],
    ))).rows[0].access_key;
    assert.equal((await database.query('select count(*)::integer as count from public.get_event_stock($1,$2)', [privateEvent, key])).rows[0].count, 2);
    await asRole(database, 'anon', null, async () => {
      await assert.rejects(database.query('select * from public.inventory_items'), /permission denied/);
    });
    await asRole(database, 'authenticated', customerId, async () => {
      assert.equal((await database.query('select * from public.inventory_items')).rows.length, 0);
      await assert.rejects(database.query(
        "select public.admin_inventory_action($1,null,'receive',1,1,'Forged',null,null,null)", [item],
      ), /Admin access required/);
    });
    await asRole(database, 'authenticated', adminId, async () => {
      assert.equal((await database.query('select * from public.inventory_items where menu_item_id=$1', [item])).rows.length, 1);
      assert.equal((await database.query('select * from public.inventory_movements where menu_item_id=$1', [item])).rows.length, 2);
      await assert.rejects(database.exec('update public.inventory_items set on_hand=999'), /permission denied/);
    });
    await asRole(database, 'service_role', null, async () => {
      assert.equal((await database.query('select * from public.inventory_items where menu_item_id=$1', [item])).rows.length, 1);
      await assert.rejects(database.exec('update public.inventory_items set on_hand=999'), /permission denied/);
    });
  } finally {
    await database.close();
  }
});
