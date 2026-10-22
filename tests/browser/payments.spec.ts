import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { orderConfirmationEmail } from '../../src/lib/payments/confirmation-email';

const itemId = '00000000-0000-4000-8000-000000000001';
const slotId = '00000000-0000-4000-8000-000000000002';
const pickupChoices = ['available', 'taken', 'locked', 'unavailable'].map((status, index) => ({ id: index === 0 ? slotId : `00000000-0000-4000-8000-00000000000${index + 2}`, event_id: itemId, starts_at: new Date(Date.parse('2099-09-25T17:00:00Z') + index * 20 * 60000).toISOString(), ends_at: new Date(Date.parse('2099-09-25T17:00:00Z') + (index + 1) * 20 * 60000).toISOString(), updated_at: '2026-09-27T12:00:00Z', event_title: 'Friday Market', venue_name: 'Town Market', status }));
let bundle: string;

test('pickup confirmation email displays branding and a clear staff reference', async ({ page }, testInfo) => {
  const order: Parameters<typeof orderConfirmationEmail>[0] = {
    id: itemId, order_number: 1234, status: 'ordered', payment_method: 'card', payment_status: 'paid',
    created_at: '2026-09-24T12:00:00Z', pickup_starts_at: '2026-09-25T17:00:00Z', pickup_ends_at: '2026-09-25T17:15:00Z',
    pickup_location: { venue_name: 'Town Market', address_line_1: 'Market Square', town: 'Cardiff', postcode: 'CF10 1AA' },
    customer_name: 'Alex Taylor', customer_phone: '07000000000', customer_note: 'No cutlery needed, thank you.',
    total_pence: 1675, subtotal_pence: 1600, service_fee_pence: 50, packaging_fee_pence: 25,
    cancellation_reason: null, reservation_expires_at: null, order_status_history: [],
    order_items: [{ id: itemId, item_name: 'Ember Chicken Tacos', quantity: 2, line_total_pence: 1600, allergen_snapshot: [],
      order_item_modifiers: [{ id: slotId, group_name: 'Salsa', option_name: 'Mild salsa', unit_price_pence: 0 }] }],
  };
  const brand = { siteUrl: 'https://tacos.example', logoUrl: 'https://images.example/logo.svg', instagramUrl: 'https://instagram.com/papas', facebookUrl: 'https://facebook.com/papas' };
  const email = orderConfirmationEmail(order, brand);
  await page.route('https://images.example/logo.svg', async (route) => route.fulfill({ contentType: 'image/svg+xml', body: await readFile(path.resolve('public/images/Papas_Tacos_Logo_Horizontal.svg')) }));
  await page.setContent(email.html);
  await expect(page.getByRole('heading', { name: 'Your pickup order is confirmed.' })).toBeVisible();
  await expect(page.getByText('Order #1234', { exact: true })).toBeVisible();
  await expect(page.getByText('Show this order number to our staff when collecting.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View order and receipt' })).toHaveAttribute('href', `https://tacos.example/account?view=orders&order=${itemId}`);
  await expect.poll(() => page.getByRole('img', { name: "Papa's Tacos" }).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pickup-email.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const [stage, heading] of [['preparing', 'We are preparing your order.'], ['ready_for_pickup', 'Your order is ready.'], ['collected', "Thanks for choosing Papa's Tacos."]] as const) {
    await page.setContent(orderConfirmationEmail({...order,status:stage}, brand, stage).html);
    await expect(page.getByRole('heading', {name:heading,exact:true})).toBeVisible();
    if (stage === 'collected') {
      await expect(page.getByRole('link', {name:'Leave a review on Facebook'})).toHaveAttribute('href', brand.facebookUrl);
      await expect(page.getByRole('link', {name:'Share your visit on Instagram'})).toHaveAttribute('href', brand.instagramUrl);
      await expect(page.getByText('Show this order number to our staff when collecting.')).toHaveCount(0);
    }
    for (const width of [testInfo.project.name === 'mobile' ? 390 : 1440, 320]) {
      await page.setViewportSize({width,height:950});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({path:testInfo.outputPath(`${stage}-email-${width}.png`),fullPage:true});
    }
  }
});

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { BagProvider } from '@/components/bag/bag-provider';
      import { CheckoutForm } from '@/components/bag/checkout-form';
      import { EventSelection } from '@/components/bag/event-selection';
      import { OrderDetails } from '@/components/account/order-views';
      const kind = new URLSearchParams(location.search).get('kind');
      const order = { id: '${itemId}', checkout_key: '${slotId}', order_number: 1234, status: kind === 'pending' ? 'pending_payment' : 'ordered', payment_status: kind === 'pending' ? 'unpaid' : 'paid', payment_method: 'card', customer_name: 'Alex Taylor', customer_phone: '07000000000', customer_note: '', created_at: '2026-09-24T12:00:00Z', total_pence: 875, subtotal_pence: 800, service_fee_pence: 50, packaging_fee_pence: 25, pickup_starts_at: '2026-09-25T17:00:00Z', pickup_ends_at: '2026-09-25T17:15:00Z', pickup_location: {venue_name:'Town Market'}, order_items: [{id:'${itemId}',item_name:'Test Taco',quantity:1,line_total_pence:800,allergen_snapshot:[],order_item_modifiers:[]}], order_status_history:[], reservation_expires_at:'2026-09-24T13:00:00Z', cancellation_reason:null };
      if (kind === 'paid-zero') Object.assign(order, {service_fee_pence:0,packaging_fee_pence:0,total_pence:800});
      if (kind === 'nested') order.order_items[0].order_item_modifiers = [
        {id:'first-sauce',group_name:'Taco 1 Filling / Sauces',option_name:'Smoky Chipotle',unit_price_pence:0},
        {id:'second-filling',group_name:'Taco 2 Filling',option_name:'Beef',unit_price_pence:0},
        {id:'first-filling',group_name:'Taco 1 Filling',option_name:'Chicken',unit_price_pence:0},
        {id:'first-extra',group_name:'Taco 1 Filling / Extras',option_name:'Cheese',unit_price_pence:100},
        {id:'second-sauce',group_name:'Taco 2 Filling / Sauces',option_name:'Mild Salsa',unit_price_pence:0},
      ];
      if (kind === 'service-complete') Object.assign(order, {status:'collected',pickup_location:{venue_name:'Cinema',event_title:'Drive-In Cinema',service_mode:'car',location_number:'27',number_plate:'AB12 CDE'}});
      createRoot(document.getElementById('fixture')).render(<main className="page-width py-10"><BagProvider>{kind === 'menu-event' ? <EventSelection requestedEventId="${itemId}" /> : kind?.startsWith('checkout') ? <><h1 className="mb-8 text-3xl font-semibold">Checkout</h1><CheckoutForm name="Alex Taylor" phone="07000000000" email="alex@example.test" slots={kind === 'checkout-empty' ? [] : ${JSON.stringify(pickupChoices)}} /></> : <OrderDetails order={order} />}</BagProvider></main>);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'payments-browser', setup(builder) {
      builder.onResolve({ filter: /^(next\/link|@\/app\/\(public\)\/checkout\/actions)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
        ? 'import React from "react"; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }'
        : 'export async function startCheckout(input) { window.__checkoutInput = input; return {error:"Pickup slot is full"}; } export async function cancelCheckout() { window.__cancelled = true; } export async function resumeCheckout(orderId) { window.__resumed = orderId; return window.__resumeResult || {error:"Payment is temporarily unavailable"}; }' }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

async function fixture(page: Page, kind: string, admin = false, fees = { service: 50, packaging: 25 }) {
  const choices = kind === 'checkout-empty' ? [] : structuredClone(pickupChoices);
  await page.goto('/sign-in');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.evaluate((itemId) => localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [], quantity: 1 }] })), itemId);
  await page.evaluate(({ kind, itemId }) => {
    localStorage.removeItem('papas-tacos:event');
    if (kind === 'checkout-car' || kind === 'checkout-table') localStorage.setItem('papas-tacos:event', itemId);
  }, { kind, itemId });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: {
    catalogue: { available: true, categories: [], items: [{ id: itemId, name: 'Test Taco', price_pence: 800, is_available: true, groups: [] }] },
    settings: { maintenance_enabled: admin, card_enabled: true, ordering_status: 'open', service_fee_pence: fees.service, packaging_fee_pence: fees.packaging, minimum_order_pence: 0 },
    events: [{ id: itemId, title: 'Drive-In Cinema', service_mode: kind === 'checkout-table' ? 'table' : kind === 'checkout-car' || kind === 'menu-event' ? 'car' : 'pickup', pickup_enabled: true, ordering_status: 'open', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z', orders_open_at: null, orders_close_at: null }],
  } }));
  await page.route('**/api/pickup-slots', (route) => route.fulfill({ json: { slots: choices, error: false } }));
  await page.route('**/__payments_fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: bundle }));
  await page.route('**/__payments_test?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="fixture"></div><script src="/__payments_fixture.js"></script></body></html>` }));
  await page.goto(`/__payments_test?kind=${kind}`);
  return choices;
}

test('selecting a pickup time applies its event menu and price before payment', async ({ page }) => {
  await fixture(page, 'checkout');
  const defaultId = '00000000-0000-4000-8000-000000000050';
  const eventSetId = '00000000-0000-4000-8000-000000000051';
  const publicSection = '00000000-0000-4000-8000-000000000052';
  const eventSection = '00000000-0000-4000-8000-000000000053';
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: {
    catalogue: { available: true, categories: [], items: [{ id: itemId, name: 'Test Taco', price_pence: 800, is_available: true, groups: [] }], menuSets: {
      sets: [{ id: defaultId, name: 'Public', is_default: true }, { id: eventSetId, name: 'Cinema', is_default: false }],
      sections: [{ id: publicSection, menu_set_id: defaultId, title: 'Tacos', sort_order: 0 }, { id: eventSection, menu_set_id: eventSetId, title: 'THE MAIN EVENT', sort_order: 0 }],
      entries: [{ menu_set_id: defaultId, section_id: publicSection, menu_item_id: itemId, price_pence: null, sort_order: 0 }, { menu_set_id: eventSetId, section_id: eventSection, menu_item_id: itemId, price_pence: 1200, sort_order: 0 }],
    } },
    settings: { card_enabled: true, ordering_status: 'open', service_fee_pence: 50, packaging_fee_pence: 25, minimum_order_pence: 0 },
    events: [{ id: itemId, title: 'Friday Market', menu_set_id: eventSetId, service_mode: 'pickup', pickup_enabled: true, ordering_status: 'open', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z' }],
  } }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Pay £8.75', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: '18:00 - 18:20', exact: true }).check();
  const pay = page.getByRole('button', { name: 'Pay £12.75', exact: true });
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__checkoutInput')?.expectedTotal)).toBe(1275);
  expect(await page.evaluate(() => Reflect.get(window, '__checkoutInput').eventId)).toBe(itemId);
});

test('checkout and order summaries omit zero fees without changing totals', async ({ page }) => {
  for (const [service, packaging] of [[0, 0], [50, 0], [0, 25], [50, 25]]) {
    await fixture(page, 'checkout', false, { service, packaging });
    await page.getByRole('radio', { name: '18:00 - 18:20', exact: true }).check();
    await expect(page.getByRole('button', { name: `Pay £${((800 + service + packaging) / 100).toFixed(2)}`, exact: true })).toBeEnabled();
    await expect(page.getByText('Service Fee', { exact: true })).toHaveCount(service > 0 ? 1 : 0);
    await expect(page.getByText('Packaging', { exact: true })).toHaveCount(packaging > 0 ? 1 : 0);
  }
  await fixture(page, 'paid-zero');
  await expect(page.getByText('Service Fee', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Packaging', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Subtotal', { exact: true })).toBeVisible();
  await expect(page.getByText('Total', { exact: true })).toBeVisible();
});

test('checkout waits for event and menu data without flashing unavailable messages', async ({ page }) => {
  await fixture(page, 'checkout-car');
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/catalogue', async (route) => {
    await waiting;
    await route.fulfill({ json: {
      catalogue: { available: true, categories: [], items: [{ id: itemId, name: 'Test Taco', price_pence: 800, is_available: true, groups: [] }] },
      settings: { card_enabled: true, ordering_status: 'open', service_fee_pence: 50, packaging_fee_pence: 25, minimum_order_pence: 0 },
      events: [{ id: itemId, title: 'Drive-In Cinema', service_mode: 'car', pickup_enabled: true, ordering_status: 'open', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z' }],
    } });
  });
  await page.reload();
  await expect(page.getByRole('status', { name: 'Loading Checkout' })).toBeVisible();
  await expect(page.getByText(/Unavailable Item|No pickup times|cannot check checkout/)).toHaveCount(0);
  release();
  await expect(page.getByRole('textbox', { name: 'Assigned Car Number', exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading Checkout' })).toHaveCount(0);
});

test('table and car checkout require delivery numbers without pickup slots', async ({ page }) => {
  await page.clock.install();
  for (const mode of ['car', 'table']) {
    await fixture(page, `checkout-${mode}`);
    let slotRequests = 0;
    await page.route('**/api/pickup-slots', (route) => { slotRequests++; return route.fulfill({ status: 503, json: { error: 'No slots' } }); });
    const location = page.getByRole('textbox', { name: mode === 'car' ? 'Assigned Car Number' : 'Table Number', exact: true });
    await expect(location).toBeVisible();
    await expect(location).toHaveAttribute('required', '');
    await expect(location).toHaveAttribute('placeholder', mode === 'car' ? 'e.g. 27 - use the number assigned by staff' : 'e.g. 12 - use the number on your table');
    await expect(page.getByRole('textbox', { name: 'Customer Name', exact: true })).toHaveAttribute('placeholder', 'Enter your full name');
    await expect(page.getByRole('textbox', { name: 'Phone Number', exact: true })).toHaveAttribute('required', '');
    await expect(page.getByLabel('Order Note (optional)', { exact: true })).not.toHaveAttribute('required');
    await expect(page.locator('label[for="checkout-location"]')).toContainText('(required)');
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Ordering for' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Ordering for Drive-In Cinema', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ordering Information' })).toContainText('Delivery times may be longer during busy periods.');
    await expect(page.getByText(/pickup slot/i)).toHaveCount(0);
    const pay = page.getByRole('button', { name: 'Pay £8.75', exact: true });
    await pay.click();
    expect(await location.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __checkoutInput?: unknown }).__checkoutInput)).toBeUndefined();
    await location.fill('27');
    if (mode === 'car') {
      await page.getByRole('textbox', { name: 'Number Plate (optional)' }).fill('ab12 cde');
      await expect(page.getByRole('textbox', { name: 'Number Plate (optional)' })).toHaveValue('AB12 CDE');
    }
    await pay.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __checkoutInput?: { locationNumber: string } }).__checkoutInput?.locationNumber)).toBe('27');
    const input = await page.evaluate(() => (window as unknown as { __checkoutInput: Record<string, unknown> }).__checkoutInput);
    expect(input.eventId).toBe(itemId);
    expect(input.slotId).toBeUndefined();
    if (mode === 'car') expect(input.numberPlate).toBe('AB12 CDE');
    await page.clock.fastForward(30000);
    expect(slotRequests).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('event link preselects the event and persists it through reload and checkout', async ({ page }) => {
  await fixture(page, 'menu-event');
  await expect(page.getByRole('heading', { name: 'Ordering for Drive-In Cinema', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('papas-tacos:event'))).toBe(itemId);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ordering for Drive-In Cinema', exact: true })).toBeVisible();
  await page.goto('/__payments_test?kind=checkout-car');
  await expect(page.getByRole('textbox', { name: 'Assigned Car Number', exact: true })).toBeVisible();
});

test('event link requires confirmation before switching an existing bag to another event', async ({ page }) => {
  await fixture(page, 'menu-event');
  const otherId = '00000000-0000-4000-8000-000000000003';
  const bag = await page.evaluate(() => localStorage.getItem('papas-tacos:bag:v1'));
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: {
    catalogue: { available: true, categories: [], items: [{ id: itemId, name: 'Test Taco', price_pence: 800, is_available: true, groups: [] }] },
    settings: { card_enabled: true, ordering_status: 'open', service_fee_pence: 50, packaging_fee_pence: 25, minimum_order_pence: 0 },
    events: [{ id: itemId, title: 'Drive-In Cinema', service_mode: 'car' }, { id: otherId, title: 'Kitchen Tables', service_mode: 'table' }].map((event) => ({ ...event, pickup_enabled: true, ordering_status: 'open', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z', orders_open_at: null, orders_close_at: null })),
  } }));
  await page.evaluate((id) => localStorage.setItem('papas-tacos:event', id), otherId);
  await page.reload();
  const event = page.getByRole('heading', { name: 'Ordering for Kitchen Tables', exact: true });
  await expect(event).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch Event', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep Current Event', exact: true }).click();
  await expect(event).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Switch Event', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ordering for Drive-In Cinema', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('papas-tacos:bag:v1'))).toBe(bag);
  await page.goto('/__payments_test?kind=checkout-car');
  await expect(page.getByRole('textbox', { name: 'Assigned Car Number', exact: true })).toBeVisible();
});

