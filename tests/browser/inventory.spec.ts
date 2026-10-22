import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

const itemId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000010';
let bundle: string;

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { StockManager } from '@/components/admin/stock-manager';
      import { OrderStock } from '@/components/admin/order-stock';
      const item = '${itemId}', event = '${eventId}';
      const now = Date.parse('2026-10-22T12:00:00Z');
      const kind = new URLSearchParams(location.search).get('kind');
      const props = {
        now, initialEvent: kind === 'event' || kind === 'holds' ? event : '', initialItem: '',
        items: [{id:item,name:kind === 'duplicates' ? 'Classic Churros' : 'Wine gums',slug:'classic-churros-public',is_available:true,archived_at:null}, {id:'00000000-0000-4000-8000-000000000002',name:kind === 'duplicates' ? 'Classic Churros' : 'Tacos',slug:'classic-churros-drive-in',is_available:true,archived_at:null}],
        events:[{id:event,title:'Friday Market',starts_at:'2026-10-20T17:00:00Z',ends_at:'2026-10-20T21:00:00Z',ordering_status:'closed'}],
        inventory:[{menu_item_id:item,tracking_mode:kind === 'untracked' ? 'none' : 'global',unit_label:'packets',on_hand:kind === 'untracked' ? 0 : 31,version:7},{menu_item_id:'00000000-0000-4000-8000-000000000002',tracking_mode:'event',unit_label:'portions',on_hand:0,version:0}],
        allocations:kind === 'untracked' ? [] : [{menu_item_id:item,event_id:event,remaining:1,version:10}],
        orders:kind === 'holds' ? [{order_id:item,menu_item_id:item,event_id:event,quantity:1,state:'held',expires_at:'2026-10-22T12:01:00Z'}] : [],
        sales:[{menu_item_id:item,event_id:event,sold_quantity:9}],
        movements:[{id:item,menu_item_id:item,event_id:event,order_id:item,action:'sale',quantity:9,reason:'Online order',created_at:'2026-10-22T11:00:00Z'}],
      };
      createRoot(document.getElementById('fixture')).render(kind === 'restore'
        ? <OrderStock orderId={item} canRestock restored={false} />
        : <StockManager {...props} />);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'inventory-fixture', setup(builder) {
      builder.onResolve({ filter: /^(next\/(navigation|link)|@\/app\/admin\/stock\/actions)$/ }, (args) => ({ path: args.path, namespace: 'inventory-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'inventory-fixture' }, (args) => ({
        loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
          ? 'import React from "react"; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }'
          : args.path === 'next/navigation'
            ? 'export const useRouter = () => ({refresh(){window.__refreshes = (window.__refreshes || 0) + 1;}});'
            : `export async function changeStock(input) {
                window.__stockInput = input;
                if(window.__holdSave) await new Promise(resolve => window.__releaseSave = resolve);
                return window.__stockResult || {ok:true};
              }
              export async function returnEventStock(input) {window.__returnInput = input; return window.__stockResult || {ok:true};}
              export async function restockOrder(input) {window.__restockInput = input; return {ok:true};}`,
      }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

async function fixture(page: Page, kind = 'global') {
  await page.goto('/sign-in');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.route('**/__inventory.js', (route) => route.fulfill({ contentType: 'application/javascript', body: bundle }));
  await page.route('**/__inventory?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="fixture"></div><script src="/__inventory.js"></script></body></html>` }));
  await page.goto(`/__inventory?kind=${kind}`);
}

test('stock overview distinguishes global, allocated and unallocated quantities without page overflow', async ({ page }, testInfo) => {
  await fixture(page);
  const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /Wine gums/ }) });
  await expect(row.getByRole('cell').nth(0)).toHaveText('31');
  await expect(row.getByRole('cell').nth(3)).toContainText('30');
  await expect(row.getByRole('cell').nth(4)).toContainText('9');
  const portions = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /Tacos/ }) });
  await expect(portions.getByRole('cell').nth(3)).toHaveText('Not Applicable');
  await expect(portions).not.toContainText('Select an event');
  await row.getByText('By Event (1)', { exact: true }).click();
  await expect(row.getByRole('link', { name: 'Friday Market' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search Stock' }).fill('Tacos');
  await expect(page.getByRole('button', { name: 'Manage stock for Wine gums' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage stock for Tacos' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search Stock' }).fill('');
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('stock-overview.png'), fullPage: true });
});

