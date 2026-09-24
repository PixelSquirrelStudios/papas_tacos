import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { categorySchema, itemSchema, groupSchema, optionSchema, associationSchema } from '../src/lib/catalogue/types.ts';
import { parseBag, quoteLine } from '../src/lib/bag.ts';
import { aboutDefaults } from '../src/lib/catalogue/about.ts';

const adminId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000002';
const otherCustomerId = '00000000-0000-4000-8000-000000000003';
const eventId = '00000000-0000-4000-8000-000000000010';
const slotId = '00000000-0000-4000-8000-000000000020';
const sqlDirectory = new URL('../supabase/sql/', import.meta.url);

test('order confirmation delivery records are private, unique and preserve email snapshots', async () => {
  const database = await createDatabase();
  try {
    await enableOrdering(database);
    const order = await insertOrder(database);
    await asRole(database, 'service_role', null, async () => {
      await database.query('insert into public.order_confirmation_emails(order_id, payload) values ($1, $2)', [order.id, { to: 'customer@example.test', subject: 'Order confirmed' }]);
      await assert.rejects(database.query('insert into public.order_confirmation_emails(order_id, payload) values ($1, $2)', [order.id, {}]), /duplicate key/);
      await assert.rejects(database.query("update public.order_confirmation_emails set payload = '{}' where order_id = $1", [order.id]), /permission denied/);
      await database.query("update public.order_confirmation_emails set sent_at = now(), resend_email_id = 'email_123' where order_id = $1", [order.id]);
    });
    for (const [role, user] of [['anon', null], ['authenticated', customerId], ['authenticated', adminId]]) {
      await asRole(database, role, user, async () => {
        await assert.rejects(database.query('select * from public.order_confirmation_emails'), /permission denied/);
        await assert.rejects(database.query('insert into public.order_confirmation_emails(order_id, payload) values ($1, $2)', [order.id, {}]), /permission denied/);
      });
    }
    await database.exec(await readFile(new URL('030_order_confirmation_emails.sql', sqlDirectory), 'utf8'));
    const delivery = (await database.query('select * from public.order_confirmation_emails')).rows[0];
    assert.equal(delivery.resend_email_id, 'email_123');
    assert.equal(delivery.payload.subject, 'Order confirmed');
  } finally { await database.close(); }
});

