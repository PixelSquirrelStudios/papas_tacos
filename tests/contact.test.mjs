import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import path from 'node:path';
import { enquiryEmail, enquirySchema } from '../src/lib/contact/enquiry.ts';
import { allowEnquiry } from '../src/lib/contact/rate-limit.ts';

const enquiry = { requestId: '00000000-0000-4000-8000-000000000001', name: 'Alex Guest', email: 'alex@example.com', phone: '+44 7700 900123', eventType: 'Wedding', eventDate: '2099-06-12', guests: '80', location: 'Cardiff', message: 'Tacos for our evening wedding reception, please.', website: '' };
const brand = { siteUrl: 'https://papas.example', logoUrl: 'https://cpkzvicxoivdhxjkhexl.supabase.co/storage/v1/object/public/images/Papas_Tacos_Logo_Horizontal.svg', instagramUrl: 'https://instagram.com/papas', facebookUrl: 'https://facebook.com/papas' };

test('booking validation rejects invalid, oversized and past event details', () => {
  assert.equal(enquirySchema.parse(enquiry).guests, 80);
  for (const override of [{ email: 'bad' }, { eventType: 'Invalid' }, { guests: '0' }, { guests: '10001' }, { eventDate: '2000-01-01' }, { eventDate: '2099-02-30' }, { message: 'a'.repeat(5001) }, { name: '' }, { phone: '<script>' }, { recipient: 'attacker@example.com' }]) {
    assert.equal(enquirySchema.safeParse({ ...enquiry, ...override }).success, false);
  }
  assert.equal(enquirySchema.safeParse({ ...enquiry, eventDate: '', guests: '', phone: '' }).success, true);
});

test('branded booking emails escape customer input and include all customer and event details', () => {
  const email = enquiryEmail(enquirySchema.parse({ ...enquiry, name: '<b>Alex</b>', message: '<img src=x onerror=alert(1)>\nSecond line' }), brand);
  assert.match(email.html, /<img[^>]+src="https:\/\/cpkzvicxoivdhxjkhexl\.supabase\.co\/storage\/v1\/object\/public\/images\/Papas_Tacos_Logo_Horizontal\.svg"[^>]+alt="Papa's Tacos"/);
  assert.match(email.html, /href="https:\/\/papas\.example"/);
  assert.match(email.html, /href="https:\/\/instagram\.com\/papas"[^>]*><img[^>]+alt="Instagram"[^>]*><span[^>]*>Instagram<\/span><\/a>/);
  assert.match(email.html, /href="https:\/\/facebook\.com\/papas"[^>]*><img[^>]+alt="Facebook"[^>]*><span[^>]*>Facebook<\/span><\/a>/);
  assert.match(email.html, /cdn\.simpleicons\.org\/instagram\/f0bb7d/);
  assert.match(email.html, /Mexican soul\. Street food spirit\. Made fresh\./);
  assert.match(email.html, /&copy; \d{4} Papa's Tacos/);
  assert.ok(!email.html.includes('South Wales'));
  assert.match(email.html, />EVENTS BOOKING<\/p>/);
  assert.match(email.html, />New Booking Enquiry<\/h1>/);
  for (const heading of ['Customer Details', 'Event Details', 'Their Message']) assert.match(email.html, new RegExp(`>${heading}<\\/h2>`));
  assert.equal(email.subject, "New Wedding Enquiry | Papa's Tacos");
  assert.match(email.text, /EVENTS BOOKING\nNEW BOOKING ENQUIRY/);
  for (const value of ['alex@example.com', '+44 7700 900123', 'Wedding', '12 June 2099', '80', 'Cardiff']) assert.ok(email.html.includes(value));
  assert.ok(!email.html.includes('<img src=x'));
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;<br>Second line/);
  assert.match(email.html, /&lt;b&gt;Alex&lt;\/b&gt;/);
  assert.match(email.text, /not a confirmed booking/);
  assert.match(email.text, /Instagram: https:\/\/instagram\.com\/papas/);
  const withoutSocials = enquiryEmail(enquirySchema.parse(enquiry), { ...brand, instagramUrl: null, facebookUrl: null }).html;
  assert.ok(!withoutSocials.includes('cdn.simpleicons.org'));
  assert.match(withoutSocials, /Mexican soul\. Street food spirit\. Made fresh\./);
});

