import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import Stripe from 'stripe';
import { PDFDocument } from 'pdf-lib';
import { createReceipt } from '../src/lib/payments/receipt.ts';
import { checkoutSchema } from '../src/lib/payments/validation.ts';
import { orderConfirmationEmail } from '../src/lib/payments/confirmation-email.ts';
import { groupOrderChoices, orderChoicesText } from '../src/lib/account/order-breakdown.ts';
import { mkdir, writeFile } from 'node:fs/promises';

test('saved order breakdown groups each taco and omits zero extra charges', () => {
  const choices = [
    { group_name: 'Taco 2 Filling / Sauces', option_name: 'Salsa', unit_price_pence: 0 },
    { group_name: 'Taco 1 Filling / Extras', option_name: 'Cheese', unit_price_pence: 100 },
    { group_name: 'Taco 1 Filling', option_name: 'Chicken', unit_price_pence: 0 },
  ];
  assert.deepEqual(groupOrderChoices(choices).map((group) => group.title), ['Taco 1', 'Taco 2']);
  assert.equal(orderChoicesText(choices), 'Taco 1\n  Filling: Chicken\n  Extras: Cheese (+£1.00 each)\nTaco 2\n  Sauces: Salsa');
});

const orderId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000002';
const fixtureOrder = {
  id: orderId, order_number: 1234, customer_id: customerId, customer_name: 'Customer', customer_email: 'customer@example.test',
  customer_phone: '07000000000', customer_note: '', created_at: new Date().toISOString(), status: 'ordered', payment_method: 'card', payment_status: 'paid',
  subtotal_pence: 1200, service_fee_pence: 50, packaging_fee_pence: 25, total_pence: 1275,
  pickup_starts_at: '2026-09-25T17:00:00Z', pickup_ends_at: '2026-09-25T17:15:00Z', pickup_location: { venue_name: 'Test Market', town: 'Cardiff' },
  order_items: [{ id: orderId, item_name: 'Two tacos', quantity: 2, line_total_pence: 1200, unit_price_pence: 500, unit_extras_pence: 100, allergen_snapshot: ['milk'], order_item_modifiers: [{ id: orderId, group_name: 'Filling', option_name: 'Cheese', unit_price_pence: 100 }] }],
  order_status_history: [], cancellation_reason: null, reservation_expires_at: null,
};

async function load(entry, modules) {
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(process.cwd() + '/package.json');" }, plugins: [{ name: 'payments-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(modules, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: modules[args.path] }));
  } }] });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