test('Stripe checkout prices snapshots atomically and processes payment events once', async () => {
  const database = await createDatabase();
  try {
    await enableOrdering(database);
    const category = (await database.query("insert into public.menu_categories(name, slug, is_published) values ('Tacos', 'tacos', true) returning id")).rows[0].id;
    const item = (await database.query("insert into public.menu_items(category_id, name, slug, price_pence, is_published, is_available) values ($1, 'Test Taco', 'test-taco', 500, true, true) returning id", [category])).rows[0].id;
    const group = (await database.query("insert into public.modifier_groups(name, min_selections, max_selections, is_published) values ('Filling', 1, 1, true) returning id")).rows[0].id;
    const option = (await database.query("insert into public.modifier_options(modifier_group_id, name, price_pence, allergens) values ($1, 'Cheese', 100, array['milk']) returning id", [group])).rows[0].id;
    await database.query('insert into public.menu_item_modifier_groups(menu_item_id, modifier_group_id) values ($1, $2)', [item, group]);
    const payload = { slotId, name: 'Customer', email: 'customer@example.test', phone: '07000000000', note: '', expectedTotal: 1200, lines: [{ itemId: item, optionIds: [option], quantity: 2 }] };
    const reserve = (body = payload, key = crypto.randomUUID()) => database.query('select * from public.reserve_card_order($1, $2, $3)', [customerId, key, body]);
    for (const role of ['anon', 'authenticated']) await asRole(database, role, customerId, async () => {
      await assert.rejects(reserve(), /permission denied/);
      await assert.rejects(database.query("select public.process_stripe_checkout('fake', 'checkout.session.completed', $1, 'fake', 'fake', 1200, 'gbp')", [slotId]), /permission denied/);
    });
    await asRole(database, 'service_role', null, async () => {
      await assert.rejects(reserve({ ...payload, expectedTotal: 1 }), /Prices have changed/);
      await assert.rejects(reserve({ ...payload, lines: [{ itemId: item, optionIds: [], quantity: 2 }] }), /required choices/);
      await assert.rejects(reserve({ ...payload, lines: [{ itemId: item, optionIds: [option, option], quantity: 2 }] }), /choice/);
      assert.equal((await database.query('select * from public.orders')).rows.length, 0);
      const key = crypto.randomUUID();
      const order = (await reserve(payload, key)).rows[0];
      assert.equal(order.total_pence, 1200);
      assert.equal((await reserve(payload, key)).rows[0].id, order.id);
      await assert.rejects(reserve({ ...payload, note: 'Changed' }, key), /request changed/);
      assert.equal((await database.query('select * from public.order_items')).rows[0].line_total_pence, 1200);
      assert.deepEqual((await database.query('select * from public.order_items')).rows[0].allergen_snapshot, ['milk']);
      assert.equal((await database.query('select * from public.order_item_modifiers')).rows[0].option_name, 'Cheese');
      await database.query('select public.attach_stripe_checkout($1, $2, $3)', [order.id, 'cs_test_order', new Date(Date.now() + 31 * 60000).toISOString()]);
      await assert.rejects(database.query('select public.attach_stripe_checkout($1, $2, now())', [order.id, 'cs_test_other']), /does not match/);
      const paid = ['evt_paid', 'checkout.session.completed', order.id, 'cs_test_order', 'pi_test_order', 1200, 'gbp'];
      await assert.rejects(database.query('select public.process_stripe_checkout($1,$2,$3,$4,$5,$6,$7)', [...paid.slice(0, 5), 10, 'gbp']), /does not match/);
      for (let attempt = 0; attempt < 2; attempt++) await database.query('select public.process_stripe_checkout($1,$2,$3,$4,$5,$6,$7)', paid);
      assert.equal((await database.query('select * from public.stripe_webhook_events')).rows.length, 1);
      assert.equal((await database.query('select * from public.orders where id = $1', [order.id])).rows[0].status, 'ordered');
      await database.query("select public.process_stripe_checkout('evt_late_expiry','checkout.session.expired',$1,'cs_test_order',null,1200,'gbp')", [order.id]);
      assert.equal((await database.query('select payment_status from public.orders where id = $1', [order.id])).rows[0].payment_status, 'paid');
      const second = (await reserve()).rows[0];
      await database.query("update public.orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [second.id]);
      await assert.rejects(reserve(), /slot is full/);
      await database.query("select public.process_stripe_checkout('evt_expired','checkout.session.expired',$1,'cs_test_second',null,1200,'gbp')", [second.id]);
      const third = (await reserve()).rows[0];
      await assert.rejects(database.query('select public.cancel_card_checkout($1,$2)', [third.id, otherCustomerId]), /cannot be cancelled/);
      await database.query('select public.cancel_card_checkout($1,$2)', [third.id, customerId]);
      const latePayment = ['evt_cancelled_paid', 'checkout.session.completed', third.id, 'cs_test_third', 'pi_test_third', 1200, 'gbp'];
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await database.query('select public.process_stripe_checkout($1,$2,$3,$4,$5,$6,$7) as refund', latePayment);
        assert.equal(result.rows[0].refund, true);
      }
      assert.equal((await database.query('select status from public.orders where id = $1', [third.id])).rows[0].status, 'cancelled');
      await database.query("select public.process_stripe_refund('evt_refund','pi_test_order',1200)");
      await database.query("select public.process_stripe_refund('evt_refund_old','pi_test_order',500)");
      assert.equal((await database.query('select payment_status from public.orders where id = $1', [order.id])).rows[0].payment_status, 'refunded');
    });
    await database.exec(await readFile(new URL('029_stripe_checkout.sql', sqlDirectory), 'utf8'));
  } finally { await database.close(); }
});

test('maintenance allowlist removal preserves settings and restricts the rebuilt view to admins', async () => {
  const database = await createDatabase();
  try {
    assert.equal((await database.query("select column_name from information_schema.columns where table_schema = 'public' and table_name in ('business_settings', 'admin_business_settings') and column_name = 'maintenance_allowed_emails'")).rows.length, 0);
    for (const [role, userId] of [['anon', null], ['authenticated', customerId]]) {
      await asRole(database, role, userId, async () => {
        assert.equal((await database.query('select maintenance_enabled from public.business_settings')).rows[0].maintenance_enabled, false);
        assert.equal((await database.query('select * from public.business_settings')).rows.length, 1);
      });
    }
    await asRole(database, 'anon', null, async () => {
      await assert.rejects(database.query('select * from public.admin_business_settings'), /permission denied/);
    });
    await asRole(database, 'authenticated', customerId, async () => {
      assert.equal((await database.query('select * from public.admin_business_settings')).rows.length, 0);
      assert.equal((await database.query('update public.admin_business_settings set maintenance_enabled = true returning *')).rows.length, 0);
    });
    await asRole(database, 'authenticated', adminId, async () => {
      const row = (await database.query('update public.admin_business_settings set maintenance_enabled = true returning *')).rows[0];
      assert.equal(row.maintenance_enabled, true);
      assert.equal((await database.query('select * from public.admin_business_settings')).rows.length, 1);
    });
    const settings = (await database.query('select * from public.business_settings')).rows;
    await database.exec(await readFile(new URL('028_remove_maintenance_allowlist.sql', sqlDirectory), 'utf8'));
    assert.deepEqual((await database.query('select * from public.business_settings')).rows, settings);
  } finally { await database.close(); }
});

