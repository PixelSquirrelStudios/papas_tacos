import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { adminUpdateTables, publicUpdateTables } from '../src/lib/site-updates.ts';

const admin = '00000000-0000-4000-8000-000000000001';
const customer = '00000000-0000-4000-8000-000000000002';
const sqlDirectory = new URL('../supabase/sql/', import.meta.url);

async function database({ linked = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  for (const file of (await readdir(sqlDirectory)).filter(file => file.endsWith('.sql')).sort()) {
    if (!linked && file === '051_linked_menu_items.sql') continue;
    await db.exec(await readFile(new URL(file, sqlDirectory), 'utf8'));
  }
  await db.query(`insert into auth.users(id,email) values($1,'admin@example.test'),($2,'customer@example.test')`, [admin, customer]);
  await db.query("update public.profiles set role='admin' where id=$1", [admin]);
  await db.exec("update public.business_settings set ordering_status='open',card_enabled=true");
  return db;
}

async function role(db, name, user, action) {
  await db.exec(`set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  try { return await action(); }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}

test('public menu visibility defaults on, is admin-only to update and does not disable event checkout', async () => {
  const db = await database();
  try {
    assert.equal((await db.query('select public_menu_enabled from public.business_settings')).rows[0].public_menu_enabled, true);
    await role(db, 'authenticated', customer, async () => {
      assert.equal((await db.query('update public.admin_business_settings set public_menu_enabled=false returning singleton')).rows.length, 0);
    });
    await role(db, 'authenticated', admin, async () => {
      assert.equal((await db.query('update public.admin_business_settings set public_menu_enabled=false returning public_menu_enabled')).rows[0].public_menu_enabled, false);
    });
    await role(db, 'anon', null, async () => {
      assert.equal((await db.query('select public_menu_enabled from public.business_settings')).rows[0].public_menu_enabled, false);
    });
    await db.exec(await readFile(new URL('052_public_menu_visibility.sql', sqlDirectory), 'utf8'));
    assert.equal((await db.query('select public_menu_enabled from public.business_settings')).rows[0].public_menu_enabled, false);
    const f = await fixture(db);
    const product = await f.item('Event Product', 200);
    const order = await f.reserve(f.body([{ itemId: product, optionIds: [], quantity: 1 }], 200));
    assert.ok(order.id);
  } finally { await db.close(); }
});

test('realtime publication covers subscribed admin and public tables and upgrade is repeatable', async () => {
  const db = await database();
  try {
    await db.exec(await readFile(new URL('053_admin_realtime.sql', sqlDirectory), 'utf8'));
    const published = (await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'")).rows.map((row) => row.tablename);
    for (const table of [...publicUpdateTables, ...adminUpdateTables]) assert.ok(published.includes(table), `${table} must publish Realtime changes`);
    await role(db, 'authenticated', customer, async () => {
      for (const table of ['inventory_items', 'inventory_allocations', 'inventory_movements', 'inventory_order_stock', 'payments']) {
        assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
      }
    });
  } finally { await db.close(); }
});

async function fixture(db) {
  const category = (await db.query("insert into public.menu_categories(name,slug,is_published) values('Linked','linked',true) returning id")).rows[0].id;
  const event = (await db.query(`
    insert into public.events(slug,title,venue_name,address_line_1,town,postcode,starts_at,ends_at,
      is_published,pickup_enabled,ordering_status,service_mode,orders_open_at)
    values('linked','Linked','Venue','Street','Town','AB1 2CD',now()-interval '1 hour',
      now()+interval '5 hours',true,true,'open','car',now()-interval '1 hour') returning id
  `)).rows[0].id;
  const section = (await db.query("insert into public.menu_set_sections(menu_set_id,title) select id,'Linked' from public.menu_sets where is_default returning id,menu_set_id")).rows[0];
  async function item(name, price = 500, kind = 'product', standalone = true, membership = true) {
    const id = (await db.query(`
      insert into public.menu_items(category_id,name,slug,price_pence,item_kind,show_standalone,
        is_published,is_available,allergens,description,image_path)
      values($1,$2,$3,$4,$5,$6,true,true,'{milk}','Real description','real.webp') returning id
    `, [category, name, `item-${crypto.randomUUID()}`, price, kind, standalone])).rows[0].id;
    if (membership) await db.query('insert into public.menu_set_items(menu_set_id,section_id,menu_item_id) values($1,$2,$3)', [section.menu_set_id, section.id, id]);
    return id;
  }
  async function group(parent = null, min = 1, max = 1) {
    const id = (await db.query("insert into public.modifier_groups(name,min_selections,max_selections,is_published) values('Choose',$1,$2,true) returning id", [min, max])).rows[0].id;
    if (parent) await db.query('insert into public.menu_item_modifier_groups(menu_item_id,modifier_group_id) values($1,$2)', [parent, id]);
    return id;
  }
  async function option(groupId, target = null, quantity = 1, mode = 'item', price = 0) {
    return (await db.query(`
      insert into public.modifier_options(modifier_group_id,name,price_pence,allergens,
        linked_menu_item_id,linked_quantity,pricing_mode)
      values($1,'Stale manual name',$2,'{eggs}',$3,$4,$5) returning id
    `, [groupId, price, target, quantity, mode])).rows[0].id;
  }
  async function inventory(id, quantity, mode = 'global') {
    await role(db, 'authenticated', admin, () => db.query(
      "select public.admin_inventory_action($1,null,'configure',0,0,'Configure',$2,'each')", [id, mode]));
    if (mode === 'global') await role(db, 'authenticated', admin, () => db.query(
      "select public.admin_inventory_action($1,null,'receive',$2,1,'Opening receipt')", [id, quantity]));
    await role(db, 'authenticated', admin, () => db.query(
      "select public.admin_inventory_action($1,$2,'allocate',$3,null,'Opening allocation')", [id, event, quantity]));
  }
  const body = (lines, total) => ({
    eventId: event, locationNumber: '27', name: 'Customer', email: 'customer@example.test',
    phone: '07000000000', note: '', expectedTotal: total, lines,
  });
  const reserve = async (payload, key = crypto.randomUUID()) => role(db, 'service_role', null, async () =>
    (await db.query('select * from public.reserve_card_order($1,$2,$3)', [customer, key, payload])).rows[0]);
  const pay = async (order, occurredAt = null) => role(db, 'service_role', null, async () =>
    (await db.query(`select public.process_stripe_checkout($1,'checkout.session.completed',$2,$3,$4,$5,'gbp',$6) as refund`,
      [`evt_${order.id}`, order.id, `cs_${order.id}`, `pi_${order.id}`, order.total_pence, occurredAt])).rows[0].refund);
  return { category, event, item, group, option, inventory, body, reserve, pay };
}

const line = (itemId, optionIds = [], quantity = 1) => ({ itemId, optionIds, quantity });
const stocks = async (db, order) => (await db.query(
  'select menu_item_id,quantity,state from public.inventory_order_stock where order_id=$1 order by menu_item_id', [order.id])).rows;

test('real checkout aggregates direct, two group parents, nested repeated paths and quantities into shared stock', async () => {
  const db = await database();
  try {
    const f = await fixture(db);
    const child = await f.item('Real can', 125);
    const first = await f.item('Two cans', 0, 'group');
    const second = await f.item('Meal', 0, 'group');
    const root = await f.group(first);
    const nestedA = await f.group();
    const nestedB = await f.group();
    const repeated = await f.group();
    await db.query('update public.modifier_groups set child_group_ids=$2 where id=$1', [root, [nestedA, nestedB]]);
    await db.query('update public.modifier_groups set child_group_ids=$2 where id=any($1)', [[nestedA, nestedB], [repeated]]);
    const included = await f.option(root, null, 1, 'extra', 0);
    const a = await f.option(nestedA, null, 1, 'extra', 0);
    const b = await f.option(nestedB, null, 1, 'extra', 0);
    const shared = await f.option(repeated, child, 2);
    const otherGroup = await f.group(second);
    const extra = await f.option(otherGroup, child, 3, 'extra', 40);
    await db.query('update public.menu_set_items set price_pence=200 where menu_item_id=$1', [child]);
    await f.inventory(child, 20);
    const keys = [included, `${root}/${nestedA}:${a}`, `${root}/${nestedB}:${b}`,
      `${root}/${nestedA}/${repeated}:${shared}`, `${root}/${nestedB}/${repeated}:${shared}`];
    const payload = f.body([line(child, [], 2), line(first, keys, 2), line(second, [extra], 2)], 1480);
    const key = crypto.randomUUID();
    const order = await f.reserve(payload, key);
    assert.equal((await f.reserve(payload, key)).id, order.id);
    assert.deepEqual(await stocks(db, order), [{ menu_item_id: child, quantity: 16, state: 'held' }]);
    const snapshots = (await db.query(`
      select m.* from public.order_item_modifiers m join public.order_items i on i.id=m.order_item_id
      where i.order_id=$1 and m.linked_menu_item_id is not null order by m.unit_price_pence
    `, [order.id])).rows;
    assert.deepEqual(snapshots.map(m => m.unit_price_pence), [40, 250, 250]);
    assert.deepEqual(snapshots.map(m => m.linked_quantity), [3, 2, 2]);
    assert.ok(snapshots.every(m => m.option_name === 'Real can' && m.allergen_snapshot.join() === 'milk'));
    assert.equal(new Set(snapshots.map(m => m.selection_key)).size, 3);
    const firstSnapshot = (await db.query('select allergen_snapshot from public.order_items where order_id=$1 and menu_item_id=$2', [order.id, first])).rows[0];
    assert.deepEqual(firstSnapshot.allergen_snapshot.sort(), ['eggs', 'milk']);
    const before = (await db.query('select count(*)::int n from public.orders')).rows[0].n;
    await assert.rejects(f.reserve(f.body([line(first, keys, 2)], 1000)), /Stock changed/);
    assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n, before);
    assert.equal(await f.pay(order), false);
    assert.equal(await f.pay(order), false);
    assert.deepEqual(await stocks(db, order), [{ menu_item_id: child, quantity: 16, state: 'sold' }]);
    assert.equal((await db.query('select on_hand from public.inventory_items where menu_item_id=$1', [child])).rows[0].on_hand, 4);
    await db.query("update public.orders set status='cancelled',cancellation_reason='Cancelled' where id=$1", [order.id]);
    for (let n = 0; n < 2; n++) await role(db, 'authenticated', admin, () => db.query("select public.admin_restock_order($1,'Restore')", [order.id]));
    assert.equal((await db.query('select on_hand from public.inventory_items where menu_item_id=$1', [child])).rows[0].on_hand, 20);
    assert.equal((await stocks(db, order))[0].state, 'restocked');
    for (const sql of [
      'update public.order_item_modifiers set linked_quantity=1',
      'update public.order_item_modifiers set order_item_id=gen_random_uuid()',
      'delete from public.order_item_modifiers',
      'update public.order_items set quantity=1',
    ]) await assert.rejects(db.exec(sql), /snapshots are immutable/);
    await db.query("update public.menu_items set name='Changed',allergens='{soya}',price_pence=300 where id=$1", [child]);
    assert.equal((await db.query('select option_name from public.order_item_modifiers where id=$1', [snapshots[0].id])).rows[0].option_name, 'Real can');
  } finally { await db.close(); }
});

test('tracked product parents consume parent and child, while hidden non-menu link targets remain valid', async () => {
  const db = await database();
  try {
    const f = await fixture(db);
    const parent = await f.item('Product parent', 500);
    const child = await f.item('Hidden child', 100, 'product', false, false);
    const group = await f.group(parent);
    const option = await f.option(group, child, 2);
    await f.inventory(parent, 3);
    await f.inventory(child, 5, 'event');
    const order = await f.reserve(f.body([line(parent, [option], 2)], 1400));
    assert.deepEqual((await stocks(db, order)).map(s => [s.menu_item_id, s.quantity]).sort(), [[parent, 2], [child, 4]].sort());
    await assert.rejects(f.reserve(f.body([line(child)], 100)), /menu item is no longer available/);
    await db.query('update public.menu_items set show_standalone=true where id=$1', [child]);
    await assert.rejects(f.reserve(f.body([line(child)], 100)), /not on the menu/);
    const stock = (await db.query('select * from public.get_event_stock($1,null) where menu_item_id=$2', [f.event, child])).rows[0];
    assert.equal(stock.available_quantity, 1);
    await db.query("update public.orders set status='cancelled',cancellation_reason='Cancel hold' where id=$1", [order.id]);
    assert.ok((await stocks(db, order)).every(s => s.state === 'released'));
    await assert.rejects(db.query(`
      insert into public.order_item_modifiers(order_item_id,group_name,option_name,unit_price_pence)
      select id,'Forged','Forged',0 from public.order_items where order_id=$1 limit 1
    `, [order.id]), /snapshots are immutable/);
  } finally { await db.close(); }
});

test('availability requires manual choice and published available unarchived product and category; required sold-out rolls back', async () => {
  const db = await database();
  try {
    const f = await fixture(db);
    const parent = await f.item('Container', 0, 'group');
    const child = await f.item('Child', 100, 'product', false, false);
    const group = await f.group(parent);
    const option = await f.option(group, child);
    const payload = f.body([line(parent, [option])], 100);
    await assert.rejects(f.reserve(f.body([line(parent)], 0)), /required choices/);
    for (const [sql, reset] of [
      ['update public.modifier_options set is_available=false', 'update public.modifier_options set is_available=true'],
      [`update public.menu_items set is_published=false where id='${child}'`, `update public.menu_items set is_published=true where id='${child}'`],
      [`update public.menu_items set is_available=false where id='${child}'`, `update public.menu_items set is_available=true where id='${child}'`],
      [`update public.menu_items set archived_at=now() where id='${child}'`, `update public.menu_items set archived_at=null where id='${child}'`],
      ["update public.menu_categories set is_published=false", "update public.menu_categories set is_published=true"],
    ]) {
      await db.exec(sql);
      await assert.rejects(f.reserve(payload), /no longer available/);
      await db.exec(reset);
    }
    await f.inventory(child, 1);
    const order = await f.reserve(payload);
    await assert.rejects(f.reserve(payload), /Stock changed/);
    assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n, 1);
    assert.equal((await stocks(db, order))[0].quantity, 1);
    const empty = await f.item('Invalid container', 0, 'group');
    await assert.rejects(f.reserve(f.body([line(empty)], 0)), /Group items require at least one required choice/);
    const optional = await f.group(empty, 0);
    await f.option(optional, child);
    await assert.rejects(f.reserve(f.body([line(empty)], 0)), /Group items require at least one required choice/);
    await db.query('update public.modifier_groups set min_selections=1 where id=$1', [optional]);
    const ordinary = await f.option(optional, null, 1, 'extra', 100);
    await assert.rejects(f.reserve(f.body([line(empty, [ordinary])], 100)), /Group items require at least one selected linked product/);
    const freeChild = await f.item('Intentional free child', 100, 'product', false, false);
    const free = await f.option(optional, freeChild, 2, 'extra', 0);
    await assert.rejects(f.reserve(f.body([line(empty, [free])], 0)), /Card orders must total at least/);
    const paid = await f.item('Paid accompanying item', 100);
    const freeOrder = await f.reserve(f.body([line(empty, [free]), line(paid)], 100));
    assert.equal(freeOrder.subtotal_pence, 100);
  } finally { await db.close(); }
});

test('catalogue guards reject group/self/complex references, double charging, group tracking and stale admin writes', async () => {
  const db = await database();
  try {
    const f = await fixture(db);
    const parent = await f.item('Container', 0, 'group');
    const simple = await f.item('Simple', 100);
    const complex = await f.item('Customisable', 200);
    const group = await f.group(parent);
    const complexGroup = await f.group(complex);
    for (const target of [parent, complex]) await assert.rejects(f.option(group, target), /simple product without any modifier groups/);
    await assert.rejects(f.option(complexGroup, complex), /simple product without any modifier groups/);
    const option = await f.option(group, simple);
    await assert.rejects(db.query('insert into public.menu_item_modifier_groups(menu_item_id,modifier_group_id) values($1,$2)', [simple, complexGroup]), /simple product without any modifier groups/);
    await assert.rejects(db.query("update public.menu_items set item_kind='group',price_pence=0 where id=$1", [simple]), /simple product/);
    await assert.rejects(db.query('delete from public.menu_items where id=$1', [simple]), /foreign key/);
    await assert.rejects(db.query('update public.modifier_options set price_pence=10 where id=$1', [option]), /modifier_options_link_pricing/);
    await assert.rejects(f.option(group, null, 2, 'extra'), /modifier_options_link_pricing/);
    await assert.rejects(f.option(group, null), /modifier_options_link_pricing/);
    for (const quantity of [0, 100]) await assert.rejects(f.option(group, simple, quantity), /linked_quantity_check/);
    await assert.rejects(db.query('update public.menu_items set price_pence=1 where id=$1', [parent]), /menu_items_group_price/);
    await assert.rejects(db.query('update public.menu_set_items set price_pence=1 where menu_item_id=$1', [parent]), /Group items must have zero base price/);
    await assert.rejects(f.inventory(parent, 1), /Group items cannot track inventory/);
    const tracked = await f.item('Tracked', 100);
    await f.inventory(tracked, 1);
    await assert.rejects(db.query("update public.menu_items set item_kind='group',price_pence=0 where id=$1", [tracked]), /reconcile product stock/);
    await db.query('update public.modifier_groups set is_published=false where id=$1', [complexGroup]);
    await assert.rejects(f.option(group, complex), /simple product/);
    for (const [name, user] of [['anon', null], ['authenticated', customer]]) {
      await role(db, name, user, async () => {
        await assert.rejects(db.query("select public.admin_inventory_action($1,null,'configure',0,0,'Forged','global','each')", [parent]), /permission denied|Admin access required/);
        await assert.rejects(db.query('select * from public.reserve_card_order($1,$2,$3)', [customer, crypto.randomUUID(), {}]), /permission denied/);
        if (name === 'anon') {
          await assert.rejects(db.query('update public.modifier_options set linked_quantity=99 where id=$1', [option]), /permission denied/);
        } else {
          assert.equal((await db.query('update public.modifier_options set linked_quantity=99 where id=$1 returning id', [option])).rows.length, 0);
        }
      });
    }
    const values = {
      category_id: f.category, name: 'Saved container', slug: 'saved-container', description: '',
      price_pence: 0, image_alt: '', dietary_tags: [], allergens: [], allergen_note: '',
      is_published: true, is_available: true, is_featured: false, is_crowd_favourite: false,
      item_kind: 'group', show_standalone: false,
    };
    const saved = (await role(db, 'authenticated', admin, () => db.query('select * from public.admin_save_menu_item(null,null,$1,$2)', [values, [group]]))).rows[0];
    assert.equal(saved.item_kind, 'group');
    assert.equal(saved.show_standalone, false);
    const updated = (await role(db, 'authenticated', admin, () => db.query(
      'select * from public.admin_save_menu_item($1,$2,$3,$4)',
      [saved.id, saved.updated_at, { ...values, show_standalone: true }, [group]],
    ))).rows[0];
    assert.equal(updated.item_kind, 'group');
    assert.equal(updated.show_standalone, true);
    await assert.rejects(role(db, 'authenticated', admin, () => db.query('select * from public.admin_save_menu_item($1,null,$2,$3)', [saved.id, values, [group]])), /Item changed/);
  } finally { await db.close(); }
});

test('expired linked holds reused by another checkout refund delayed timely payment without overselling', async () => {
  const db = await database();
  try {
    const f = await fixture(db);
    const parent = await f.item('Container', 0, 'group');
    const child = await f.item('Only can', 100, 'product', false, false);
    const option = await f.option(await f.group(parent), child, 2);
    await f.inventory(child, 2);
    const payload = f.body([line(parent, [option])], 200);
    const first = await f.reserve(payload);
    const timely = (await db.query('select now() as instant')).rows[0].instant;
    await db.query("update public.inventory_order_stock set expires_at=now()-interval '1 minute' where order_id=$1", [first.id]);
    const second = await f.reserve(payload);
    assert.equal(await f.pay(second), false);
    assert.equal(await f.pay(first, timely), true);
    assert.equal((await db.query('select status from public.orders where id=$1', [first.id])).rows[0].status, 'cancelled');
    assert.equal((await stocks(db, first))[0].state, 'released');
    assert.equal((await stocks(db, second))[0].state, 'sold');
    assert.equal((await db.query('select on_hand from public.inventory_items where menu_item_id=$1', [child])).rows[0].on_hand, 0);
    assert.equal((await db.query("select count(*)::int n from public.inventory_movements where menu_item_id=$1 and action='sale'", [child])).rows[0].n, 1);
  } finally { await db.close(); }
});

test('item pricing supports 99 linked units without the old ordinary-option snapshot ceiling', async () => {
  const db = await database();
  try {
    const f = await fixture(db);
    const parent = await f.item('Container', 0, 'group');
    const child = await f.item('High-value product', 100000, 'product', false, false);
    const option = await f.option(await f.group(parent), child, 99);
    const order = await f.reserve(f.body([line(parent, [option])], 9900000));
    assert.equal(order.subtotal_pence, 9900000);
    const snapshot = (await db.query(`
      select m.unit_price_pence,m.linked_quantity from public.order_item_modifiers m
      join public.order_items i on i.id=m.order_item_id where i.order_id=$1
    `, [order.id])).rows[0];
    assert.deepEqual(snapshot, { unit_price_pence: 9900000, linked_quantity: 99 });
  } finally { await db.close(); }
});

test('activation rejects active orders with maintenance instructions and preserves historical rows', async () => {
  const db = await database({ linked: false });
  try {
    const f = await fixture(db);
    // This fixture predates the linked columns.
    const item = (await db.query("insert into public.menu_items(category_id,name,slug,price_pence,is_published) values($1,'Legacy','legacy',100,true) returning id", [f.category])).rows[0].id;
    await db.query("insert into public.menu_set_items(menu_set_id,section_id,menu_item_id) select menu_set_id,id,$1 from public.menu_set_sections limit 1", [item]);
    const order = await f.reserve(f.body([line(item)], 100));
    const migration = await readFile(new URL('051_linked_menu_items.sql', sqlDirectory), 'utf8');
    await assert.rejects(db.exec(migration), /ordering maintenance window.*051_linked_menu_items.sql after 050/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n, 1);
    await db.query("update public.orders set status='cancelled',cancellation_reason='Maintenance' where id=$1", [order.id]);
    await db.exec(migration);
    assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n, 1);
    assert.equal((await db.query('select item_kind from public.menu_items where id=$1', [item])).rows[0].item_kind, 'product');
  } finally { await db.close(); }
});