test('pickup email has prominent order reference, escaped content, pickup details and receipt link', () => {
  const email = orderConfirmationEmail({ ...fixtureOrder, customer_name: '<script>Customer</script>', customer_note: '<img src=x onerror=alert(1)>', order_items: [{ ...fixtureOrder.order_items[0], item_name: '<b>Tacos</b>' }] }, {
    siteUrl: 'https://tacos.example', logoUrl: 'https://images.example/logo.svg', instagramUrl: null, facebookUrl: null,
  });
  assert.match(email.subject, /Order #1234 confirmed for pickup/);
  assert.match(email.html, /font-size:32px[^>]*>Order #1234/);
  assert.match(email.text, /Show this order number to our staff/);
  assert.match(email.text, /Test Market, Cardiff/);
  assert.match(email.text, /25 Sept 2026, 18:00 - 18:15/);
  assert.match(email.text, /Total paid: £12.75/);
  assert.match(email.text, /view=orders&order=00000000-0000-4000-8000-000000000001/);
  assert.match(email.html, /View order and receipt/);
  assert.match(email.html, /&lt;script&gt;Customer/);
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!email.html.includes('<script>'));
  assert.ok(!email.html.includes('<b>Tacos</b>'));
});

test('stage emails distinguish confirmation preparation ready and collected review requests', () => {
  const brand = {siteUrl:'https://tacos.example',logoUrl:'https://images.example/logo.svg',instagramUrl:'https://instagram.com/papas',facebookUrl:'https://facebook.com/papas'};
  for (const [stage, phrase] of [['ordered', 'confirmed for pickup'], ['preparing', 'is being prepared'], ['ready_for_pickup', 'is ready for pickup'], ['collected', 'collected - thank you!'], ['cancelled', 'has been cancelled']]) {
    const email = orderConfirmationEmail({...fixtureOrder, status:stage}, brand, stage);
    assert.ok(email.subject.includes(phrase));
    assert.ok(email.html.includes('border-left:1px solid'));
    assert.ok(email.html.includes('Cheese'));
    if (stage === 'collected') {
      assert.match(email.text, /leave us a review on Facebook/);
      assert.match(email.html, /href="https:\/\/facebook.com\/papas"[^>]*>Leave a review on Facebook/);
      assert.match(email.html, /Share your visit on Instagram/);
      assert.ok(!email.text.includes('Show this order number'));
      assert.ok(!email.html.includes('Your order is ready.'));
    }
  }
});

test('status delivery retries identical payloads and blocks later stages after failure', async () => {
  const state = {entries:['preparing','ready_for_pickup'].map((status, index) => ({id:`event-${index}`, order_id:orderId,status,order_snapshot:{...fixtureOrder,status},payload:null,payload_created_at:null,sent_at:null})), requests:[], markError:true};
  globalThis.__statusTest = state;
  state.database = {from() {
    const filters = [];
    let update;
    const execute = () => {
      const rows = state.entries.filter((entry) => filters.every(([key,value]) => entry[key] === value));
      if (update) {
        if (update.sent_at && state.markError) return {error:{}};
        rows.forEach((entry) => Object.assign(entry, structuredClone(update)));
      }
      return {data:rows,error:null};
    };
    const query = {select:()=>query,is:(key,value)=>{filters.push([key,value]);return query;},eq:(key,value)=>{filters.push([key,value]);return query;},order:()=>query,limit:()=>query,update:(value)=>{update=value;return query;},single:async()=>{const result=execute();return {...result,data:result.data?.[0]};},then:(resolve,reject)=>Promise.resolve(execute()).then(resolve,reject)};
    return query;
  }};
  const previous = {key:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL};
  process.env.RESEND_API_KEY = 'test-fixture';
  process.env.RESEND_FROM_EMAIL = 'orders@example.test';
  try {
    const {sendOrderStatusEmails} = await load('src/lib/payments/send-status-emails.ts', {
      'server-only':'', './server':'export const paymentDatabase = () => globalThis.__statusTest.database;',
      '@/lib/catalogue/data':'export const getSettings = async () => ({contact_email:"hello@example.test",instagram_url:null,facebook_url:null});',
      '@/lib/supabase/config':'export const supabaseConfig = () => ({url:"https://images.example"});',
      'resend':'export class Resend { emails = {send:async (payload,options) => {globalThis.__statusTest.requests.push([structuredClone(payload),options]);return {data:{id:"email-accepted"}};}};}',
    });
    assert.deepEqual(await sendOrderStatusEmails(orderId), {sent:0,failed:1});
    assert.equal(state.requests.length, 1);
    assert.equal(state.entries[1].payload, null);
    state.markError = false;
    assert.deepEqual(await sendOrderStatusEmails(orderId), {sent:2,failed:0});
    assert.deepEqual(state.requests[0], state.requests[1]);
    assert.equal(state.requests[1][1].idempotencyKey, 'order-status/event-0');
    assert.deepEqual(await sendOrderStatusEmails(), {sent:0,failed:0});
    assert.equal(state.requests.length, 3);
    state.entries[0].sent_at = null;
    state.entries[0].payload_created_at = new Date(Date.now() - 24*60*60*1000).toISOString();
    assert.deepEqual(await sendOrderStatusEmails(), {sent:0,failed:1});
    assert.equal(state.requests.length, 3);
  } finally {
    delete globalThis.__statusTest;
    if (previous.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previous.key;
    if (previous.from === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previous.from;
  }
});

test('confirmation delivery retries the same snapshot and suppresses duplicates without emailing cancelled orders', async () => {
  const state = { order: structuredClone(fixtureOrder), delivery: null, requests: [], markError: true, sendError: false, tableError: false };
  globalThis.__confirmationTest = state;
  state.database = {
    from(table) {
      let update;
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: state.delivery, error: state.tableError ? {} : null }),
        single: async () => ({ data: table === 'orders' ? state.order : state.delivery, error: null }),
        upsert: async (values, options) => {
          assert.equal(options.ignoreDuplicates, true);
          if (!state.delivery) state.delivery = { ...structuredClone(values), created_at: new Date().toISOString(), sent_at: null, resend_email_id: null };
          return { error: null };
        },
        update: (values) => { update = values; return query; },
        is: async () => {
          if (state.markError) return { error: {} };
          Object.assign(state.delivery, update);
          return { error: null };
        },
      };
      return query;
    },
  };
  const keys = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'SITE_URL'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.RESEND_API_KEY = 're_fixture';
  process.env.RESEND_FROM_EMAIL = 'orders@example.test';
  process.env.SITE_URL = 'https://tacos.example';
  try {
    const { sendOrderConfirmation } = await load('src/lib/payments/send-confirmation.ts', {
      'server-only': '', './server': 'export const paymentDatabase = () => globalThis.__confirmationTest.database;',
      '@/lib/catalogue/data': 'export const getSettings = async () => ({ contact_email: "hello@example.test" });',
      '@/lib/supabase/config': 'export const supabaseConfig = () => ({url: "https://supabase.example"});',
      resend: `export class Resend { constructor() { this.emails = { send: async (payload, options) => {
        const state = globalThis.__confirmationTest;
        state.requests.push(structuredClone({payload, options}));
        return state.sendError ? {error: {message: 'Unavailable'}} : {data: {id: 'email_123'}};
      }}; } }`,
    });
    await assert.rejects(sendOrderConfirmation(orderId), /could not be recorded/);
    assert.equal(state.requests.length, 1);
    assert.deepEqual(state.requests[0].payload.to, [fixtureOrder.customer_email]);
    assert.equal(state.requests[0].payload.replyTo, 'hello@example.test');
    assert.equal(state.requests[0].options.idempotencyKey, `order-confirmation/${orderId}`);
    state.order.customer_name = 'Changed name';
    process.env.RESEND_FROM_EMAIL = 'changed@example.test';
    state.markError = false;
    await sendOrderConfirmation(orderId);
    assert.deepEqual(state.requests[1], state.requests[0]);
    assert.equal(state.delivery.resend_email_id, 'email_123');
    await sendOrderConfirmation(orderId);
    assert.equal(state.requests.length, 2);
    for (const order of [{ ...fixtureOrder, status: 'cancelled' }, { ...fixtureOrder, payment_status: 'unpaid' }, { ...fixtureOrder, payment_status: 'refunded' }]) {
      state.order = order;
      state.delivery = null;
      await sendOrderConfirmation(orderId);
      assert.equal(state.delivery, null);
    }
    state.order = fixtureOrder;
    state.sendError = true;
    await assert.rejects(sendOrderConfirmation(orderId), /was not accepted/);
    assert.equal(state.delivery.sent_at, null);
    const sent = state.requests.length;
    state.delivery.created_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await assert.rejects(sendOrderConfirmation(orderId), /requires reconciliation/);
    assert.equal(state.requests.length, sent);
    state.tableError = true;
    await assert.rejects(sendOrderConfirmation(orderId), /records unavailable/);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
    delete globalThis.__confirmationTest;
  }
});