test('maintenance migration defaults off, preserves state, and restricts writes to admins', async () => {
  const database = await createDatabase();
  try {
    assert.equal((await database.query('select maintenance_enabled from public.business_settings')).rows[0].maintenance_enabled, false);
    await asRole(database, 'authenticated', customerId, async () => {
      assert.equal((await database.query('update public.business_settings set maintenance_enabled = true returning singleton')).rows.length, 0);
    });
    await asRole(database, 'authenticated', adminId, async () => {
      await database.query('update public.business_settings set maintenance_enabled = true');
    });
    await database.exec(await readFile(new URL('025_business_settings_maintenance.sql', sqlDirectory), 'utf8'));
    await asRole(database, 'anon', null, async () => {
      assert.equal((await database.query('select maintenance_enabled from public.business_settings')).rows[0].maintenance_enabled, true);
      await assert.rejects(database.query('update public.business_settings set maintenance_enabled = false'), /permission denied/);
    });
    await asRole(database, 'authenticated', adminId, async () => {
      await database.query('update public.business_settings set maintenance_enabled = false');
    });
    assert.equal((await database.query('select maintenance_enabled from public.business_settings')).rows[0].maintenance_enabled, false);
    await assert.rejects(database.query('update public.business_settings set maintenance_enabled = null'), /not-null/);
  } finally { await database.close(); }
});

test('About migration supplies defaults, preserves edits and allows only admin updates', async () => {
  const database = await createDatabase();
  try {
    const settings = (await database.query('select * from public.business_settings')).rows[0];
    for (const [key, value] of Object.entries(aboutDefaults)) assert.equal(settings[key], value);
    await asRole(database, 'authenticated', customerId, async () => {
      assert.equal((await database.query("update public.business_settings set about_heading = 'Not allowed' returning singleton")).rows.length, 0);
    });
    await asRole(database, 'authenticated', adminId, async () => {
      await database.query("update public.business_settings set about_heading = 'Our edited story', about_full_story = '<p>Our edited full story.</p>', about_image_path = 'images/menu/about.jpg', about_page_image_1_path = 'images/about/story-one.jpg', about_page_image_2_path = 'images/about/story-two.jpg', about_page_image_3_path = 'images/about/story-three.jpg'");
    });
    await database.exec(await readFile(new URL('021_business_settings_about.sql', sqlDirectory), 'utf8'));
    await database.exec(await readFile(new URL('022_business_settings_about_full_story.sql', sqlDirectory), 'utf8'));
    await database.exec(await readFile(new URL('024_business_settings_about_page_images.sql', sqlDirectory), 'utf8'));
    await asRole(database, 'anon', null, async () => {
      assert.equal((await database.query('select about_heading from public.business_settings')).rows[0].about_heading, 'Our edited story');
      assert.equal((await database.query('select about_full_story from public.business_settings')).rows[0].about_full_story, '<p>Our edited full story.</p>');
      assert.deepEqual((await database.query('select about_page_image_1_path, about_page_image_2_path, about_page_image_3_path from public.business_settings')).rows[0], { about_page_image_1_path: 'images/about/story-one.jpg', about_page_image_2_path: 'images/about/story-two.jpg', about_page_image_3_path: 'images/about/story-three.jpg' });
      await assert.rejects(database.query("update public.business_settings set about_heading = 'Not allowed'"), /permission denied/);
    });
  } finally { await database.close(); }
});

test('admin reorder and modifier assignment are atomic, scoped and role protected', async () => {
  const database = await createDatabase();
  try {
    await database.exec(await readFile(new URL('../supabase/seeds/001_client_menu.sql', import.meta.url), 'utf8'));
    const categories = (await database.query('select id from public.menu_categories order by sort_order, id')).rows.map((row) => row.id);
    await asRole(database, 'authenticated', customerId, async () => {
      await assert.rejects(database.query('select public.admin_reorder($1, $2, $3)', ['menu_categories', [...categories].reverse(), categories]), /Admin access required/);
      await assert.rejects(database.query('select public.admin_assign_modifier_groups($1, $2, now())', [categories[0], []]), /Admin access required/);
    });
    await asRole(database, 'authenticated', adminId, async () => {
      await database.query('select public.admin_reorder($1, $2, $3)', ['menu_categories', [...categories].reverse(), categories]);
      await assert.rejects(database.query('select public.admin_reorder($1, $2, $3)', ['menu_categories', categories, categories]), /List changed/);
      await assert.rejects(database.query('select public.admin_reorder($1, $2, $3)', ['orders', categories, categories]), /Unsupported/);
      const groupOrder = (await database.query('select id from public.modifier_groups order by sort_order, id')).rows.map((row) => row.id);
      await database.query('select public.admin_reorder($1, $2, $3)', ['modifier_groups', [...groupOrder].reverse(), groupOrder]);
      assert.deepEqual((await database.query('select id from public.modifier_groups order by sort_order, id')).rows.map((row) => row.id), [...groupOrder].reverse());
      await assert.rejects(database.query('select public.admin_reorder($1, $2, $3)', ['modifier_groups', groupOrder, groupOrder]), /List changed/);
      const items = (await database.query('select id, category_id from public.menu_items order by sort_order, id')).rows;
      const scope = items[0].category_id;
      const scopedIds = items.filter((row) => row.category_id === scope).map((row) => row.id);
      const outside = items.find((row) => row.category_id !== scope).id;
      await assert.rejects(database.query('select public.admin_reorder($1, $2, $3)', ['menu_items', scopedIds, scopedIds]), /Choose an ordering scope/);
      await assert.rejects(database.query('select public.admin_reorder($1, $2, $3, $4)', ['menu_items', [...scopedIds, outside], [...scopedIds, outside], scope]), /List changed/);
      await assert.rejects(database.query('select public.admin_reorder($1, $2, $3)', ['modifier_groups', [groupOrder[0], groupOrder[0]], [groupOrder[0], groupOrder[0]]]), /Invalid ordering list/);
      await database.query('select public.admin_reorder($1, $2, $3, $4)', ['menu_items', [...scopedIds].reverse(), scopedIds, scope]);
      assert.deepEqual((await database.query('select id from public.menu_items where category_id = $1 order by sort_order, id', [scope])).rows.map((row) => row.id), [...scopedIds].reverse());
      const item = (await database.query("select * from public.menu_items where slug = 'two-tacos'")).rows[0];
      const groups = (await database.query('select id from public.modifier_groups order by id limit 2')).rows.map((row) => row.id);
      await database.query('select public.admin_assign_modifier_groups($1, $2, $3)', [item.id, groups, item.updated_at]);
      assert.equal((await database.query('select * from public.menu_item_modifier_groups where menu_item_id = $1', [item.id])).rows.length, 2);
      await assert.rejects(database.query('select public.admin_assign_modifier_groups($1, $2, $3)', [item.id, [], item.updated_at]), /Item changed/);
    });
  } finally { await database.close(); }
});