test('expired event selection stays blocked instead of choosing another event', async ({ page }) => {
  await fixture(page, 'menu-event');
  await expect(page.getByRole('heading', { name: 'Ordering for Drive-In Cinema', exact: true })).toBeVisible();
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: {
    catalogue: { available: true, categories: [], items: [{ id: itemId, name: 'Test Taco', price_pence: 800, is_available: true, groups: [] }] },
    settings: { card_enabled: true, ordering_status: 'open', service_fee_pence: 50, packaging_fee_pence: 25, minimum_order_pence: 0 },
    events: [],
  } }));
  await page.goto('/__payments_test?kind=checkout-car');
  await expect(page.getByText('This event is closed, expired or unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay £8.75', exact: true })).toBeDisabled();
});

test('private event checkout is blocked until the catalogue confirms QR access', async ({ page }) => {
  await fixture(page, 'checkout-car');
  let unlocked = false;
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: {
    catalogue: { available: true, categories: [], items: [{ id: itemId, name: 'Test Taco', price_pence: 800, is_available: true, groups: [] }] },
    settings: { card_enabled: true, ordering_status: 'open', service_fee_pence: 50, packaging_fee_pence: 25, minimum_order_pence: 0 },
    events: [{ id: itemId, title: 'Drive-In Cinema', service_mode: 'car', is_private: true, ordering_access: unlocked, pickup_enabled: true, ordering_status: 'open', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z', orders_open_at: null, orders_close_at: null }],
  } }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pay £8.75', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Ordering Information' })).toContainText('Orders can only be placed by scanning a QR code provided at the event.');
  await expect(page.getByRole('status')).toContainText('Scan the QR code');
  unlocked = true;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pay £8.75', exact: true })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Ordering Information' })).not.toContainText('Orders can only be placed');
});