test('booking rate limits expire and cap attempts', () => {
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(allowEnquiry('test', 0), true);
  assert.equal(allowEnquiry('test', 1), false);
  assert.equal(allowEnquiry('test', 600000), true);
});

test('contact endpoint validates requests and handles Resend success, retries and failures without sending live mail', async () => {
  const state = { calls: [], response: { data: { id: 'email-id' }, error: null }, throws: false };
  globalThis.__contactTest = state;
  const keys = ['SITE_URL', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'BOOKING_ENQUIRY_TO'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { SITE_URL: 'https://papas.example', RESEND_API_KEY: 'test-only', RESEND_FROM_EMAIL: 'bookings@papas.example', BOOKING_ENQUIRY_TO: 'team@papas.example' });
  try {
    const bundle = await build({ entryPoints: ['src/app/api/contact/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'mail-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(server-only|resend|@\/lib\/catalogue\/data)$/ }, (args) => ({ path: args.path, namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({ contents: args.path === 'server-only' ? '' : args.path === 'resend' ? 'export class Resend { emails = { send: async (...args) => { const state = globalThis.__contactTest; state.calls.push(args); if (state.throws) throw new Error("Private provider detail"); return state.response; } }; }' : args.path.endsWith('/data') ? 'export async function getSettings() { return { contact_email: "fallback@papas.example", instagram_url: "https://instagram.com/papas", facebook_url: "https://facebook.com/papas" }; }' : 'export function httpsLink(value) { return value?.startsWith("https://") ? value : null; }' }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }] });
    const { POST } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    let address = 0;
    const request = (body = enquiry, headers = {}) => new Request('https://papas.example/api/contact', { method: 'POST', headers: { origin: 'https://papas.example', 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${++address}`, ...headers }, body: JSON.stringify(body) });
    assert.equal((await POST(request(enquiry, { origin: 'https://evil.example' }))).status, 403);
    assert.equal((await POST(request(enquiry, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal((await POST(request({ ...enquiry, message: 'x'.repeat(25000) }))).status, 400);
    assert.equal((await POST(request({ ...enquiry, email: 'invalid' }))).status, 400);
    assert.equal((await POST(request({ ...enquiry, website: 'spam.example' }))).status, 200);
    assert.equal(state.calls.length, 0);
    assert.equal((await POST(request())).status, 200);
    assert.equal(state.calls[0][0].from, "Papa's Tacos <bookings@papas.example>");
    assert.deepEqual(state.calls[0][0].to, ['team@papas.example']);
    assert.equal(state.calls[0][0].replyTo, enquiry.email);
    assert.match(state.calls[0][0].html, /Papas_Tacos_Logo_Horizontal\.svg/);
    assert.match(state.calls[0][0].html, /alt="Instagram"[^>]*><span[^>]*>Instagram<\/span><\/a>/);
    await POST(request());
    assert.equal(state.calls[0][1].idempotencyKey, state.calls[1][1].idempotencyKey);
    delete process.env.BOOKING_ENQUIRY_TO;
    await POST(request());
    assert.deepEqual(state.calls.at(-1)[0].to, ['fallback@papas.example']);
    state.response = { data: null, error: { message: 'Private provider detail' } };
    const failed = await POST(request());
    assert.equal(failed.status, 502);
    assert.ok(!(await failed.text()).includes('Private provider detail'));
    state.throws = true;
    assert.equal((await POST(request())).status, 502);
    delete process.env.RESEND_FROM_EMAIL;
    assert.equal((await POST(request())).status, 503);
    for (let attempt = 0; attempt < 5; attempt++) await POST(request(enquiry, { 'x-forwarded-for': '198.51.100.1' }));
    assert.equal((await POST(request(enquiry, { 'x-forwarded-for': '198.51.100.1' }))).status, 429);
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    delete globalThis.__contactTest;
  }
});