test('client menu seed is repeatable, preserves edits, and keeps incomplete items off sale', async () => {
  const database = await createDatabase();
  try {
    const seed = await readFile(new URL('../supabase/seeds/001_client_menu.sql', import.meta.url), 'utf8');
    await database.exec(seed);
    await database.exec(seed);
    assert.equal((await database.query('select * from public.menu_categories')).rows.length, 5);
    assert.equal((await database.query('select * from public.menu_items')).rows.length, 13);
    assert.equal((await database.query('select * from public.modifier_groups')).rows.length, 6);
    assert.equal((await database.query('select * from public.modifier_options')).rows.length, 13);
    assert.equal((await database.query('select * from public.menu_item_modifier_groups')).rows.length, 10);
    for (const [table, schema] of [
      ['menu_categories', categorySchema], ['menu_items', itemSchema],
      ['modifier_groups', groupSchema], ['modifier_options', optionSchema],
      ['menu_item_modifier_groups', associationSchema],
    ]) {
      for (const row of (await database.query(`select * from public.${table}`)).rows) schema.parse(row);
    }
    assert.equal((await database.query('select * from public.menu_items where is_available')).rows.length, 0);
    const tacos = (await database.query("select slug, price_pence from public.menu_items where slug in ('two-tacos', 'three-tacos') order by price_pence")).rows;
    assert.deepEqual(tacos, [{ slug: 'two-tacos', price_pence: 800 }, { slug: 'three-tacos', price_pence: 1000 }]);
    const fillings = (await database.query(`
      select groups.min_selections, groups.max_selections, options.id, options.name
      from public.menu_items item
      join public.menu_item_modifier_groups link on link.menu_item_id = item.id
      join public.modifier_groups groups on groups.id = link.modifier_group_id
      join public.modifier_options options on options.modifier_group_id = groups.id
      where item.slug = 'three-tacos' and options.name = 'Ember Chicken'
    `)).rows;
    assert.equal(fillings.length, 3);
    assert.equal(new Set(fillings.map((option) => option.id)).size, 3);
    assert.ok(fillings.every((option) => option.min_selections === 1 && option.max_selections === 1));
    const taco = (await database.query("select * from public.menu_items where slug = 'three-tacos'")).rows[0];
    assert.equal(taco.is_crowd_favourite, false);
    await asRole(database, 'authenticated', adminId, async () => {
      await database.query('update public.menu_items set is_crowd_favourite = true where id = $1', [taco.id]);
    });
    await database.exec(await readFile(new URL('020_menu_item_crowd_favourites.sql', sqlDirectory), 'utf8'));
    await asRole(database, 'anon', null, async () => {
      const featured = (await database.query('select is_featured, is_crowd_favourite from public.menu_items where id = $1', [taco.id])).rows[0];
      assert.deepEqual(featured, { is_featured: taco.is_featured, is_crowd_favourite: true });
    });
    await asRole(database, 'authenticated', customerId, async () => {
      const result = await database.query('update public.menu_items set is_crowd_favourite = false where id = $1 returning id', [taco.id]);
      assert.equal(result.rows.length, 0);
    });
    const groups = (await database.query(`
      select groups.* from public.modifier_groups groups
      join public.menu_item_modifier_groups link on link.modifier_group_id = groups.id
      where link.menu_item_id = $1
    `, [taco.id])).rows;
    const options = (await database.query('select * from public.modifier_options')).rows;
    const line = { itemId: taco.id, optionIds: fillings.map((option) => option.id).sort(), quantity: 1 };
    assert.deepEqual(parseBag(JSON.stringify({ version: 1, lines: [line] })), [line]);
    const quote = quoteLine(line, [{ ...taco, is_available: true, groups: groups.map((group) => ({
      ...group, options: options.filter((option) => option.modifier_group_id === group.id),
    })) }]);
    assert.equal(quote.issue, '');
    assert.equal(quote.total, 1000);
    await asRole(database, 'anon', null, async () => {
      const items = (await database.query('select * from public.menu_items')).rows;
      assert.equal(items.length, 9);
      assert.ok(items.every((item) => item.price_pence > 0));
      assert.equal((await database.query("select * from public.modifier_groups where name = 'Sauce choice'")).rows.length, 0);
    });
    await database.exec("update public.menu_items set price_pence = 850, image_path = 'menu/custom.jpg' where slug = 'two-tacos'");
    await database.exec(seed);
    assert.deepEqual((await database.query("select price_pence, image_path from public.menu_items where slug = 'two-tacos'")).rows[0], { price_pence: 850, image_path: 'menu/custom.jpg' });
  } finally { await database.close(); }
});