test('service customer orders show delivery and two progress steps with completion wording', async ({ page }) => {
  await fixture(page, 'service-complete');
  await expect(page.getByRole('heading', { name: 'Delivery', exact: true })).toBeVisible();
  await expect(page.getByText('Car 27 / AB12 CDE - delivery as soon as possible')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Order progress' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Order progress' })).toContainText('Complete');
  await expect(page.getByText('Ready for Pickup', { exact: true })).toHaveCount(0);
});

test('checkout distinguishes empty schedules and permits an authorized maintenance session', async ({ page }, testInfo) => {
  await fixture(page, 'checkout-empty');
  await expect(page.getByRole('status')).toContainText('No pickup times are currently available');
  await expect(page.getByRole('group', { name: 'Pickup Time' }).getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pay £8.75', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('checkout-no-slots.png'), fullPage: true });
  await fixture(page, 'checkout', true);
  await page.getByRole('radio', { name: '18:00 - 18:20', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Pay £8.75', exact: true })).toBeEnabled();
  await expect(page.getByText('Ordering is currently unavailable')).toHaveCount(0);
});

test('checkout shows only available times and removes a selected time when booked', async ({ page }, testInfo) => {
  const choices = await fixture(page, 'checkout');
  await expect(page.getByRole('combobox', { name: 'Ordering for' })).toHaveCount(1);
  await expect(page.getByRole('radio')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Pickup Time' }).getByText(/Available|Taken|Locked|Unavailable/, { exact: true })).toHaveCount(0);
  await page.getByRole('radio', { name: '18:00 - 18:20', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Pay £8.75', exact: true })).toBeEnabled();
  for (const width of [testInfo.project.name === 'mobile' ? 390 : 1440, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`pickup-badges-${width}.png`), fullPage: true });
  }
  for (const status of ['taken', 'locked', 'unavailable']) {
    choices[0].status = status;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('No pickup times are currently available');
    await expect(page.getByRole('button', { name: 'Pay £8.75', exact: true })).toBeDisabled();
    choices[0].status = 'available';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('radio')).toHaveCount(1);
  }
});

test('checkout validates pickup and keeps retry keys stable on errors', async ({ page }, testInfo) => {
  await fixture(page, 'checkout');
  const pay = page.getByRole('button', { name: 'Pay £8.75', exact: true });
  await expect(pay).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { __checkoutInput?: unknown }).__checkoutInput)).toBeUndefined();
  await page.getByRole('radio', { name: '18:00 - 18:20', exact: true }).check();
  await pay.click();
  await expect(page.getByRole('alert')).toHaveText('Pickup slot is full');
  const first = await page.evaluate(() => (window as unknown as { __checkoutInput: { key: string; expectedTotal: number } }).__checkoutInput);
  expect(first.expectedTotal).toBe(875);
  await pay.click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __checkoutInput: { key: string } }).__checkoutInput.key)).toBe(first.key);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('checkout.png'), fullPage: true });
});