test('checkout input rejects client prices, invalid choices and oversized bags', () => {
  const input = { key: orderId, slotId: orderId, name: 'Customer', phone: '07000000000', note: '', expectedTotal: 1275, lines: [{ itemId: orderId, optionIds: [], quantity: 2 }] };
  assert.equal(checkoutSchema.safeParse(input).success, true);
  for (const invalid of [{ ...input, subtotal: 1 }, { ...input, expectedTotal: -1 }, { ...input, lines: [] }, { ...input, lines: Array(51).fill(input.lines[0]) }, { ...input, lines: [{ ...input.lines[0], quantity: 100 }] }]) assert.equal(checkoutSchema.safeParse(invalid).success, false);
});

test('checkout presents authoritative pickup statuses and fails closed when availability fails', async () => {
  const state = { slots: [{ id: orderId, status: 'available' }, { id: customerId, status: 'taken' }], error: false };
  globalThis.__slotTest = state;
  try {
    const { default: CheckoutPage } = await load('src/app/(public)/checkout/page.tsx', {
      'next/link': 'export default "a";',
      '@/lib/auth/session': 'export async function requireAccount() { return {user:{email:"admin@example.test"},profile:{role:"admin"}}; }',
      '@/lib/payments/server': 'export const checkoutConfigured = () => true;',
      '@/components/bag/checkout-form': 'export const CheckoutForm = "checkout-fixture";',
      '@/lib/payments/pickup': 'export async function getPickupChoices() { return globalThis.__slotTest; }',
    });
    const page = await CheckoutPage();
    assert.deepEqual(page.props.children.at(-1).props.slots, state.slots);
    state.slots = [];
    assert.deepEqual((await CheckoutPage()).props.children.at(-1).props.slots, []);
    state.error = true;
    assert.equal((await CheckoutPage()).props.children.at(-1).props.role, 'alert');
  } finally { delete globalThis.__slotTest; }
});

