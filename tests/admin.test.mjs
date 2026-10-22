import assert from 'node:assert/strict';
import test from 'node:test';
import { resources, getResource, resourceSchema } from '../src/lib/admin/resources.ts';
import { formDefaults, formPayload, slugFromTitle } from '../src/lib/admin/form-values.ts';
import { orderFilterParams, orderOperations, parseOrderFilters } from '../src/lib/admin/orders.ts';
import { testimonialSchema, eventSchema, settingsSchema, optionSchema } from '../src/lib/catalogue/types.ts';
import { aboutDefaults } from '../src/lib/catalogue/about.ts';
import { build } from 'esbuild';
import path from 'node:path';
import { deliveryLabel, serviceMode, eventMenuLink } from '../src/lib/service-ordering.ts';
import { trackingLabels } from '../src/lib/inventory.ts';

test('stock and linked-product labels use Title Case without changing internal option values', () => {
  assert.deepEqual(trackingLabels, {
    none: 'Not Tracked',
    global: 'Global Stock + Event Allocations',
    event: 'Event Portions Only',
  });
  const kind = resources.menu.fields.find((field) => field.key === 'item_kind');
  assert.equal(kind.label, 'Menu Item Kind');
  assert.deepEqual(kind.options, ['product', 'group']);
  const pricing = resources.options.fields.find((field) => field.key === 'pricing_mode');
  assert.equal(pricing.label, 'Choice Pricing');
  assert.deepEqual(pricing.options, ['extra', 'item']);
  assert.equal(pricing.optionLabels.item, "Use Linked Item's Price");
});