test('paid orders show receipts; pending orders can resume payment or cancel', async ({ page }, testInfo) => {
  await fixture(page, 'paid');
  await expect(page.getByRole('link', { name: 'View Receipt' })).toHaveAttribute('href', `/api/account/orders/${itemId}/receipt`);
  await expect(page.getByRole('link', { name: 'Download Receipt' })).toHaveAttribute('href', `/api/account/orders/${itemId}/receipt?download=1`);
  await expect(page.getByRole('button', { name: 'Continue to Payment' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('paid-order.png'), fullPage: true });
  await fixture(page, 'pending');
  await expect(page.getByRole('link', { name: 'Download Receipt' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to Payment' }).click();
  await expect(page.getByRole('alert')).toHaveText('Payment is temporarily unavailable');
  expect(await page.evaluate(() => (window as unknown as { __resumed: string }).__resumed)).toBe(itemId);
  await page.screenshot({ path: testInfo.outputPath('pending-order.png'), fullPage: true });
  await page.evaluate(() => { (window as unknown as { __resumeResult: unknown }).__resumeResult = {url: '/__payment_resumed'}; });
  await page.route('**/__payment_resumed', (route) => route.fulfill({ contentType: 'text/html', body: 'Payment resumed' }));
  await page.getByRole('button', { name: 'Continue to Payment' }).click();
  await expect(page).toHaveURL(/__payment_resumed$/);
  await fixture(page, 'pending');
  await page.getByRole('button', { name: 'Cancel Checkout' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cancelled?: boolean }).__cancelled)).toBe(true);
});

test('order choices keep fillings sauces and extras under their own taco', async ({ page }, testInfo) => {
  await fixture(page, 'nested');
  await expect(page.getByRole('group', { name: 'Selected Choices' }).locator('[data-slot="badge"]')).toHaveCount(0);
  const first = page.getByRole('region', { name: 'Taco 1', exact: true });
  const second = page.getByRole('region', { name: 'Taco 2', exact: true });
  await expect(first.getByText('Chicken', { exact: true })).toBeVisible();
  await expect(first.getByText('Smoky Chipotle', { exact: true })).toBeVisible();
  await expect(first.getByText('Cheese', { exact: true })).toBeVisible();
  await expect(first.getByText('+£1.00 each', { exact: true })).toBeVisible();
  await expect(first.getByText('Beef', { exact: true })).toHaveCount(0);
  await expect(second.getByText('Beef', { exact: true })).toBeVisible();
  await expect(second.getByText('Mild Salsa', { exact: true })).toBeVisible();
  await expect(second.getByText('Cheese', { exact: true })).toHaveCount(0);
  await expect(first.locator('dl')).toHaveCSS('border-left-width', '0px');
  await expect(first.locator('dd').first()).toHaveCSS('border-left-width', '1px');
  for (const width of [testInfo.project.name === 'mobile' ? 390 : 1440, 320]) {
    await page.setViewportSize({ width, height: 950 });
    const label = (await first.locator('dt').first().boundingBox())!;
    const selection = (await first.locator('dd').first().boundingBox())!;
    expect(selection.x).toBeGreaterThanOrEqual(label.x + label.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`nested-order-${width}.png`), fullPage: true });
  }
});

test('confirmed orders clear only the matching checkout bag', async ({ page }) => {
  for (const quantity of [1, 2]) {
    await fixture(page, 'paid');
    await page.evaluate(({ itemId, slotId, quantity }) => {
      localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({version: 1, lines: [{itemId, optionIds: [], quantity}]}));
      sessionStorage.setItem('papas-tacos:checkout', JSON.stringify({key: slotId, orderId: itemId, serialized: JSON.stringify({lines: [{itemId, optionIds: [], quantity: 1}]})}));
    }, {itemId, slotId, quantity});
    await page.reload();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('papas-tacos:checkout'))).toBeNull();
    const lines = await page.evaluate(() => JSON.parse(localStorage.getItem('papas-tacos:bag:v1') || '{}').lines);
    expect(lines).toHaveLength(quantity === 1 ? 0 : 1);
    if (quantity === 2) expect(lines[0].quantity).toBe(2);
  }
});