test('checkout uses trusted order prices and a stable Stripe idempotency key', async () => {
  const state = { maintenance: false, viewer: { user: { id: customerId, email: fixtureOrder.customer_email } }, calls: [], sessions: [], configured: true, existing: false };
  globalThis.__paymentTest = state;
  const originalOrigin = process.env.SITE_URL;
  process.env.SITE_URL = 'https://tacos.example';
  const order = { ...fixtureOrder, status: 'pending_payment', reservation_expires_at: new Date(Date.now() + 5 * 60000).toISOString() };
  state.order = order;
  try {
    const { startCheckout } = await load('src/app/(public)/checkout/actions.ts', {
      'server-only': '', 'next/headers': 'export async function headers() { return new Headers({ origin: "https://tacos.example" }); }',
      'next/navigation': 'export function redirect(path) { throw new Error(path); }', 'next/cache': 'export function revalidatePath() {}',
      '@/lib/auth/session': 'export async function getViewer() { return globalThis.__paymentTest.viewer; }',
      '@/lib/catalogue/data': 'export async function getMaintenanceMode() { return globalThis.__paymentTest.maintenance; }',
      '@/lib/payments/server': `export const checkoutConfigured = () => globalThis.__paymentTest.configured;
        export const paymentDatabase = () => ({
          rpc: async (name, args) => { const state = globalThis.__paymentTest; state.calls.push([name, args]); return { data: name === 'reserve_card_order' ? state.order : null, error: null }; },
          from: (table) => { const state = globalThis.__paymentTest; const query = {
            select: () => query, eq: () => query, order: () => query,
            single: async () => ({ data: { stripe_checkout_session_id: state.existing ? 'cs_test_existing' : null } }),
            then: (resolve) => resolve({ data: state.order.order_items, error: null }),
          }; return query; },
        });
        export const stripeClient = () => ({ checkout: { sessions: {
          create: async (params, options) => { globalThis.__paymentTest.sessions.push([params, options]); return {id: 'cs_test_new', url: 'https://checkout.stripe.com/test', expires_at: params.expires_at}; },
          retrieve: async () => ({status: 'open', url: 'https://checkout.stripe.com/existing'}),
        } } });`,
    });
    const input = { key: orderId, slotId: orderId, name: 'Customer', phone: '07000000000', note: '', expectedTotal: 1275, lines: [{ itemId: orderId, optionIds: [], quantity: 2 }] };
    assert.equal((await startCheckout(input)).url, 'https://checkout.stripe.com/test');
    assert.equal(state.calls[0][1].payload.email, fixtureOrder.customer_email);
    assert.equal(state.calls[0][1].customer_uuid, customerId);
    const [session, options] = state.sessions[0];
    assert.equal(options.idempotencyKey, `checkout-${orderId}`);
    assert.equal(session.line_items.reduce((sum, item) => sum + item.quantity * item.price_data.unit_amount, 0), 1275);
    assert.deepEqual(session.payment_method_types, ['card']);
    assert.equal(session.expires_at, Math.floor(new Date(order.created_at).getTime() / 1000) + 2 * 60 * 60);
    assert.ok(session.expires_at * 1000 > Date.parse(order.reservation_expires_at));
    assert.match(session.custom_text.submit.message, /Complete payment by .* UK time.*cancelled and refunded/);
    assert.match(session.success_url, /payment=returned/);
    assert.equal(state.calls[1][0], 'attach_stripe_checkout');
    state.existing = true;
    assert.equal((await startCheckout(input)).url, 'https://checkout.stripe.com/existing');
    assert.equal(state.sessions.length, 1);
    const savedDeadline = order.reservation_expires_at;
    order.reservation_expires_at = new Date(Date.now() - 1000).toISOString();
    assert.match((await startCheckout(input)).error, /deadline.*passed/);
    state.existing = false;
    assert.match((await startCheckout(input)).error, /deadline.*passed/);
    assert.equal(state.sessions.length, 1);
    order.reservation_expires_at = savedDeadline;
    assert.equal((await startCheckout(input)).url, 'https://checkout.stripe.com/test');
    assert.deepEqual(state.sessions[1], state.sessions[0]);
    state.maintenance = true;
    assert.match((await startCheckout(input)).error, /unavailable/);
    const callsBeforeAdmin = state.calls.length;
    state.viewer.profile = { role: 'customer' };
    assert.match((await startCheckout(input)).error, /unavailable/);
    assert.equal(state.calls.length, callsBeforeAdmin);
    state.viewer.profile = { role: 'admin' };
    state.existing = true;
    assert.equal((await startCheckout(input)).url, 'https://checkout.stripe.com/existing');
    state.maintenance = null;
    assert.match((await startCheckout(input)).error, /unavailable/);
    state.maintenance = true;
    state.configured = false;
    assert.match((await startCheckout(input)).error, /unavailable/);
    state.configured = true;
    state.maintenance = false;
    state.viewer = null;
    assert.match((await startCheckout(input)).error, /Sign in/);
    assert.equal(state.sessions.length, 2);
  } finally {
    delete globalThis.__paymentTest;
    if (originalOrigin === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = originalOrigin;
  }
});

test('resume checkout reuses only an owned unpaid reservation before its deadline', async () => {
  const order = { ...fixtureOrder, status: 'pending_payment', payment_status: 'unpaid', reservation_expires_at: new Date(Date.now() + 60000).toISOString() };
  const state = { order, viewer: { user: { id: customerId, email: fixtureOrder.customer_email } }, maintenance: false, configured: true, sessionId: 'cs_test_existing', session: { status: 'open', url: 'https://checkout.stripe.com/existing' }, reads: [], retrieves: [], failure: false };
  globalThis.__resumeTest = state;
  try {
    const { resumeCheckout } = await load('src/app/(public)/checkout/actions.ts', {
      'next/headers': 'export async function headers() {}', 'next/navigation': 'export function redirect() {}', 'next/cache': 'export function revalidatePath() {}',
      '@/lib/auth/session': 'export const getViewer = async () => globalThis.__resumeTest.viewer;',
      '@/lib/catalogue/data': 'export const getMaintenanceMode = async () => globalThis.__resumeTest.maintenance;',
      '@/lib/payments/server': `export const checkoutConfigured = () => globalThis.__resumeTest.configured;
        export const paymentDatabase = () => ({from(table) { const state = globalThis.__resumeTest; const query = {
          select: () => query, eq: (key, value) => {state.reads.push([table,key,value]); return query;},
          single: async () => ({data: table === 'orders' ? state.order : {stripe_checkout_session_id:state.sessionId}, error:null}),
        }; return query; }});
        export const stripeClient = () => ({checkout:{sessions:{retrieve:async (id) => {const state = globalThis.__resumeTest; state.retrieves.push(id); if(state.failure) throw new Error('offline'); return state.session;}}}});`,
    });
    assert.deepEqual(await resumeCheckout(orderId), { url: state.session.url, orderId });
    assert.ok(state.reads.some(([table, key, value]) => table === 'orders' && key === 'customer_id' && value === customerId));
    assert.deepEqual(state.retrieves, ['cs_test_existing']);
    for (const change of [{ customer_id: orderId }, { status: 'cancelled' }, { status: 'ordered' }, { payment_status: 'paid' }, { payment_method: 'cash' }, { reservation_expires_at: null }, { reservation_expires_at: 'invalid' }, { reservation_expires_at: new Date(Date.now() - 1000).toISOString() }]) {
      state.order = { ...order, ...change };
      assert.ok((await resumeCheckout(orderId)).error);
    }
    assert.equal(state.retrieves.length, 1);
    state.order = order;
    state.sessionId = null;
    assert.match((await resumeCheckout(orderId)).error, /No payment session/);
    state.sessionId = 'cs_test_existing';
    for (const status of ['complete', 'expired']) {
      state.session.status = status;
      assert.match((await resumeCheckout(orderId)).error, /session has ended/);
    }
    state.session.status = 'open';
    state.failure = true;
    assert.match((await resumeCheckout(orderId)).error, /could not reopen/);
    state.failure = false;
    state.maintenance = true;
    assert.match((await resumeCheckout(orderId)).error, /unavailable/);
    state.viewer.profile = { role: 'admin' };
    assert.ok((await resumeCheckout(orderId)).url);
    state.maintenance = null;
    assert.match((await resumeCheckout(orderId)).error, /unavailable/);
    state.maintenance = false;
    state.configured = false;
    assert.match((await resumeCheckout(orderId)).error, /unavailable/);
    state.configured = true;
    state.viewer = null;
    assert.match((await resumeCheckout(orderId)).error, /Sign in/);
    assert.match((await resumeCheckout('invalid')).error, /could not be found/);
  } finally { delete globalThis.__resumeTest; }
});

test('catalogue API enforces maintenance access without changing saved ordering status', async () => {
  const state = { maintenance: true, viewer: null, reads: 0 };
  globalThis.__catalogueAccess = state;
  try {
    const { GET } = await load('src/app/api/catalogue/route.ts', {
      '@/lib/auth/session': 'export async function getViewer() { return globalThis.__catalogueAccess.viewer; }',
      '@/lib/catalogue/data': `export const getMaintenanceMode = async () => globalThis.__catalogueAccess.maintenance;
        export async function getCatalogue() { globalThis.__catalogueAccess.reads++; return {available:true}; }
        export const getSettings = async () => ({maintenance_enabled:globalThis.__catalogueAccess.maintenance,ordering_status:'open'});
        export const getEvents = async () => ({events:[]});`,
    });
    for (const viewer of [null, { profile: { role: 'customer' } }, { profile: null }]) {
      state.viewer = viewer;
      assert.equal((await GET()).status, 503);
    }
    assert.equal(state.reads, 0);
    state.viewer = { profile: { role: 'admin' } };
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).settings.ordering_status, 'open');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    state.maintenance = null;
    assert.equal((await GET()).status, 503);
    state.maintenance = false;
    state.viewer = null;
    assert.equal((await GET()).status, 200);
  } finally { delete globalThis.__catalogueAccess; }
});

