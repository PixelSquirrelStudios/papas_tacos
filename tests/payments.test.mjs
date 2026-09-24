import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import Stripe from 'stripe';
import { PDFDocument } from 'pdf-lib';
import { createReceipt } from '../src/lib/payments/receipt.ts';
import { checkoutSchema } from '../src/lib/payments/validation.ts';
import { orderConfirmationEmail } from '../src/lib/payments/confirmation-email.ts';

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

test('checkout uses trusted order prices and a stable Stripe idempotency key', async () => {
  const state = { maintenance: false, viewer: { user: { id: customerId, email: fixtureOrder.customer_email } }, calls: [], sessions: [], configured: true, existing: false };
  globalThis.__paymentTest = state;
  const originalOrigin = process.env.SITE_URL;
  process.env.SITE_URL = 'https://tacos.example';
  const order = { ...fixtureOrder, status: 'pending_payment', reservation_expires_at: new Date(Date.now() + 60 * 60000).toISOString() };
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
    assert.match(session.success_url, /payment=returned/);
    assert.equal(state.calls[1][0], 'attach_stripe_checkout');
    state.existing = true;
    assert.equal((await startCheckout(input)).url, 'https://checkout.stripe.com/existing');
    assert.equal(state.sessions.length, 1);
    state.maintenance = true;
    assert.match((await startCheckout(input)).error, /unavailable/);
    state.maintenance = false;
    state.viewer = null;
    assert.match((await startCheckout(input)).error, /Sign in/);
    assert.equal(state.sessions.length, 1);
  } finally {
    delete globalThis.__paymentTest;
    if (originalOrigin === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = originalOrigin;
  }
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
    const event = { id: 'evt_test_paid', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_paid', metadata: { order_id: orderId, integration: 'papas_tacos' }, payment_status: 'paid', payment_intent: 'pi_test_paid', currency: 'gbp', amount_total: 1275 } } };
    const send = (value = event, signature) => {
      const payload = JSON.stringify(value);
      return POST(new Request('https://tacos.example/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_fixture' }) } }));
    };
    assert.equal((await send(event, 'invalid')).status, 400);
    assert.equal(state.calls.length, 0);
    assert.equal((await send()).status, 200);
    assert.equal(state.calls[0][0], 'process_stripe_checkout');
    assert.equal(state.calls[0][1].amount, 1275);
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

test('receipt PDFs handle long multi-page orders and refunded payments', async () => {
  const pdf = await createReceipt({ ...fixtureOrder, customer_name: 'Jos\u00e9', order_items: Array.from({ length: 80 }, () => fixtureOrder.order_items[0]) }, { paidAt: fixtureOrder.created_at, refunded: 500 });
  const document = await PDFDocument.load(pdf);
  assert.ok(document.getPageCount() > 1);
  assert.equal(document.getTitle(), "Papa's Tacos - Receipt 1234");
});

test('receipt endpoint requires ownership and payment before returning private PDFs', async () => {
  const state = { viewer: null, order: fixtureOrder, paymentReads: 0 };
  globalThis.__receiptTest = state;
  try {
    const { GET } = await load('src/app/api/account/orders/[id]/receipt/route.ts', {
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