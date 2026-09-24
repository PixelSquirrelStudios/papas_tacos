import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { orderConfirmationEmail } from '../../src/lib/payments/confirmation-email';

const itemId = '00000000-0000-4000-8000-000000000001';
const slotId = '00000000-0000-4000-8000-000000000002';
let bundle: string;

test('pickup confirmation email displays branding and a clear staff reference', async ({ page }, testInfo) => {
  const email = orderConfirmationEmail({
    id: itemId, order_number: 1234, status: 'ordered', payment_method: 'card', payment_status: 'paid',
    created_at: '2026-09-24T12:00:00Z', pickup_starts_at: '2026-09-25T17:00:00Z', pickup_ends_at: '2026-09-25T17:15:00Z',
    pickup_location: { venue_name: 'Town Market', address_line_1: 'Market Square', town: 'Cardiff', postcode: 'CF10 1AA' },
    customer_name: 'Alex Taylor', customer_phone: '07000000000', customer_note: 'No cutlery needed, thank you.',
    total_pence: 1675, subtotal_pence: 1600, service_fee_pence: 50, packaging_fee_pence: 25,
    cancellation_reason: null, reservation_expires_at: null, order_status_history: [],
    order_items: [{ id: itemId, item_name: 'Ember Chicken Tacos', quantity: 2, line_total_pence: 1600, allergen_snapshot: [],
      order_item_modifiers: [{ id: slotId, group_name: 'Salsa', option_name: 'Mild salsa', unit_price_pence: 0 }] }],
  }, { siteUrl: 'https://tacos.example', logoUrl: 'https://images.example/logo.svg', instagramUrl: 'https://instagram.com/papas', facebookUrl: 'https://facebook.com/papas' });
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
});

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { BagProvider } from '@/components/bag/bag-provider';
      import { CheckoutForm } from '@/components/bag/checkout-form';
      import { OrderDetails } from '@/components/account/order-views';
      const kind = new URLSearchParams(location.search).get('kind');
      const order = { id: '${itemId}', checkout_key: '${slotId}', order_number: 1234, status: kind === 'pending' ? 'pending_payment' : 'ordered', payment_status: kind === 'pending' ? 'unpaid' : 'paid', payment_method: 'card', customer_name: 'Alex Taylor', customer_phone: '07000000000', customer_note: '', created_at: '2026-09-24T12:00:00Z', total_pence: 875, subtotal_pence: 800, service_fee_pence: 50, packaging_fee_pence: 25, pickup_starts_at: '2026-09-25T17:00:00Z', pickup_ends_at: '2026-09-25T17:15:00Z', pickup_location: {venue_name:'Town Market'}, order_items: [{id:'${itemId}',item_name:'Test Taco',quantity:1,line_total_pence:800,allergen_snapshot:[],order_item_modifiers:[]}], order_status_history:[], reservation_expires_at:'2026-09-24T13:00:00Z', cancellation_reason:null };
      createRoot(document.getElementById('fixture')).render(<main className="page-width py-10"><BagProvider>{kind === 'checkout' ? <><h1 className="mb-8 text-3xl font-semibold">Checkout</h1><CheckoutForm name="Alex Taylor" phone="07000000000" email="alex@example.test" slots={[{id:'${slotId}',starts_at:'2026-09-25T17:00:00Z',ends_at:'2026-09-25T17:15:00Z',events:{title:'Friday Market',venue_name:'Town Market'}}]} /></> : <OrderDetails order={order} />}</BagProvider></main>);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'payments-browser', setup(builder) {
      builder.onResolve({ filter: /^(next\/link|@\/app\/\(public\)\/checkout\/actions)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
        ? 'import React from "react"; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }'
        : 'export async function startCheckout(input) { window.__checkoutInput = input; return {error:"Pickup slot is full"}; } export async function cancelCheckout() { window.__cancelled = true; }' }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

async function fixture(page: Page, kind: string) {
  await page.goto('/sign-in');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.evaluate((itemId) => localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [], quantity: 1 }] })), itemId);
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: {
    catalogue: { available: true, categories: [], items: [{ id: itemId, name: 'Test Taco', price_pence: 800, is_available: true, groups: [] }] },
    settings: { maintenance_enabled: false, card_enabled: true, ordering_status: 'open', service_fee_pence: 50, packaging_fee_pence: 25, minimum_order_pence: 0 },
    events: [{ pickup_enabled: true, ordering_status: 'open', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z', orders_open_at: null, orders_close_at: null }],
  } }));
  await page.route('**/__payments_fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: bundle }));
  await page.route('**/__payments_test?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="fixture"></div><script src="/__payments_fixture.js"></script></body></html>` }));
  await page.goto(`/__payments_test?kind=${kind}`);
}

test('checkout validates pickup and keeps retry keys stable on errors', async ({ page }, testInfo) => {
  await fixture(page, 'checkout');
  const pay = page.getByRole('button', { name: 'Pay £8.75', exact: true });
  await expect(pay).toBeEnabled();
  await pay.click();
  expect(await page.evaluate(() => (window as unknown as { __checkoutInput?: unknown }).__checkoutInput)).toBeUndefined();
  await page.getByLabel('Pickup Time').selectOption(slotId);
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

test('paid orders show view and download receipts; pending orders offer cancellation', async ({ page }, testInfo) => {
  await fixture(page, 'paid');
  await expect(page.getByRole('link', { name: 'View Receipt' })).toHaveAttribute('href', `/api/account/orders/${itemId}/receipt`);
  await expect(page.getByRole('link', { name: 'Download Receipt' })).toHaveAttribute('href', `/api/account/orders/${itemId}/receipt?download=1`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('paid-order.png'), fullPage: true });
  await fixture(page, 'pending');
  await expect(page.getByRole('link', { name: 'Download Receipt' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel Checkout' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cancelled?: boolean }).__cancelled)).toBe(true);
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