test('same-named stock items show searchable slugs and identify the managed variant', async ({ page }) => {
  await fixture(page, 'duplicates');
  await expect(page.getByRole('rowheader', { name: /Classic Churros/ })).toHaveCount(2);
  await expect(page.getByText('classic-churros-public', { exact: true })).toBeVisible();
  await expect(page.getByText('classic-churros-drive-in', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search Stock' }).fill('drive-in');
  await expect(page.getByRole('rowheader', { name: /Classic Churros/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Manage stock for Classic Churros', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('classic-churros-drive-in');
  await expect(dialog.getByLabel('Reason / Reference (Required)')).toHaveValue('Event stock allocation updated');
});

test('stock editor requires a reason, previews the change and prevents duplicate submission', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Manage stock for Wine gums' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Save Stock Change' })).toBeDisabled();
  await dialog.getByLabel('Quantity (packets)').fill('12');
  await expect(dialog.getByRole('status')).toContainText('31 → 43');
  await expect(dialog.getByLabel('Reason / Reference (Required)')).toHaveValue('New stock received');
  await expect(dialog.getByRole('button', { name: 'Save Stock Change' })).toBeEnabled();
  await dialog.getByLabel('Reason / Reference (Required)').fill(' ');
  await expect(dialog.getByRole('button', { name: 'Save Stock Change' })).toBeDisabled();
  await dialog.getByLabel('Reason / Reference (Required)').fill('Supplier delivery INV-123');
  await page.evaluate(() => Reflect.set(window, '__holdSave', true));
  await dialog.getByRole('button', { name: 'Save Stock Change' }).click();
  await expect(dialog.getByRole('button', { name: 'Save Stock Change' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  const input = await page.evaluate(() => Reflect.get(window, '__stockInput'));
  expect(input).toMatchObject({ itemId, eventId: null, action: 'receive', quantity: 12, expectedVersion: 7, reason: 'Supplier delivery INV-123' });
  expect(input.requestId).toMatch(/^[a-f0-9-]{36}$/);
  await page.evaluate(() => Reflect.get(window, '__releaseSave')());
  await expect(dialog).not.toBeVisible();
});

test('stock filters match search height and reset search, event and stock status together', async ({ page }) => {
  await fixture(page, 'event');
  const search = page.getByRole('textbox', { name: 'Search Stock' });
  const event = page.getByRole('combobox', { name: 'Stock Event', exact: true });
  const filter = page.getByRole('combobox', { name: 'Stock Filter', exact: true });
  const reset = page.getByRole('button', { name: 'Reset Filters', exact: true });
  await expect(page.getByRole('button', { name: 'Refresh Balances' })).toHaveCount(0);
  await search.fill('Wine');
  await filter.click();
  await page.getByRole('option', { name: 'Tracked Items', exact: true }).click();
  await expect(event).toContainText('Friday Market');
  await reset.click();
  await expect(search).toHaveValue('');
  await expect(event).toHaveText('All Events / Global Overview');
  await expect(filter).toHaveText('All Menu Items');
  await expect(reset).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Manage stock for Tacos' })).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const control of [search, event, filter, reset]) {
      await expect(control).toHaveCSS('height', '44px');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('stock reasons follow the selected action without overwriting a custom reference', async ({ page }) => {
  await fixture(page, 'event');
  await page.getByRole('button', { name: 'Manage stock for Wine gums' }).click();
  const dialog = page.getByRole('dialog');
  const reason = dialog.getByLabel('Reason / Reference (Required)');
  await expect(reason).toHaveValue('Event stock allocation updated');
  await dialog.getByLabel('Action', { exact: true }).click();
  await page.getByRole('option', { name: 'Receive Stock', exact: true }).click();
  await expect(reason).toHaveValue('New stock received');
  await reason.fill('Delivery INV-123');
  await dialog.getByLabel('Action', { exact: true }).click();
  await page.getByRole('option', { name: 'Correct Global Count', exact: true }).click();
  await expect(reason).toHaveValue('Delivery INV-123');
});

test('enabling global tracking supplies a reason without manual entry and explains opening stock', async ({ page }) => {
  await fixture(page, 'untracked');
  await page.getByRole('button', { name: 'Manage stock for Wine gums' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Reason / Reference (Required)')).toHaveValue('Stock tracking settings updated');
  await dialog.getByLabel('Stock Tracking', { exact: true }).click();
  await page.getByRole('option', { name: 'Global Stock + Event Allocations', exact: true }).click();
  await expect(dialog).toContainText('receive your opening global stock, then allocate quantities to events');
  await expect(dialog).not.toContainText('Changing tracking is blocked');
  await expect(dialog.getByRole('button', { name: 'Save Stock Change' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save Stock Change' }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__stockInput'))).toMatchObject({
    itemId, action: 'configure', trackingMode: 'global', reason: 'Stock tracking settings updated',
  });
});

test('allocation conflicts preserve entered values and explain recovery', async ({ page }) => {
  await fixture(page, 'event');
  await page.getByRole('button', { name: 'Manage stock for Wine gums' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Target Unsold Event Quantity (packets)')).toHaveValue('1');
  await dialog.getByLabel('Target Unsold Event Quantity (packets)').fill('15');
  await dialog.getByLabel('Reason / Reference (Required)').fill('Increase event capacity');
  await page.evaluate(() => Reflect.set(window, '__stockResult', { ok: false, error: 'Stock changed. Refresh before saving; only 12 are available.' }));
  await dialog.getByRole('button', { name: 'Save Stock Change' }).click();
  await expect(dialog.getByRole('alert')).toContainText('only 12 are available');
  await expect(dialog.getByLabel('Target Unsold Event Quantity (packets)')).toHaveValue('15');
  const input = await page.evaluate(() => Reflect.get(window, '__stockInput'));
  expect(input).toMatchObject({ eventId, action: 'allocate', quantity: 15, expectedVersion: 10 });
});

test('selecting an event pre-fills its allocation but not additive stock actions', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Manage stock for Wine gums' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Action', { exact: true }).click();
  await page.getByRole('option', { name: 'Set Event Allocation', exact: true }).click();
  const quantity = dialog.getByLabel('Target Unsold Event Quantity (packets)');
  await expect(quantity).toHaveValue('');
  await dialog.getByLabel('Event (Required)', { exact: true }).click();
  await page.getByRole('option', { name: /Friday Market/ }).click();
  await expect(quantity).toHaveValue('1');
  await quantity.fill('40');
  await dialog.getByLabel('Action', { exact: true }).click();
  await page.getByRole('option', { name: 'Return Unused Stock', exact: true }).click();
  await expect(dialog.getByLabel('Quantity (packets)')).toHaveValue('');
  await dialog.getByLabel('Action', { exact: true }).click();
  await page.getByRole('option', { name: 'Set Event Allocation', exact: true }).click();
  await expect(quantity).toHaveValue('1');
  await dialog.getByLabel('Event (Required)', { exact: true }).click();
  await page.getByRole('option', { name: 'Choose an Event', exact: true }).click();
  await expect(quantity).toHaveValue('');
});

test('event closing returns unused allocations together and blocks reconciliation during checkout holds', async ({ page }) => {
  await fixture(page, 'event');
  await page.getByRole('button', { name: 'Return All Unused Stock', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Wine gums');
  await dialog.getByRole('button', { name: 'Confirm Return' }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__returnInput'))).toMatchObject({
    eventId, allocations: [{ menu_item_id: itemId, event_id: eventId, remaining: 1, version: 10 }],
  });
  await fixture(page, 'holds');
  await expect(page.getByRole('button', { name: 'Return All Unused Stock', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Event Stock Reconciliation' })).toContainText('1 units held in checkout');
});

test('cancelled order restoration is explicit and requires an audit reason', async ({ page }) => {
  await fixture(page, 'restore');
  await expect(page.getByText(/Confirmed sales stay depleted/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore Reusable Stock' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Restore Stock', exact: true })).toBeDisabled();
  await dialog.getByLabel('Reason (Required)').fill('Unopened products returned');
  await dialog.getByRole('button', { name: 'Restore Stock', exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, '__restockInput'))).toEqual({ orderId: itemId, reason: 'Unopened products returned' });
});