test('public media permits reading but only admins can upload, update or delete', async () => {
  const database = await createDatabase();
  try {
    await database.exec(`
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
    `);
    await database.exec(await readFile(new URL('../supabase/storage/001_public_media.sql', import.meta.url), 'utf8'));
    await database.exec(await readFile(new URL('../supabase/storage/002_images.sql', import.meta.url), 'utf8'));
    await database.exec(await readFile(new URL('../supabase/storage/002_images.sql', import.meta.url), 'utf8'));
    await asRole(database, 'authenticated', adminId, async () => {
      await database.exec("insert into storage.objects (bucket_id, name) values ('images', 'menu/tacos.jpg')");
      await database.exec("update storage.objects set name = 'events/truck.webp' where bucket_id = 'images'");
      await assert.rejects(database.exec("insert into storage.objects (bucket_id, name) values ('images', 'other/file.jpg')"), /row-level security/);
      await assert.rejects(database.exec("insert into storage.objects (bucket_id, name) values ('images', 'menu/file.svg')"), /row-level security/);
    });
    await asRole(database, 'authenticated', customerId, async () => {
      await assert.rejects(database.exec("insert into storage.objects (bucket_id, name) values ('images', 'menu/forged.jpg')"), /row-level security/);
      assert.equal((await database.query("delete from storage.objects where bucket_id = 'images' returning id")).rows.length, 0);
    });
    await asRole(database, 'anon', null, async () => {
      assert.equal((await database.query("select * from storage.objects where bucket_id = 'images'")).rows.length, 1);
    });
    await asRole(database, 'authenticated', adminId, async () => {
      await database.exec("delete from storage.objects where bucket_id = 'images'");
    });
    await asRole(database, 'authenticated', adminId, async () => {
      await database.exec("insert into storage.objects (bucket_id, name) values ('public-media', 'menu/taco.jpg')");
      await database.exec("update storage.objects set name = 'events/truck.webp'");
      await assert.rejects(database.exec("insert into storage.objects (bucket_id, name) values ('public-media', 'menu/script.svg')"), /row-level security/);
    });
    for (const [role, userId] of [['anon', null], ['authenticated', customerId]]) {
      await asRole(database, role, userId, async () => {
        assert.equal((await database.query('select * from storage.objects')).rows.length, 1);
        await assert.rejects(database.exec("insert into storage.objects (bucket_id, name) values ('public-media', 'menu/forged.jpg')"), /row-level security/);
        assert.equal((await database.query("update storage.objects set name = 'menu/forged.jpg' returning id")).rows.length, 0);
        assert.equal((await database.query('delete from storage.objects returning id')).rows.length, 0);
      });
    }
    await asRole(database, 'authenticated', adminId, async () => {
      assert.equal((await database.query('delete from storage.objects returning id')).rows.length, 1);
    });
  } finally { await database.close(); }
});