test('stock overview orders composite-key product links without requesting a nonexistent id', async () => {
  const calls = [];
  globalThis.__stockOverviewTest = calls;
  try {
    const bundle = await build({
      stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
        import Page from '@/app/admin/stock/page';
        export async function render() { return Page({searchParams:Promise.resolve({})}); }
      ` },
      bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
      plugins: [{ name: 'stock-overview-boundaries', setup(builder) {
        builder.onResolve({ filter: /^(@\/lib\/auth\/session|@\/lib\/admin\/data|@\/components\/admin\/stock-manager)$/ }, (args) => ({ path: args.path, namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({ contents:
          args.path.endsWith('/session') ? 'export async function requireAdmin() {}'
            : args.path.endsWith('/stock-manager') ? 'export function StockManager() { return null; }'
              : `export function adminError(error) { throw error; }
                export async function adminRequest() { return []; }
                export async function adminRows(table, query = {}) {
                  globalThis.__stockOverviewTest.push([table, query]);
                  if (table === 'menu_item_modifier_groups' && (!query.order || query.order.split(',').some(part => part.startsWith('id.')))) {
                    throw new Error('column menu_item_modifier_groups.id does not exist');
                  }
                  return [];
                }` }));
        builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
      } }],
    });
    const { render } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const page = await render();
    assert.equal(typeof page.type, 'function');
    assert.deepEqual(calls.find(([table]) => table === 'menu_item_modifier_groups'), [
      'menu_item_modifier_groups', { order: 'menu_item_id.asc,modifier_group_id.asc' },
    ]);
    assert.deepEqual(page.props.uses, []);
  } finally { delete globalThis.__stockOverviewTest; }
});

test('service operations use one completion step and preserve the pickup workflow', () => {
  const location = { service_mode: 'car', location_number: '27', number_plate: 'AB12 CDE' };
  assert.equal(serviceMode({}), 'pickup');
  assert.equal(deliveryLabel(location), 'Car 27 / AB12 CDE');
  assert.equal(deliveryLabel({ ...location, service_mode: 'table', number_plate: '' }), 'Table 27');
  assert.equal(eventMenuLink('event-id'), '/menu?event=event-id');
  assert.deepEqual(orderOperations('ordered', 'card', 'paid', location).map((action) => action.label), ['Mark As Complete', 'Cancel Order']);
  assert.deepEqual(orderOperations('collected', 'card', 'paid', location), [{ value: 'ordered', label: 'Reopen Order' }]);
  assert.equal(orderOperations('pending_payment', 'card', 'unpaid', location).some((action) => action.value === 'collected'), false);
  assert.equal(orderOperations('cancelled', 'card', 'paid', location).length, 0);
  assert.equal(orderOperations('ordered', 'card', 'paid')[0].value, 'preparing');
});

test('service order queue uses matching location searches and event-wide counts beyond one page', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const state = { calls: [] };
  globalThis.__ordersPageTest = state;
  try {
    const bundle = await build({
      stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
        import Page from '@/app/admin/orders/page';
        import { renderToStaticMarkup } from 'react-dom/server';
        export async function render(params) { return renderToStaticMarkup(await Page({searchParams:Promise.resolve(params)})); }
      ` },
      bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
      banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` },
      plugins: [{ name: 'orders-page-boundaries', setup(builder) {
        builder.onResolve({ filter: /^(next\/link|@\/lib\/auth\/session|@\/lib\/admin\/data|@\/components\/)/ }, (args) => ({ path: args.path, namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({ contents: args.path === 'next/link'
          ? 'export default function Link({children}) { return children; }'
          : args.path.startsWith('@/components/') ? 'export function Button({children}) { return children; } export const Badge = Button; export function OrderFilters() { return null; } export function OrderControls() { return null; }'
            : args.path.endsWith('/session') ? 'export async function requireAdmin() {}'
              : `export function adminError(error) { return error.message; }
                export async function adminRows() { return [{id:'${id}',title:'Drive-In Cinema'}]; }
                export async function adminRequest(...args) {
                  globalThis.__ordersPageTest.calls.push(args);
                  if (args[0] !== 'orders') return [{outstanding:58,complete:12,cancelled:1,pending_payment:2}];
                  return Array.from({length:51}, (_,index) => ({id:String(index),order_number:1000+index,event_id:'${id}',customer_name:'Alex',status:'ordered',payment_method:'card',payment_status:'paid',total_pence:800,pickup_location:{service_mode:'car',location_number:'A/2',number_plate:'AB12 CDE'},order_items:[{item_name:'Test Taco',quantity:2}]}));
                }` }));
        builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
      } }],
    });
    const { render } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const html = await render({ event: id, status: 'ordered', q: ' A/2 ' });
    const query = state.calls.find(([resource]) => resource === 'orders')[1];
    assert.equal(query.event_id, `in.(${id})`);
    assert.equal(query.status, 'in.(ordered)');
    assert.equal(query.order, 'created_at.asc,id.asc');
    assert.match(query.or, /pickup_location->>location_number\.ilike\.\*A\/2\*/);
    assert.deepEqual(state.calls.find(([resource]) => resource === 'rpc/admin_order_counts'), ['rpc/admin_order_counts', {}, 'POST', { event_uuids: [id], search_text: 'A/2' }]);
    assert.equal((html.match(/<article /g) || []).length, 50);
    assert.match(html, />58<\/p>/);
    assert.match(html, /Car A\/2 \/ AB12 CDE/);
    assert.match(html, /2 x Test Taco/);
    assert.match(html, /Delivery as soon as possible/);
  } finally { delete globalThis.__ordersPageTest; }
});

test('event QR endpoint authorizes admins and encodes a stable event-specific menu link', async () => {
  const state = { viewer: null, exists: true, encoded: '', private: false };
  const previous = process.env.SITE_URL;
  process.env.SITE_URL = 'https://tacos.example';
  globalThis.__eventQrTest = state;
  try {
    const bundle = await build({
      entryPoints: ['src/app/api/admin/events/[id]/qr/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
      plugins: [{ name: 'qr-boundaries', setup(builder) {
        builder.onResolve({ filter: /^(qrcode|@\/lib\/auth\/session|@\/lib\/admin\/data)$/ }, (args) => ({ path: args.path, namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({ contents: args.path === 'qrcode'
          ? 'export default { async toString(url) { globalThis.__eventQrTest.encoded = url; return "<svg></svg>"; } };'
          : args.path.endsWith('/session') ? 'export async function getViewer() { return globalThis.__eventQrTest.viewer; }'
            : 'export async function adminRequest(path) { const state = globalThis.__eventQrTest; if (path.startsWith("rpc/")) return [{access_key:"a".repeat(64)}]; return state.exists ? [{id:"event",is_private:state.private}] : []; } export function adminError() { return "QR unavailable"; }' }));
        builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
      } }],
    });
    const { GET } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const id = '00000000-0000-4000-8000-000000000001';
    const request = new Request(`https://tacos.example/api/admin/events/${id}/qr?download=1`);
    const params = { params: Promise.resolve({ id }) };
    assert.equal((await GET(request, params)).status, 401);
    state.viewer = { profile: { role: 'customer' } };
    assert.equal((await GET(request, params)).status, 403);
    state.viewer = { profile: { role: 'admin' } };
    assert.equal((await GET(request, { params: Promise.resolve({ id: 'bad' }) })).status, 404);
    const response = await GET(request, params);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'image/svg+xml');
    assert.match(response.headers.get('Content-Disposition'), /attachment/);
    assert.equal(state.encoded, `https://tacos.example/menu?event=${id}`);
    state.private = true;
    assert.equal((await GET(request, params)).status, 200);
    assert.equal(state.encoded, `https://tacos.example/api/events/${id}/access?key=${'a'.repeat(64)}`);
    const opened = await GET(new Request(`https://tacos.example/api/admin/events/${id}/qr?open=1`), params);
    assert.equal(opened.status, 303);
    assert.equal(opened.headers.get('Location'), state.encoded);
    state.exists = false;
    assert.equal((await GET(request, params)).status, 404);
  } finally {
    delete globalThis.__eventQrTest;
    if (previous === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = previous;
  }
});

test('dashboard refresh API requires an administrator and returns explicit uncached failures', async () => {
  const state = { viewer: null, calls: 0, fail: false };
  globalThis.__dashboardApiTest = state;
  try {
    const bundle = await build({
      entryPoints: ['src/app/api/admin/dashboard/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
      plugins: [{ name: 'dashboard-api-boundaries', setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/(auth\/session|admin\/data)$/ }, (args) => ({ path: args.path, namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({ contents: args.path.endsWith('/session')
          ? 'export async function getViewer() { return globalThis.__dashboardApiTest.viewer; }'
          : 'export function adminError() { return "Temporary database failure"; } export async function getDashboardData() { const state = globalThis.__dashboardApiTest; state.calls++; if (state.fail) throw new Error("Database unavailable"); return {orders: [], menu: [], events: []}; }' }));
      } }],
    });
    const { GET } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    assert.equal((await GET()).status, 401);
    state.viewer = { profile: { role: 'customer' } };
    assert.equal((await GET()).status, 403);
    assert.equal(state.calls, 0);
    state.viewer = { profile: { role: 'admin' } };
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.deepEqual(await response.json(), { orders: [], menu: [], events: [] });
    state.fail = true;
    const failed = await GET();
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: 'Temporary database failure' });
  } finally { delete globalThis.__dashboardApiTest; }
});