test('checkout slot requests preserve session identity and fail closed on access or schema errors', async () => {
  const originalFetch = globalThis.fetch;
  const state = { session: { access_token: 'session-fixture' }, error: null, status: 200, body: [], requests: [] };
  globalThis.__pickupAccess = state;
  globalThis.fetch = async (url, options) => {
    state.requests.push({ url: String(url), options });
    return Response.json(state.body, { status: state.status });
  };
  try {
    const { getPickupChoices } = await load('src/lib/payments/pickup.ts', {
      'server-only': '',
      '@/lib/supabase/config': 'export const supabaseConfig = () => ({url:"https://supabase.example",key:"anonymous-fixture"});',
      '@/lib/supabase/server': 'export const createServerSupabase = async () => ({auth:{getSession:async () => ({data:{session:globalThis.__pickupAccess.session},error:globalThis.__pickupAccess.error})}});',
    });
    assert.deepEqual(await getPickupChoices(), { slots: [], error: false });
    assert.match(state.requests[0].url, /get_checkout_pickup_choices$/);
    assert.equal(state.requests[0].options.headers.Authorization, 'Bearer session-fixture');
    assert.equal(state.requests[0].options.cache, 'no-store');
    state.session = null;
    assert.equal((await getPickupChoices()).error, false);
    assert.equal(state.requests.at(-1).options.headers.Authorization, 'Bearer anonymous-fixture');
    state.status = 401;
    assert.equal((await getPickupChoices()).error, true);
    state.status = 200;
    state.body = [{ status: 'available' }];
    assert.equal((await getPickupChoices()).error, true);
    state.error = new Error('Session lookup failed');
    const before = state.requests.length;
    assert.equal((await getPickupChoices()).error, true);
    assert.equal(state.requests.length, before);
  } finally { globalThis.fetch = originalFetch; delete globalThis.__pickupAccess; }
});