async function createDatabase({ profileEmailUpgrade = true } = {}) {
  const database = new PGlite();
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
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
    if (!profileEmailUpgrade && file === '027_profiles_email.sql') continue;
    await database.exec(await readFile(new URL(file, sqlDirectory), 'utf8'));
  }
  await database.query(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ($1, 'admin@example.test', '{"full_name":"Owner"}'),
      ($2, 'customer@example.test', '{"full_name":"Customer","role":"admin","email":"forged@example.test"}'),
      ($3, null, '{}')
  `, [adminId, customerId, otherCustomerId]);
  await database.query("update public.profiles set role = 'admin' where id = $1", [adminId]);
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

async function enableOrdering(database) {
  await database.exec("update public.business_settings set ordering_status = 'open', card_enabled = true");
  await database.query(`
    insert into public.events (
      id, slug, title, venue_name, address_line_1, town, postcode,
      starts_at, ends_at, is_published, pickup_enabled, ordering_status
    ) values ($1, 'pickup-event', 'Pickup Event', 'Market', 'High Street', 'Town', 'AB1 2CD',
      now() + interval '1 hour', now() + interval '5 hours', true, true, 'open')
  `, [eventId]);
  await database.query(`
    insert into public.pickup_slots (id, event_id, starts_at, ends_at, capacity)
    values ($1, $2, now() + interval '2 hours', now() + interval '2 hours 15 minutes', 2)
  `, [slotId, eventId]);
}

async function insertOrder(database, paymentMethod = 'cash', orderCustomerId = customerId) {
  return asRole(database, 'service_role', null, async () => {
    const { rows } = await database.query(`
      insert into public.orders (
        checkout_key, customer_id, event_id, pickup_slot_id,
        customer_name, customer_email, customer_phone,
        payment_method, status, reservation_expires_at, subtotal_pence
      ) values (gen_random_uuid(), $1, $2, $3, 'Customer', 'customer@example.test', '07000000000',
        $4, $5, case when $4 = 'card' then now() + interval '30 minutes' else null end, 850)
      returning *
    `, [orderCustomerId, eventId, slotId, paymentMethod, paymentMethod === 'card' ? 'pending_payment' : 'ordered']);
    return rows[0];
  });
}

test('SQL installs; profiles are automatic, private, and cannot self-promote', async () => {
  const database = await createDatabase();
  try {
    await asRole(database, 'authenticated', customerId, async () => {
      const { rows } = await database.query('select * from public.profiles');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].role, 'customer');
      assert.equal(rows[0].full_name, 'Customer');
      assert.equal(rows[0].email, 'customer@example.test');
      await database.query("update public.profiles set full_name = 'Updated' where id = $1", [customerId]);
      await assert.rejects(database.query("update public.profiles set email = 'forged@example.test' where id = $1", [customerId]), /permission denied/);
      await assert.rejects(database.query("update public.profiles set role = 'admin' where id = $1", [customerId]), /permission denied/);
      await assert.rejects(database.query('insert into public.profiles (id) values ($1)', [customerId]), /permission denied/);
    });
    await asRole(database, 'anon', null, async () => {
      await assert.rejects(database.query('select * from public.profiles'), /permission denied/);
    });
    await asRole(database, 'authenticated', adminId, async () => {
      const { rows } = await database.query('select * from public.profiles');
      assert.equal(rows.length, 3);
    });
  } finally {
    await database.close();
  }
});

test('profile emails follow Auth email changes without changing profile details or permissions', async () => {
  const database = await createDatabase();
  try {
    assert.equal((await database.query('select email from public.profiles where id = $1', [otherCustomerId])).rows[0].email, null);
    await database.query("update public.profiles set full_name = 'Edited Owner', phone = '07000000000' where id = $1", [adminId]);
    await database.query("update auth.users set email = 'updated@example.test' where id = $1", [adminId]);
    assert.deepEqual((await database.query('select email, full_name, phone, role from public.profiles where id = $1', [adminId])).rows[0], {
      email: 'updated@example.test', full_name: 'Edited Owner', phone: '07000000000', role: 'admin',
    });
    await asRole(database, 'authenticated', adminId, async () => {
      await assert.rejects(database.query("update public.profiles set email = 'forged@example.test' where id = $1", [adminId]), /permission denied/);
    });
    await database.query('update auth.users set email = null where id = $1', [adminId]);
    assert.equal((await database.query('select email from public.profiles where id = $1', [adminId])).rows[0].email, null);
    await asRole(database, 'authenticated', customerId, async () => {
      assert.equal((await database.query('select email from public.profiles where id = $1', [adminId])).rows.length, 0);
    });
  } finally { await database.close(); }
});

test('profile email upgrade backfills existing users and is repeatable', async () => {
  const database = await createDatabase({ profileEmailUpgrade: false });
  try {
    await database.query("update public.profiles set full_name = 'Edited Owner', phone = '07000000000' where id = $1", [adminId]);
    const migration = await readFile(new URL('027_profiles_email.sql', sqlDirectory), 'utf8');
    await database.exec(migration);
    assert.deepEqual((await database.query('select email, full_name, phone, role from public.profiles where id = $1', [adminId])).rows[0], {
      email: 'admin@example.test', full_name: 'Edited Owner', phone: '07000000000', role: 'admin',
    });
    assert.equal((await database.query('select email from public.profiles where id = $1', [customerId])).rows[0].email, 'customer@example.test');
    assert.equal((await database.query('select email from public.profiles where id = $1', [otherCustomerId])).rows[0].email, null);
    await database.query("update auth.users set email = 'changed@example.test' where id = $1", [customerId]);
    const profiles = (await database.query('select * from public.profiles order by id')).rows;
    await database.exec(migration);
    assert.deepEqual((await database.query('select * from public.profiles order by id')).rows, profiles);
    await database.query("update auth.users set email = 'again@example.test' where id = $1", [customerId]);
    assert.equal((await database.query('select email from public.profiles where id = $1', [customerId])).rows[0].email, 'again@example.test');
  } finally { await database.close(); }
});

test('catalogue and event controls allow admin writes and hide unpublished content', async () => {
  const database = await createDatabase();
  try {
    await asRole(database, 'authenticated', adminId, async () => {
      await database.exec(`
        insert into public.menu_categories (name, slug, is_published)
        values ('Tacos', 'tacos', true), ('Draft', 'draft', false);
        insert into public.menu_items (category_id, name, slug, price_pence, is_published)
        select id, 'Example Taco', 'example-taco', 850, true
        from public.menu_categories where slug = 'tacos';
        insert into public.events (slug, title, venue_name, address_line_1, town, postcode, starts_at, ends_at)
        values ('example', 'Example Event', 'Venue', 'Street', 'Town', 'AB1 2CD', now() + interval '1 day', now() + interval '2 days');
        update public.business_settings set ordering_status = 'paused';
      `);
      await assert.rejects(database.exec(`
        insert into public.pickup_slots (event_id, starts_at, ends_at)
        select id, now(), now() + interval '1 hour' from public.events
      `), /within the event/);
    });
    await asRole(database, 'anon', null, async () => {
      assert.equal((await database.query('select * from public.events')).rows.length, 0);
      assert.equal((await database.query('select * from public.menu_categories')).rows.length, 1);
      assert.equal((await database.query('select * from public.menu_items')).rows.length, 1);
      assert.equal((await database.query('select ordering_status from public.business_settings')).rows[0].ordering_status, 'paused');
      await assert.rejects(database.exec("update public.business_settings set ordering_status = 'open'"), /permission denied/);
    });
    await asRole(database, 'authenticated', customerId, async () => {
      await assert.rejects(database.exec("insert into public.menu_categories (name, slug) values ('Invalid', 'invalid')"), /row-level security/);
      const { rows } = await database.query("update public.business_settings set ordering_status = 'open' returning *");
      assert.equal(rows.length, 0);
    });
  } finally {
    await database.close();
  }
});

test('global and per-event controls block checkout at the database boundary', async () => {
  const database = await createDatabase();
  try {
    await enableOrdering(database);
    const cases = [
      ["update public.business_settings set ordering_status = 'paused'", /business_paused/, "update public.business_settings set ordering_status = 'open'"],
      ["update public.business_settings set ordering_status = 'closed'", /business_closed/, "update public.business_settings set ordering_status = 'open'"],
      ["update public.events set pickup_enabled = false", /pickup_disabled/, "update public.events set pickup_enabled = true"],
      ["update public.events set ordering_status = 'paused'", /event_paused/, "update public.events set ordering_status = 'open'"],
      ["update public.events set ordering_status = 'closed'", /event_closed/, "update public.events set ordering_status = 'open'"],
      ["update public.events set is_published = false", /event_unavailable/, "update public.events set is_published = true"],
      ["update public.events set orders_open_at = now() + interval '1 hour'", /not_open_yet/, "update public.events set orders_open_at = null"],
      ["update public.events set orders_close_at = now() - interval '1 minute'", /ordering_ended/, "update public.events set orders_close_at = null"],
      ["update public.pickup_slots set is_enabled = false", /slot unavailable/, "update public.pickup_slots set is_enabled = true"],
      ["update public.events set pickup_lead_minutes = 180", /preparation lead time/, "update public.events set pickup_lead_minutes = 20"],
      ["update public.business_settings set cash_enabled = false", /Cash checkout unavailable/, "update public.business_settings set cash_enabled = true"],
      ["update public.business_settings set minimum_order_pence = 1000", /Minimum order/, "update public.business_settings set minimum_order_pence = 0"],
      ["update public.business_settings set service_fee_pence = 50", /fees do not match/, "update public.business_settings set service_fee_pence = 0"],
    ];
    for (const [disable, expected, restore] of cases) {
      await database.exec(disable);
      await assert.rejects(insertOrder(database), expected);
      await database.exec(restore);
    }
    await asRole(database, 'anon', null, async () => {
      const { rows } = await database.query('select * from public.get_event_ordering_state($1)', [eventId]);
      assert.deepEqual(rows, [{ accepting_orders: true, reason: 'open' }]);
    });
    const order = await insertOrder(database);
    assert.equal(order.pickup_location.venue_name, 'Market');
    assert.equal(order.total_pence, 850);
    await database.exec("update public.business_settings set ordering_status = 'paused'");
    await asRole(database, 'authenticated', adminId, async () => {
      const { rows } = await database.query("select (public.admin_set_order_status($1, 'preparing')).status", [order.id]);
      assert.equal(rows[0].status, 'preparing');
    });
  } finally {
    await database.close();
  }
});

test('slot capacity counts cash orders and active card reservations, not expired holds', async () => {
  const database = await createDatabase();
  try {
    await enableOrdering(database);
    const cardOrder = await insertOrder(database, 'card');
    await insertOrder(database);
    await assert.rejects(insertOrder(database), /slot is full/);
    await database.query("update public.orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [cardOrder.id]);
    await insertOrder(database);
    await assert.rejects(insertOrder(database), /slot is full/);
    await assert.rejects(database.exec("update public.pickup_slots set starts_at = starts_at + interval '1 minute'"), /cannot be moved/);
    await assert.rejects(database.exec("update public.events set ends_at = starts_at + interval '5 minutes'"), /must contain/);
  } finally {
    await database.close();
  }
});

test('order ownership, admin status transitions, cash collection and audit history', async () => {
  const database = await createDatabase();
  try {
    await enableOrdering(database);
    const order = await insertOrder(database);
    await asRole(database, 'authenticated', otherCustomerId, async () => {
      assert.equal((await database.query('select * from public.orders')).rows.length, 0);
      assert.equal((await database.query('select * from public.order_status_history')).rows.length, 0);
      await assert.rejects(database.query("select public.admin_set_order_status($1, 'preparing')", [order.id]), /Admin access required/);
      await assert.rejects(database.query('select public.admin_mark_cash_paid($1)', [order.id]), /Admin access required/);
    });
    await asRole(database, 'authenticated', customerId, async () => {
      assert.equal((await database.query('select * from public.orders')).rows.length, 1);
      await assert.rejects(database.query("update public.orders set payment_status = 'paid' where id = $1", [order.id]), /permission denied/);
      await assert.rejects(database.query("insert into public.orders (checkout_key) values (gen_random_uuid())"), /permission denied/);
    });
    await asRole(database, 'authenticated', adminId, async () => {
      await assert.rejects(database.query("select public.admin_set_order_status($1, 'collected')", [order.id]), /Invalid order status/);
      await database.query("select public.admin_set_order_status($1, 'preparing')", [order.id]);
      await database.query("select public.admin_set_order_status($1, 'ready_for_pickup')", [order.id]);
      await assert.rejects(database.query("select public.admin_set_order_status($1, 'collected')", [order.id]), /Record payment/);
      await database.query('select public.admin_mark_cash_paid($1)', [order.id]);
      await database.query('select public.admin_mark_cash_paid($1)', [order.id]);
      await database.query("select public.admin_set_order_status($1, 'collected')", [order.id]);
      assert.equal((await database.query('select * from public.payments')).rows.length, 1);
      assert.equal((await database.query('select * from public.order_status_history')).rows.length, 4);
      await assert.rejects(database.query("select public.admin_set_order_status($1, 'preparing')", [order.id]), /Invalid order status/);
    });
    await asRole(database, 'authenticated', customerId, async () => {
      assert.equal((await database.query('select * from public.payments')).rows.length, 0);
      assert.equal((await database.query('select status from public.orders')).rows[0].status, 'collected');
      await assert.rejects(database.exec('select * from public.stripe_webhook_events'), /permission denied/);
    });
  } finally {
    await database.close();
  }
});

test('item snapshots preserve prices and nested order details respect ownership', async () => {
  const database = await createDatabase();
  try {
    await enableOrdering(database);
    const ownOrder = await insertOrder(database);
    const otherOrder = await insertOrder(database, 'cash', otherCustomerId);
    const { rows: categories } = await database.query("insert into public.menu_categories (name, slug) values ('Tacos', 'tacos') returning id");
    const { rows: items } = await database.query(`
      insert into public.menu_items (category_id, name, slug, price_pence)
      values ($1, 'Original Taco', 'original-taco', 700) returning id
    `, [categories[0].id]);
    for (const order of [ownOrder, otherOrder]) {
      const { rows: orderItems } = await database.query(`
        insert into public.order_items (order_id, menu_item_id, item_name, quantity, unit_price_pence, unit_extras_pence)
        values ($1, $2, 'Original Taco', 1, 700, 150) returning id
      `, [order.id, items[0].id]);
      await database.query(`
        insert into public.order_item_modifiers (order_item_id, group_name, option_name, unit_price_pence)
        values ($1, 'Extras', 'Guacamole', 150)
      `, [orderItems[0].id]);
    }
    await database.query("update public.menu_items set name = 'Renamed Taco', price_pence = 950 where id = $1", [items[0].id]);
    await assert.rejects(database.query('delete from public.menu_items where id = $1', [items[0].id]), /foreign key constraint/);
    await assert.rejects(database.exec('update public.order_items set quantity = 0'), /check constraint/);
    await asRole(database, 'authenticated', customerId, async () => {
      const { rows } = await database.query('select * from public.order_items');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].item_name, 'Original Taco');
      assert.equal(rows[0].line_total_pence, 850);
      assert.equal((await database.query('select * from public.order_item_modifiers')).rows.length, 1);
      await assert.rejects(database.exec('update public.order_items set unit_price_pence = 1'), /permission denied/);
    });
    await asRole(database, 'anon', null, async () => {
      await assert.rejects(database.exec('select * from public.order_items'), /permission denied/);
      await assert.rejects(database.exec('select * from public.order_item_modifiers'), /permission denied/);
    });
    await asRole(database, 'service_role', null, async () => {
      await assert.rejects(database.exec('delete from public.order_status_history'), /permission denied/);
      await database.exec("insert into public.stripe_webhook_events (stripe_event_id, event_type) values ('evt_example', 'checkout.session.completed')");
      await assert.rejects(database.exec("insert into public.stripe_webhook_events (stripe_event_id, event_type) values ('evt_example', 'checkout.session.completed')"), /unique constraint/);
      await assert.rejects(database.exec('delete from public.stripe_webhook_events'), /permission denied/);
    });
    const { rows: tables } = await database.query("select relname, relrowsecurity from pg_class join pg_namespace on pg_namespace.oid = relnamespace where nspname = 'public' and relkind = 'r'");
    assert.equal(tables.length, 16);
    assert.ok(tables.every((table) => table.relrowsecurity));
  } finally {
    await database.close();
  }
});