test('admin schema errors identify option content separately from the menu save function', async () => {
  const bundle = await build({ entryPoints: ['src/lib/admin/data.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'schema-error-boundaries', setup(builder) {
    builder.onResolve({ filter: /^(server-only|@\/lib\/auth\/session|@\/lib\/supabase\/(server|config))$/ }, (args) => ({ path: args.path, namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function requireAdmin() {} export function createServerSupabase() {} export function supabaseConfig() {}' }));
  } }] });
  const { adminError, AdminDataError } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  for (const column of ['description', 'image_path', 'image_alt']) {
    for (const [code, message] of [['42703', `column modifier_options.${column} does not exist`], ['PGRST204', `Could not find the '${column}' column of 'modifier_options' in the schema cache`]]) {
      const result = adminError(new AdminDataError(code, message));
      assert.match(result, /031_modifier_option_content.sql/);
      assert.doesNotMatch(result, /Apply.*032_menu_item_modifier_save.sql/);
    }
  }
  const missingFunction = adminError(new AdminDataError('PGRST202', 'Could not find the function public.admin_save_menu_item in the schema cache'));
  assert.match(missingFunction, /032_menu_item_modifier_save.sql/);
  assert.match(missingFunction, /schema cache/);
  assert.match(adminError(new AdminDataError('PGRST204', "Could not find the 'child_group_ids' column of 'modifier_groups' in the schema cache")), /034_modifier_group_nesting.sql/);
  assert.match(adminError(new AdminDataError('PGRST202', 'Could not find public.admin_order_counts in the schema cache')), /045_table_car_ordering.sql/);
  assert.match(adminError(new AdminDataError('42703', 'column events.service_mode does not exist')), /045_table_car_ordering.sql/);
  const otherColumn = adminError(new AdminDataError('42703', 'column unrelated does not exist'));
  assert.match(otherColumn, /42703/);
  assert.doesNotMatch(otherColumn, /031_|032_/);
});

test('admin mutations protect unarchive and ordering settings with authorization and version checks', async () => {
  const state = { allowed: true, rows: [{ id: '00000000-0000-4000-8000-000000000001' }], calls: [], revalidated: [] };
  globalThis.__adminActionTest = state;
  try {
    const bundle = await build({ entryPoints: ['src/app/admin/actions.ts'], bundle: true, write: false, platform: 'node', format: 'esm', banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` }, plugins: [{ name: 'action-boundaries', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/payments\/send-status-emails$/ }, (args) => ({ path: args.path, namespace: 'emails' }));
      builder.onLoad({ filter: /.*/, namespace: 'emails' }, () => ({ contents: 'export async function sendOrderStatusEmails(id) { const state = globalThis.__adminActionTest; state.emailOrder = id; return {sent:1,failed:state.emailFail ? 1 : 0}; }' }));
      builder.onResolve({ filter: /^(next\/cache|@\/lib\/auth\/session|@\/lib\/admin\/data)$/ }, (args) => ({ path: args.path, namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({ contents: args.path === 'next/cache' ? 'export function revalidatePath(...args) { globalThis.__adminActionTest.revalidated.push(args); }' : args.path.endsWith('/session') ? 'export async function requireAdmin() { if (!globalThis.__adminActionTest.allowed) throw new Error("Admin access required"); }' : 'export class AdminDataError extends Error { constructor(code, message) { super(message); this.code = code; } } export function adminError(error) { return error.message; } export async function adminRequest(...args) { globalThis.__adminActionTest.calls.push(args); return globalThis.__adminActionTest.rows; }' }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }] });
    const { unarchiveMenuItem, setOrderingStatus, setMaintenanceMode, setPublicMenuEnabled, setMenuAvailability, saveRecord, updateOrder } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const id = state.rows[0].id;
    const version = '2026-09-21T12:00:00Z';
    assert.equal((await updateOrder(id, 'preparing')).ok, true);
    assert.equal(state.emailOrder, id);
    state.emailFail = true;
    const notificationFailure = await updateOrder(id, 'ready_for_pickup');
    assert.equal(notificationFailure.ok, true);
    assert.match(notificationFailure.warning, /email is still queued/);
    state.calls.length = 0;
    state.allowed = false;
    await assert.rejects(updateOrder(id, 'collected'), /Admin access required/);
    await assert.rejects(unarchiveMenuItem(id, version), /Admin access required/);
    await assert.rejects(setOrderingStatus('open', version), /Admin access required/);
    await assert.rejects(setMaintenanceMode(true, version), /Admin access required/);
    await assert.rejects(setPublicMenuEnabled(false, version), /Admin access required/);
    await assert.rejects(setMenuAvailability(id, version, true), /Admin access required/);
    assert.equal(state.calls.length, 0);
    state.allowed = true;
    assert.equal((await unarchiveMenuItem('invalid', version)).ok, false);
    assert.equal((await unarchiveMenuItem(id, 'invalid')).ok, false);
    assert.equal((await setOrderingStatus('invalid', version)).ok, false);
    assert.equal((await setOrderingStatus('open', 'invalid')).ok, false);
    assert.equal((await setMaintenanceMode('true', version)).ok, false);
    assert.equal((await setMaintenanceMode(true, 'invalid')).ok, false);
    assert.equal((await setPublicMenuEnabled('false', version)).ok, false);
    assert.equal((await setPublicMenuEnabled(false, 'invalid')).ok, false);
    assert.equal((await setMenuAvailability('invalid', version, true)).ok, false);
    assert.equal((await setMenuAvailability(id, 'invalid', true)).ok, false);
    assert.equal((await setMenuAvailability(id, version, 'true')).ok, false);
    assert.equal(state.calls.length, 0);
    assert.equal((await unarchiveMenuItem(id, version)).ok, true);
    assert.deepEqual(state.calls[0], ['menu_items', { id: `eq.${id}`, updated_at: `eq.${version}`, archived_at: 'not.is.null' }, 'PATCH', { archived_at: null, is_published: false, is_available: false }]);
    assert.equal((await setOrderingStatus('closed', version)).ok, true);
    assert.deepEqual(state.calls[1], ['business_settings', { singleton: 'eq.true', updated_at: `eq.${version}` }, 'PATCH', { ordering_status: 'closed' }]);
    assert.equal((await setOrderingStatus('open', version)).ok, true);
    for (const enabled of [true, false]) {
      assert.equal((await setMaintenanceMode(enabled, version)).ok, true);
      assert.deepEqual(state.calls.at(-1), ['business_settings', { singleton: 'eq.true', updated_at: `eq.${version}` }, 'PATCH', { maintenance_enabled: enabled }]);
      assert.equal((await setPublicMenuEnabled(enabled, version)).ok, true);
      assert.deepEqual(state.calls.at(-1), ['business_settings', { singleton: 'eq.true', updated_at: `eq.${version}` }, 'PATCH', { public_menu_enabled: enabled }]);
    }
    assert.ok(state.revalidated.some(([path, type]) => path === '/' && type === 'layout'));
    const menuValues = { ...formDefaults(resources.menu), category_id: id, name: 'Taco', slug: 'taco', description: '<p onclick="alert(1)"><strong>Fresh</strong></p><script>alert(1)</script>' };
    assert.equal((await saveRecord('menu', id, version, formPayload(resources.menu, menuValues))).ok, true);
    assert.equal(state.calls.at(-1)[3].description, '<p><strong>Fresh</strong></p>');
    const menuPayload = formPayload(resources.menu, menuValues);
    assert.equal((await saveRecord('menu', null, null, menuPayload, [id])).ok, true);
    assert.equal(state.calls.at(-1)[0], 'rpc/admin_save_menu_item');
    assert.deepEqual(state.calls.at(-1)[3].group_ids, [id]);
    assert.equal(state.calls.at(-1)[3].item_id, null);
    assert.equal(state.calls.at(-1)[3].item_values.description, '<p><strong>Fresh</strong></p>');
    assert.equal((await saveRecord('menu', id, version, menuPayload, [])).ok, true);
    assert.deepEqual(state.calls.at(-1)[3].group_ids, []);
    assert.equal(state.calls.at(-1)[3].expected_updated_at, version);
    const beforeInvalidGroups = state.calls.length;
    for (const groups of [[id, id], ['invalid'], Array(31).fill(id)]) assert.equal((await saveRecord('menu', id, version, menuPayload, groups)).ok, false);
    state.allowed = false;
    await assert.rejects(saveRecord('menu', null, null, menuPayload, [id]), /Admin access required/);
    state.allowed = true;
    assert.equal(state.calls.length, beforeInvalidGroups);
    for (const available of [false, true]) {
      assert.equal((await setMenuAvailability(id, version, available)).ok, true);
      assert.deepEqual(state.calls.at(-1), ['menu_items', { id: `eq.${id}`, updated_at: `eq.${version}`, archived_at: 'is.null' }, 'PATCH', { is_available: available }]);
    }
    const eventPayload = formPayload(resources.events, { ...formDefaults(resources.events), title: 'Market', venue_name: 'Square', address_line_1: 'High Street', town: 'Town', postcode: 'AB1 2CD', pickup_enabled: true, starts_at: '2026-09-28T12:00', ends_at: '2026-09-28T18:00' });
    for (const pickupEnabled of [true, false]) {
      const values = { ...eventPayload, pickup_enabled: pickupEnabled, description: '<p onclick="alert(1)"><strong>Market night</strong></p><script>alert(1)</script>' };
      assert.equal((await saveRecord('events', null, null, values)).ok, true);
      assert.equal(state.calls.at(-1)[3].description, '<p><strong>Market night</strong></p>');
      assert.equal(state.calls.at(-1)[3].starts_at, eventPayload.starts_at);
      assert.equal(state.calls.at(-1)[3].ends_at, eventPayload.ends_at);
      assert.equal((await saveRecord('events', id, version, values)).ok, true);
      assert.equal(state.calls.at(-1)[3].starts_at, eventPayload.starts_at);
      assert.equal(state.calls.at(-1)[3].ends_at, eventPayload.ends_at);
      assert.equal(resourceSchema(resources.events).safeParse({ ...values, starts_at: null }).success, false);
      assert.equal(resourceSchema(resources.events).safeParse({ ...values, ends_at: null }).success, false);
      assert.equal(resourceSchema(resources.events).safeParse({ ...values, ends_at: values.starts_at }).success, false);
    }
    state.rows = [];
    assert.match((await setMenuAvailability(id, version, true)).error, /changed or was archived/);
    assert.match((await unarchiveMenuItem(id, version)).error, /changed or is no longer archived/);
    assert.match((await setOrderingStatus('open', version)).error, /Ordering settings changed/);
    assert.match((await setMaintenanceMode(true, version)).error, /Site settings changed/);
    assert.match((await setPublicMenuEnabled(false, version)).error, /Site settings changed/);
    assert.ok(state.revalidated.some(([route]) => route === '/admin/menu'));
    assert.ok(state.revalidated.some(([route]) => route === '/admin/settings'));
    assert.ok(state.revalidated.every(([route, type]) => (route.startsWith('/admin') && type !== 'layout') || (route === '/' && type === 'layout')));
  } finally { delete globalThis.__adminActionTest; }
});

test('slugs default from names and titles without replacing custom URLs', () => {
  assert.equal(slugFromTitle("Papa's Tacos & Café!"), 'papas-tacos-cafe');
  assert.equal(slugFromTitle('  Two   Tacos -- Special  '), 'two-tacos-special');
  for (const resource of [resources.menu, resources.categories, resources.events]) {
    const values = { ...formDefaults(resource), [resource.label]: 'Summer Food Market' };
    assert.equal(formPayload(resource, values).slug, 'summer-food-market');
    assert.equal(formPayload(resource, { ...values, slug: 'custom-url' }).slug, 'custom-url');
  }
  assert.ok(slugFromTitle('long '.repeat(100)).length <= 160);
});

test('About settings validate editable content and supply defaults for legacy settings', () => {
  const values = formPayload(resources.settings, { ...formDefaults(resources.settings), business_name: "Papa's Tacos" });
  assert.equal(values.maintenance_enabled, false);
  assert.equal(Object.hasOwn(values, 'maintenance_allowed_emails'), false);
  assert.equal(resourceSchema(resources.settings).safeParse({ ...values, maintenance_allowed_emails: 'invalid-email' }).success, false);
  assert.equal(Object.hasOwn(settingsSchema.shape, 'maintenance_allowed_emails'), false);
  assert.equal(resourceSchema(resources.settings).parse({ ...values, maintenance_enabled: true }).maintenance_enabled, true);
  assert.equal(resourceSchema(resources.settings).safeParse({ ...values, maintenance_enabled: 'true' }).success, false);
  assert.equal(settingsSchema.shape.maintenance_enabled.parse(undefined), false);
  assert.equal(resourceSchema(resources.settings).parse(values).about_content, aboutDefaults.about_content);
  assert.equal(resourceSchema(resources.settings).parse(values).about_full_story, aboutDefaults.about_full_story);
  for (const [key, value] of Object.entries(aboutDefaults)) assert.equal(settingsSchema.shape[key].parse(undefined), value);
  for (const override of [{ about_heading: '' }, { about_eyebrow: 'x'.repeat(101) }, { about_content: 'x'.repeat(10001) }, { about_full_story: 'x'.repeat(20001) }, { about_image_path: 'javascript:alert(1)' }]) {
    assert.equal(resourceSchema(resources.settings).safeParse({ ...values, ...override }).success, false);
  }
  assert.equal(resourceSchema(resources.settings).parse({ ...values, about_full_story: '<p onclick="alert(1)"><strong>Our story</strong></p><script>alert(1)</script>' }).about_full_story, '<p><strong>Our story</strong></p>');
  assert.equal(resourceSchema(resources.settings).parse({ ...values, about_image_path: 'images/about/featured.jpg' }).about_image_path, 'images/about/featured.jpg');
  const storyImages = resourceSchema(resources.settings).parse({ ...values, about_page_image_1_path: 'images/about/story-one.webp', about_page_image_2_path: 'images/about/story-two.jpg', about_page_image_3_path: 'images/about/story-three.avif' });
  assert.equal(storyImages.about_page_image_1_path, 'images/about/story-one.webp');
  assert.equal(storyImages.about_page_image_2_path, 'images/about/story-two.jpg');
  assert.equal(storyImages.about_page_image_3_path, 'images/about/story-three.avif');
});

test('public content accepts admin images and event ordering while retaining legacy defaults', () => {
  assert.equal(eventSchema.shape.sort_order.parse(undefined), 0);
  assert.equal(eventSchema.shape.sort_order.parse(20), 20);
  assert.equal(testimonialSchema.shape.image_path.parse(undefined), null);
  assert.equal(testimonialSchema.shape.image_path.parse('images/testimonials/example.jpg'), 'images/testimonials/example.jpg');
});

test('admin event serving windows may start before and end after event dates but must stay ordered', () => {
  const schema = resourceSchema(resources.events);
  const event = { ...formPayload(resources.events, formDefaults(resources.events)), title: 'Cinema', slug: 'cinema', venue_name: 'Venue', address_line_1: 'Street', town: 'Town', postcode: 'AB1 2CD',
    starts_at: '2026-10-21T18:00:00Z', ends_at: '2026-10-21T21:00:00Z', orders_open_at: '2026-10-21T17:00:00Z', orders_close_at: '2026-10-21T22:00:00Z' };
  assert.equal(schema.safeParse(event).success, true);
  assert.equal(schema.safeParse({ ...event, orders_close_at: '2026-10-21T20:00:00Z' }).success, true);
  assert.equal(schema.safeParse({ ...event, orders_open_at: null, orders_close_at: null }).success, true);
  assert.equal(schema.safeParse({ ...event, orders_open_at: event.orders_close_at }).success, false);
  assert.equal(schema.safeParse({ ...event, orders_open_at: null, orders_close_at: '2026-10-21T17:00:00Z' }).success, false);
});

test('admin resources whitelist fields and validate prices and choices', () => {
  const description = resourceSchema(resources.menu).shape.description;
  assert.equal(description.parse('<p onclick="alert(1)"><strong>Fresh</strong></p><script>alert(1)</script>'), '<p><strong>Fresh</strong></p>');
  assert.equal(description.safeParse('a'.repeat(10001)).success, false);
  assert.equal(description.parse('First paragraph\n\nSecond paragraph'), '<p>First paragraph</p><p>Second paragraph</p>');
  assert.equal(getResource('__proto__'), undefined);
  assert.equal(getResource('orders'), undefined);
  const schema = resourceSchema(resources.options);
  const input = { ...formPayload(resources.options, formDefaults(resources.options)), modifier_group_id: '00000000-0000-4000-8000-000000000001', name: 'Extra sauce', price_pence: 1.50, allergens: ['milk'], is_available: true };
  assert.equal(schema.parse(input).price_pence, 150);
  assert.equal(schema.parse({ ...input, description: '<p onclick="bad()"><strong>Cola</strong></p><script>bad()</script>', image_path: 'images/menu/cola.webp' }).description, '<p><strong>Cola</strong></p>');
  for (const change of [{ description: 'x'.repeat(10001) }, { image_alt: 'x'.repeat(301) }, { image_path: 'javascript:bad()' }]) assert.equal(schema.safeParse({ ...input, ...change }).success, false);
  const legacy = optionSchema.parse({ id: input.modifier_group_id, modifier_group_id: input.modifier_group_id, name: input.name, price_pence: 150, allergens: [], is_available: true, sort_order: 0 });
  assert.equal(legacy.description, '');
  assert.equal(legacy.image_path, null);
  assert.equal(legacy.image_alt, '');
  for (const change of [{ price_pence: -1 }, { price_pence: 1.001 }, { role: 'admin' }, { allergens: ['unknown'] }, { is_available: 'true' }]) assert.equal(schema.safeParse({ ...input, ...change }).success, false);
  assert.equal(resourceSchema(resources.modifiers).safeParse({ name: 'Fillings', min_selections: 3, max_selections: 2, is_published: true }).success, false);
});

test('admin forms preserve money and convert London dates without accepting missing DST times', () => {
  const resource = { fields: [{ key: 'price', type: 'money' }, { key: 'starts', type: 'datetime' }, { key: 'ends', type: 'datetime', nullable: true }] };
  const defaults = formDefaults(resource, { price: 850, starts: '2026-09-21T12:30:00Z', ends: null });
  assert.deepEqual(defaults, { price: 8.5, starts: '2026-09-21T13:30', ends: '' });
  assert.deepEqual(formPayload(resource, defaults), { price: 8.5, starts: '2026-09-21T12:30:00.000Z', ends: null });
  assert.equal(formPayload(resource, { ...defaults, starts: '2026-03-29T01:30' }).starts, 'Invalid local time');
});

test('order filters validate multiple values, preserve pagination choices and reset all restrictions', () => {
  const events = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  const filters = parseOrderFilters({ status: ['ordered', 'collected', 'ordered', 'invalid'], event: [...events, 'invalid'], q: ' Alex ', page: '2' });
  assert.deepEqual(filters, { statuses: ['ordered', 'collected'], events, search: 'Alex', page: 2 });
  const params = orderFilterParams(filters.search, filters.statuses, filters.events);
  params.set('page', '3');
  assert.deepEqual(params.getAll('status'), filters.statuses);
  assert.deepEqual(params.getAll('event'), events);
  assert.equal(params.get('page'), '3');
  assert.equal(orderFilterParams('', [], []).toString(), 'status=all');
  assert.deepEqual(parseOrderFilters({ status: 'all' }).statuses, []);
  assert.deepEqual(parseOrderFilters({}).statuses, []);
  assert.deepEqual(parseOrderFilters({ status: 'active' }).statuses, ['pending_payment', 'ordered', 'preparing', 'ready_for_pickup']);
  assert.deepEqual(parseOrderFilters({ status: 'invalid', event: 'invalid' }).statuses, parseOrderFilters({}).statuses);
  assert.deepEqual(parseOrderFilters({ status: 'collected', event: events[0] }).events, [events[0]]);
  assert.equal(parseOrderFilters({ q: ' A/2,(status.eq.cancelled) ' }).search, 'A/2status.eq.cancelled');
});

test('order controls expose only legal workflow operations and never fake card payments', () => {
  assert.deepEqual(orderOperations('pending_payment', 'card', 'unpaid').map((entry) => entry.value), ['cancelled']);
  assert.ok(!orderOperations('ready_for_pickup', 'cash', 'unpaid').some((entry) => entry.value === 'collected'));
  assert.ok(orderOperations('ready_for_pickup', 'cash', 'paid').some((entry) => entry.value === 'collected'));
  assert.deepEqual(orderOperations('cancelled', 'cash', 'unpaid'), []);
  assert.deepEqual(orderOperations('collected', 'card', 'paid'), []);
});