test('webhooks require valid signatures, retry failed writes and never accept live events', async () => {
  const stripe = new Stripe('sk_test_fixture');
  const state = { stripe, calls: [], fail: false, refund: false, refunds: [], confirmations: [], emailFail: false };
  stripe.refunds.create = async (...args) => { state.refunds.push(args); return {}; };
  globalThis.__webhookTest = state;
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture';
  try {
    const server = `export const stripeClient = () => globalThis.__webhookTest.stripe;
      export const paymentDatabase = () => ({rpc: async (name, args) => { const state = globalThis.__webhookTest; state.calls.push([name,args]); return {data: state.refund, error: state.fail ? {} : null}; }});`;
    const { POST } = await load('src/app/api/stripe/webhook/route.ts', { 'server-only': '', '@/lib/payments/server': server, './server': server,
      './send-confirmation': 'export async function sendOrderConfirmation(id) { const state = globalThis.__webhookTest; if (state.emailFail) throw new Error("Email unavailable"); state.confirmations.push(id); }',
    });
    const event = { id: 'evt_test_paid', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), livemode: false, data: { object: { id: 'cs_test_paid', metadata: { order_id: orderId, integration: 'papas_tacos' }, payment_status: 'paid', payment_intent: 'pi_test_paid', currency: 'gbp', amount_total: 1275 } } };
    const send = (value = event, signature) => {
      const payload = JSON.stringify(value);
      return POST(new Request('https://tacos.example/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_fixture' }) } }));
    };
    assert.equal((await send(event, 'invalid')).status, 400);
    assert.equal(state.calls.length, 0);
    assert.equal((await send()).status, 200);
    assert.equal(state.calls[0][0], 'process_stripe_checkout');
    assert.equal(state.calls[0][1].amount, 1275);
    assert.equal(state.calls[0][1].occurred_at, new Date(event.created * 1000).toISOString());
    assert.deepEqual(state.confirmations, [orderId]);
    state.emailFail = true;
    assert.equal((await send()).status, 500);
    state.emailFail = false;
    state.refund = true;
    assert.equal((await send()).status, 200);
    assert.equal(state.refunds[0][1].idempotencyKey, `cancelled-order-${orderId}`);
    assert.equal(state.confirmations.length, 1);
    state.fail = true;
    assert.equal((await send()).status, 500);
    state.fail = false;
    assert.equal((await send({ ...event, livemode: true })).status, 500);
    const calls = state.calls.length;
    assert.equal((await send({ ...event, data: { object: { ...event.data.object, payment_status: 'unpaid' } } })).status, 200);
    assert.equal(state.calls.length, calls);
  } finally {
    delete globalThis.__webhookTest;
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  }
});

test('receipts and confirmation emails omit zero fees but retain charged fees and totals', async () => {
  const originalCreate = PDFDocument.create;
  const drawn = [];
  PDFDocument.create = async (...args) => {
    const document = await originalCreate(...args);
    const addPage = document.addPage.bind(document);
    document.addPage = (...options) => {
      const page = addPage(...options);
      const drawText = page.drawText.bind(page);
      page.drawText = (value, options) => { drawn.push(value); return drawText(value, options); };
      return page;
    };
    return document;
  };
  try {
    for (const [service, packaging] of [[0, 0], [50, 0], [0, 25], [50, 25]]) {
      drawn.length = 0;
      const order = { ...fixtureOrder, service_fee_pence: service, packaging_fee_pence: packaging, total_pence: fixtureOrder.subtotal_pence + service + packaging };
      await createReceipt(order, { paidAt: fixtureOrder.created_at, refunded: 0 });
      assert.equal(drawn.some((text) => text.startsWith('Service fee:')), service > 0);
      assert.equal(drawn.some((text) => text.startsWith('Packaging:')), packaging > 0);
      assert.ok(drawn.includes('Total paid:'));
      assert.ok(drawn.includes(`GBP ${(order.total_pence / 100).toFixed(2)}`));
      const email = orderConfirmationEmail(order, { siteUrl: 'https://tacos.example', logoUrl: 'https://tacos.example/logo.png', instagramUrl: null, facebookUrl: null });
      for (const content of [email.text, email.html]) {
        assert.equal(content.includes('Service fee'), service > 0);
        assert.equal(content.includes('Packaging'), packaging > 0);
        assert.ok(content.includes('Total paid'));
      }
    }
  } finally { PDFDocument.create = originalCreate; }
});

test('receipt PDFs handle long multi-page orders and refunded payments', async () => {
  const pdf = await createReceipt({ ...fixtureOrder, customer_name: 'Jos\u00e9', order_items: Array.from({ length: 80 }, () => fixtureOrder.order_items[0]) }, { paidAt: fixtureOrder.created_at, refunded: 500 });
  const document = await PDFDocument.load(pdf);
  assert.ok(document.getPageCount() > 1);
  assert.equal(document.getTitle(), "Papa's Tacos - Receipt 1234");
});

test('branded PDF renders the logo dividers aligned choices and contact footer', async () => {
  const {getDocument, OPS} = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const {createCanvas} = await import('@napi-rs/canvas');
  const order = {...fixtureOrder, order_items:[{...fixtureOrder.order_items[0],order_item_modifiers:[
    {id:'first',group_name:'Taco 1 Filling',option_name:'Chicken',unit_price_pence:0},
    {id:'sauce',group_name:'Taco 1 Filling / Sauces',option_name:'Smoky Chipotle',unit_price_pence:0},
    {id:'extra',group_name:'Taco 1 Filling / Extras',option_name:'Cheese',unit_price_pence:100},
    {id:'second',group_name:'Taco 2 Filling',option_name:'Beef',unit_price_pence:0},
    {id:'second-sauce',group_name:'Taco 2 Filling / Sauces',option_name:'Mild Salsa',unit_price_pence:0},
  ]}]};
  const pdf = await createReceipt(order, {paidAt:fixtureOrder.created_at,refunded:0}, {email:'hello@papastacos.example',phone:'07000 123456',website:'https://papastacos.example'});
  const loading = getDocument({data:pdf.slice(), useSystemFonts:true});
  const document = await loading.promise;
  try {
    const page = await document.getPage(1);
    const content = (await page.getTextContent()).items.filter((item) => 'str' in item);
    const text = content.map((item) => item.str).join(' ');
    assert.match(text, /hello@papastacos.example/);
    assert.match(text, /07000 123456/);
    assert.match(text, /Taco 1.*Chicken.*Smoky Chipotle.*Cheese.*Taco 2.*Beef/);
    assert.equal(content.find((item) => item.str === 'Filling').transform[4], 60);
    assert.equal(content.find((item) => item.str === 'Chicken').transform[4], 155);
    const operators = await page.getOperatorList();
    assert.ok(operators.fnArray.includes(OPS.paintImageXObject));
    assert.ok(operators.fnArray.includes(OPS.constructPath));
    const viewport = page.getViewport({scale:1.5});
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    await mkdir('test-results/pdf', {recursive:true});
    await writeFile('test-results/pdf/receipt.png', canvas.toBuffer('image/png'));
    await writeFile('test-results/pdf/receipt.pdf', pdf);
  } finally { await loading.destroy(); }
});

test('email retry endpoint requires its server secret and reports delivery failures', async () => {
  const original = process.env.CRON_SECRET;
  const state = {calls:0,failed:0};
  globalThis.__emailRetryTest = state;
  try {
    const {GET} = await load('src/app/api/internal/order-emails/route.ts', {
      '@/lib/payments/send-status-emails':'export async function sendOrderStatusEmails() {const state=globalThis.__emailRetryTest;state.calls++;return {sent:1,failed:state.failed};}',
    });
    delete process.env.CRON_SECRET;
    assert.equal((await GET(new Request('https://tacos.example/api/internal/order-emails'))).status, 503);
    process.env.CRON_SECRET = 'fixture-secret-not-real';
    for (const authorization of ['', 'Bearer wrong']) assert.equal((await GET(new Request('https://tacos.example/api/internal/order-emails', {headers:{authorization}}))).status, 401);
    assert.equal(state.calls, 0);
    const request = () => new Request('https://tacos.example/api/internal/order-emails', {headers:{authorization:'Bearer fixture-secret-not-real'}});
    assert.equal((await GET(request())).status, 200);
    state.failed = 1;
    assert.equal((await GET(request())).status, 503);
  } finally {
    delete globalThis.__emailRetryTest;
    if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
  }
});

test('receipt endpoint requires ownership and payment before returning private PDFs', async () => {
  const state = { viewer: null, order: fixtureOrder, paymentReads: 0 };
  globalThis.__receiptTest = state;
  try {
    const { GET } = await load('src/app/api/account/orders/[id]/receipt/route.ts', {
      '@/lib/catalogue/data': 'export const getSettings = async () => ({contact_email:"hello@example.test",contact_phone:"07000000000"});',
      'server-only': '', '@/lib/auth/session': 'export const getViewer = async () => globalThis.__receiptTest.viewer;',
      '@/lib/account/data': 'export const getCustomerOrder = async () => globalThis.__receiptTest.order;',
      '@/lib/payments/server': `export const paymentDatabase = () => { globalThis.__receiptTest.paymentReads++; const query = {select: () => query, eq: () => query, in: () => query, single: async () => ({ data: { paid_at: '2026-09-24T12:00:00Z', refunded_pence: 0 } })}; return {from: () => query}; };`,
    });
    const request = (download = '') => GET(new Request(`https://tacos.example/api/account/orders/${orderId}/receipt${download}`), { params: Promise.resolve({ id: orderId }) });
    assert.equal((await request()).status, 401);
    state.viewer = { user: { id: customerId } };
    state.order = null;
    assert.equal((await request()).status, 404);
    state.order = { ...fixtureOrder, payment_status: 'unpaid' };
    assert.equal((await request()).status, 409);
    assert.equal(state.paymentReads, 0);
    state.order = fixtureOrder;
    const response = await request('?download=1');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /^attachment;/);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.ok((await response.arrayBuffer()).byteLength > 500);
    assert.match((await request()).headers.get('content-disposition'), /^inline;/);
  } finally { delete globalThis.__receiptTest; }
});