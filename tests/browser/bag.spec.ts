import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { expandModifierGroups } from '../../src/lib/catalogue/modifiers';

const itemId = '00000000-0000-4000-8000-000000000001';
const categoryId = '00000000-0000-4000-8000-000000000010';
const salsaId = '00000000-0000-4000-8000-000000000020';
const extrasId = '00000000-0000-4000-8000-000000000030';
const mildId = '00000000-0000-4000-8000-000000000021';
const guacamoleId = '00000000-0000-4000-8000-000000000031';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/stock*', (route) => route.fulfill({ json: { stock: Array.from({ length: 100 }, (_, index) => ({
    menu_item_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, tracking_mode: 'none', available_quantity: null,
  })) } }));
});

function fixture() {
  return {
    events: [{ id: 'market', title: 'Friday Market', pickup_enabled: true, ordering_status: 'open', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z', orders_open_at: null, orders_close_at: null }],
    catalogue: { available: true, categories: [{ id: categoryId, name: 'Tacos', slug: 'tacos', sort_order: 0 }], items: [{
      id: itemId, category_id: categoryId, name: 'Test Taco', slug: 'test-taco', description: 'A local test fixture, never published to Supabase.', price_pence: 850,
      image_path: null, imageUrl: '/images/tacos.jpg', image_alt: 'Test tacos', dietary_tags: ['vegetarian'], allergens: ['milk'], allergen_note: '', is_available: true, is_featured: true, is_crowd_favourite: false, sort_order: 0,
      groups: [
        { id: salsaId, name: 'Salsa', min_selections: 1, max_selections: 1, options: [{ id: mildId, modifier_group_id: salsaId, name: 'Mild salsa', price_pence: 0, allergens: [], is_available: true, sort_order: 0 }] },
        { id: extrasId, name: 'Extras', min_selections: 0, max_selections: 2, options: [{ id: guacamoleId, modifier_group_id: extrasId, name: 'Guacamole', price_pence: 150, allergens: [], is_available: true, sort_order: 0 }] },
      ],
    }] },
    settings: { business_name: "Papa's Tacos", ordering_status: 'open', ordering_message: null, service_fee_pence: 50, packaging_fee_pence: 25, minimum_order_pence: 0, contact_email: null, contact_phone: null, instagram_url: null, facebook_url: null },
  };
}

async function isolateOptionPicker(page: Page) {
  await page.route('**/api/stock*', (route) => route.fulfill({ json: { stock: Array.from({ length: 100 }, (_, index) => ({
    menu_item_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, tracking_mode: 'none', available_quantity: null,
  })) } }));
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { BagProvider, MenuOrderingProvider, PaidOrderBagCleanup } from '@/components/bag/bag-provider';
      import { HeaderMenuButton } from '@/components/bag/header-menu-button';
      import { SiteUpdates } from '@/components/site-updates';
      import { MenuBrowser } from '@/components/catalogue/menu-browser';
      import { BagView } from '@/components/bag/bag-view';
      createRoot(document.getElementById('fixture')).render(<main className="page-width py-10"><BagProvider><HeaderMenuButton signedIn={new URLSearchParams(location.search).get('signedIn') !== 'false'} /><SiteUpdates />{new URLSearchParams(location.search).has('paid') && <PaidOrderBagCleanup orderId="paid-fixture" />}{location.pathname === '/bag' ? <BagView /> : location.pathname === '/' ? <MenuBrowser initial={{available:false,items:[],categories:[]}} featured /> : <MenuOrderingProvider eventId={new URLSearchParams(location.search).get('event') || ''}><MenuBrowser initial={{available:false,items:[],categories:[]}} /></MenuOrderingProvider>}</BagProvider></main>);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'option-picker-fixture', setup(builder) {
      builder.onResolve({ filter: /^(next\/navigation|@\/lib\/supabase\/(client|config))$/ }, (args) => ({ path: args.path, namespace: 'updates-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'updates-fixture' }, (args) => ({ contents: args.path === 'next/navigation'
        ? 'export const usePathname = () => location.pathname; export const useSearchParams = () => new URLSearchParams(location.search); export const useRouter = () => ({refresh() { window.__pageRefreshes = (window.__pageRefreshes || 0) + 1; }});'
        : args.path.endsWith('/config') ? 'export const supabaseConfig = () => ({url: location.origin,key:"fixture"});'
        : 'export const createBrowserSupabase = () => ({ channel() { const channel = {on(event, filter, callback) { window.__siteChange = callback; return channel; }, subscribe() { return channel; }}; return channel; }, removeChannel() {} });' }));
      builder.onResolve({ filter: /^next\/(image|link)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
        ? 'import React from "react"; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }'
        : 'import React from "react"; export default function Image({fill,unoptimized,priority,...props}) { return <img {...props} style={fill ? {position:"absolute",width:"100%",height:"100%",inset:0} : undefined} />; }' }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  await page.goto('/sign-in');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.route('**/__option_picker_fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: result.outputFiles[0].text }));
  for (const routePath of ['/', '/menu', '/menu?*', '/bag', '/bag?*']) await page.route(`**${routePath}`, (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="fixture"></div><script src="/__option_picker_fixture.js"></script></body></html>` }));
}

for (const [context, pathname] of [['homepage', '/'], ['event menu', '/menu?event=market']]) {
  test(`${context} waits for catalogue access before polling saved private-event stock`, async ({ page }) => {
    await isolateOptionPicker(page);
    const data = fixture();
    const event = { ...data.events[0], is_private: true, ordering_access: false };
    data.events = [event];
    Object.assign(data.settings, { card_enabled: true });
    let releaseCatalogue!: () => void;
    const catalogueReady = new Promise<void>((resolve) => { releaseCatalogue = resolve; });
    let catalogueRequests = 0;
    await page.route('**/api/catalogue', async (route) => {
      catalogueRequests++;
      await catalogueReady;
      await route.fulfill({ json: data });
    });
    const stockRequests: string[] = [];
    await page.route('**/api/stock*', (route) => {
      stockRequests.push(route.request().url());
      return new URL(route.request().url()).searchParams.has('eventId') && !event.ordering_access
        ? route.fulfill({ status: 503, json: { error: 'Event access required' } })
        : route.fulfill({ json: { stock: [{ menu_item_id: itemId, tracking_mode: 'none', available_quantity: null }] } });
    });
    await page.evaluate(({ itemId, mildId }) => {
      localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [mildId], quantity: 1 }] }));
      localStorage.setItem('papas-tacos:event', 'market');
    }, { itemId, mildId });
    await page.clock.install();
    await page.goto(pathname);
    await expect.poll(() => catalogueRequests).toBe(1);
    expect(stockRequests).toEqual([]);
    releaseCatalogue();
    await expect(page.getByRole('heading', { name: 'Test Taco', exact: true })).toBeVisible();
    if (context === 'homepage') await expect.poll(() => stockRequests.length).toBeGreaterThan(0);
    await page.clock.runFor(16000);
    await expect.poll(() => catalogueRequests).toBeGreaterThan(1);
    expect(stockRequests.every((url) => !new URL(url).searchParams.has('eventId'))).toBe(true);
    await expect(page.getByRole('button', { name: 'Add Test Taco to Bag' })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('papas-tacos:bag:v1')!).lines.length)).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('papas-tacos:event'))).toBe('market');

    event.ordering_access = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => stockRequests.some((url) => new URL(url).searchParams.get('eventId') === 'market')).toBe(true);
    if (context === 'event menu') await expect(page.getByRole('button', { name: 'Add Test Taco to Bag' })).toBeEnabled();
    await page.goto('/bag');
    await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toBeVisible();
  });
}

test('event stock caps quantities and changing availability blocks checkout without losing the bag', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  Object.assign(data.settings, { card_enabled: true });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  let quantity = 2;
  await page.route('**/api/stock*', (route) => route.fulfill({ json: { stock: [{ menu_item_id: itemId, tracking_mode: 'event', available_quantity: quantity }] } }));
  await page.goto('/menu?event=market');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  const picker = page.getByRole('dialog');
  await picker.getByRole('radio', { name: /Mild salsa/ }).check();
  await picker.getByRole('button', { name: 'Increase Test Taco' }).click();
  await expect(picker.getByRole('button', { name: 'Increase Test Taco' })).toBeDisabled();
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await page.goto('/bag');
  await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toBeVisible();
  quantity = 1;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert').filter({ hasText: 'only 1 available' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('papas-tacos:bag:v1')!).lines[0].quantity)).toBe(2);
  quantity = 0;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('This item is sold out.', { exact: true })).toBeVisible();
});

test('stock refresh failure blocks ordering and recovers without clearing saved items', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  Object.assign(data.settings, { card_enabled: true });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  let failed = false;
  await page.route('**/api/stock*', (route) => failed ? route.fulfill({ status: 503, json: { error: 'Stock unavailable' } }) : route.fulfill({ json: { stock: [{ menu_item_id: itemId, tracking_mode: 'global', available_quantity: 5 }] } }));
  await page.evaluate(({ itemId, mildId }) => {
    localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [mildId], quantity: 1 }] }));
    localStorage.setItem('papas-tacos:event', 'market');
  }, { itemId, mildId });
  await page.goto('/bag');
  await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toBeVisible();
  failed = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status').filter({ hasText: 'Stock availability' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Checkout Unavailable' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Test Taco', exact: true })).toBeVisible();
  failed = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toBeVisible();
});

for (const mode of ['event', 'global']) {
  test(`${mode} stock shows a concise quantity limit and allows editing the last portion`, async ({ page }) => {
    await isolateOptionPicker(page);
    const data = fixture();
    await page.route('**/api/catalogue', route => route.fulfill({ json: data }));
    let quantity = 1;
    await page.route('**/api/stock*', route => route.fulfill({ json: { stock: [{ menu_item_id: itemId, tracking_mode: mode, available_quantity: quantity }] } }));
    await page.goto('/menu?event=market');
    await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
    const picker = page.getByRole('dialog');
    await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
    await expect(picker.getByRole('button', { name: 'Increase Test Taco' })).toBeDisabled();
    await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
    await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
    await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
    await expect(picker.getByText('Maximum quantity reached.', { exact: true })).toBeVisible();
    const messageBox = (await picker.getByText('Maximum quantity reached.', { exact: true }).boundingBox())!;
    const quantityBox = (await picker.getByRole('button', { name: 'Increase Test Taco', exact: true }).boundingBox())!;
    expect(messageBox.x).toBeGreaterThan(quantityBox.x + quantityBox.width);
    expect(Math.abs(messageBox.y + messageBox.height / 2 - quantityBox.y - quantityBox.height / 2)).toBeLessThan(2);
    expect(await picker.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(picker).not.toContainText('Only 0');
    await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.goto('/bag');
    await page.getByRole('button', { name: 'Edit Test Taco', exact: true }).click();
    await expect(picker.getByRole('button', { name: 'Update Bag', exact: true })).toBeEnabled();
    await expect(picker.getByText('Maximum quantity reached.', { exact: true })).toHaveCount(0);
    quantity = 0;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(picker.getByText('This item is sold out.', { exact: true })).toBeVisible();
    await expect(picker.getByRole('button', { name: 'Update Bag', exact: true })).toBeDisabled();
    await expect(picker).not.toContainText('Only 0');
    quantity = 2;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(picker.getByRole('button', { name: 'Increase Test Taco' })).toBeEnabled();
    await picker.getByRole('button', { name: 'Increase Test Taco' }).click();
    quantity = 1;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(picker.getByText('Up to 1 available for this selection. Reduce the quantity to continue.', { exact: true })).toBeVisible();
    await expect(picker.getByRole('button', { name: 'Update Bag', exact: true })).toBeDisabled();
    await picker.getByRole('button', { name: 'Decrease Test Taco' }).click();
    await expect(picker.getByRole('button', { name: 'Update Bag', exact: true })).toBeEnabled();
  });
}

test('event bag navigation stays scoped and matching paid orders reset to the public menu', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  Object.assign(data.events[0], { service_mode: 'car' });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.evaluate(({ itemId, mildId }) => {
    const lines = [{ itemId, optionIds: [mildId], quantity: 1 }];
    localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines }));
    localStorage.setItem('papas-tacos:event', 'market');
    sessionStorage.setItem('papas-tacos:checkout', JSON.stringify({ orderId: 'paid-fixture', serialized: JSON.stringify({ lines }) }));
  }, { itemId, mildId });
  await page.goto('/bag');
  await expect(page.getByRole('link', { name: 'Add More' })).toHaveAttribute('href', '/menu?event=market');
  await expect(page.getByRole('link', { name: 'The Menu', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Ordering For' })).toHaveCount(0);
  await page.goto('/menu?event=market');
  await expect(page.getByRole('link', { name: 'The Menu', exact: true })).toHaveCount(0);
  await page.goto('/menu?event=market&signedIn=false');
  await expect(page.getByRole('link', { name: 'The Menu', exact: true })).toBeVisible();
  await page.goto('/bag?paid=1');
  await expect(page.getByRole('link', { name: 'Explore the Menu' })).toHaveAttribute('href', '/menu');
  expect(await page.evaluate(() => localStorage.getItem('papas-tacos:event'))).toBe('');
  await expect(page.getByRole('link', { name: 'The Menu', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Explore the Menu' })).toHaveAttribute('href', '/menu');
});

test('bag waits for its initial catalogue before displaying availability', async ({ page }) => {
  await isolateOptionPicker(page);
  await page.evaluate(({ itemId, mildId }) => {
    localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [mildId], quantity: 1 }] }));
  }, { itemId, mildId });
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/catalogue', async (route) => { await waiting; await route.fulfill({ json: fixture() }); });
  await page.goto('/bag');
  await expect(page.getByRole('status', { name: 'Loading Your Bag' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(/Unavailable Item|cannot check menu prices/)).toHaveCount(0);
  release();
  await expect(page.getByRole('status', { name: 'Loading Your Bag' })).toHaveCount(0);
  await expect(page.getByText('£8.50 each before extras', { exact: true })).toBeVisible();
});

test('event menu sets control custom headings items and prices while the public menu stays separate', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  const publicId = '00000000-0000-4000-8000-000000000050';
  const cinemaId = '00000000-0000-4000-8000-000000000051';
  const mainId = '00000000-0000-4000-8000-000000000052';
  const publicSectionId = '00000000-0000-4000-8000-000000000053';
  const sweetId = '00000000-0000-4000-8000-000000000054';
  Object.assign(data.events[0], { service_mode: 'car', menu_set_id: cinemaId });
  data.catalogue.items.push({ ...data.catalogue.items[0], id: sweetId, name: 'Churros', price_pence: 400 });
  Object.assign(data.catalogue, { menuSets: {
    sets: [{ id: publicId, name: 'Public', is_default: true }, { id: cinemaId, name: 'Cinema', is_default: false }],
    sections: [{ id: publicSectionId, menu_set_id: publicId, title: 'Public Tacos', sort_order: 0 }, { id: mainId, menu_set_id: cinemaId, title: 'THE MAIN EVENT', sort_order: 0 }],
    entries: [{ menu_set_id: publicId, section_id: publicSectionId, menu_item_id: itemId, sort_order: 0, price_pence: null }, { menu_set_id: publicId, section_id: publicSectionId, menu_item_id: sweetId, sort_order: 1, price_pence: null }, { menu_set_id: cinemaId, section_id: mainId, menu_item_id: itemId, sort_order: 0, price_pence: 1200 }],
  } });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Public Tacos', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Churros', exact: true })).toBeVisible();
  await expect(page.getByText('£8.50', { exact: true })).toBeVisible();
  await page.goto('/menu?event=market');
  await expect(page.getByRole('heading', { name: 'THE MAIN EVENT', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Churros', exact: true })).toHaveCount(0);
  await expect(page.getByText('£12.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  await page.getByRole('radio', { name: /Mild salsa/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await page.goto('/bag');
  await expect(page.getByText('£12.00 each before extras', { exact: true })).toBeVisible();
});

test('QR-selected service menu buttons follow opening pause and closure without switching events', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  Object.assign(data.events[0], { service_mode: 'car', is_private: true, ordering_access: true, orders_open_at: '2098-01-01T00:00:00Z' });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.evaluate(() => localStorage.setItem('papas-tacos:event', 'market'));
  await page.goto('/menu?event=market');
  const article = page.getByRole('article');
  await expect(article.getByRole('button', { name: 'Orders Open Later' })).toBeDisabled();
  await expect(article.getByRole('button', { name: /Add .* to Bag/ })).toHaveCount(0);
  Object.assign(data.events[0], { orders_open_at: '2020-01-01T00:00:00Z' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(article.getByRole('button', { name: 'Add Test Taco to Bag' })).toBeEnabled();
  for (const [status, label] of [['paused', 'Orders Paused'], ['closed', 'Orders Closed']]) {
    data.events[0].ordering_status = status;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(article.getByRole('button', { name: label })).toBeDisabled();
    await expect(article.getByRole('button', { name: /Add .* to Bag/ })).toHaveCount(0);
  }
  data.events[0].ordering_status = 'open';
  Object.assign(data.events[0], { orders_close_at: '2021-01-01T00:00:00Z' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(article.getByRole('button', { name: 'Orders Closed' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('papas-tacos:event'))).toBe('market');
});

test('menu URL controls event context without changing the saved bag until an item is added', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  data.events.push({ ...data.events[0], id: 'drive-in', title: 'Private Cinema', ...{ service_mode: 'car', is_private: true, ordering_access: true }, orders_open_at: '2098-01-01T00:00:00Z' });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.evaluate(({ itemId, mildId }) => {
    localStorage.setItem('papas-tacos:event', 'drive-in');
    localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [mildId], quantity: 1 }] }));
  }, { itemId, mildId });
  await page.goto('/menu');
  await expect(page.getByRole('region', { name: 'Ordering Event', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Test Taco to Bag' })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('papas-tacos:event'))).toBe('drive-in');
  await page.goto('/menu?event=drive-in');
  await expect(page.getByRole('heading', { name: 'Ordering for Private Cinema' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Orders Open Later' })).toBeDisabled();
  await page.goto('/menu?event=missing');
  await expect(page.getByRole('alert')).toContainText('This event is closed, expired or unavailable');
  await expect(page.getByRole('button', { name: 'Event Unavailable' })).toBeDisabled();
  await page.goto('/menu');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  await page.getByRole('radio', { name: /Mild salsa/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Add to Bag', exact: true }).click();
  const switchNotice = page.getByRole('alert', { name: 'Switch Ordering Context' });
  await expect(switchNotice).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('papas-tacos:event'))).toBe('drive-in');
  await switchNotice.getByRole('button', { name: 'Switch and Add Item' }).click();
  await expect(switchNotice).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('papas-tacos:event'))).toBe('');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('papas-tacos:bag:v1')!).lines[0].quantity)).toBe(2);
  data.events[0].ordering_status = 'closed';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Orders Closed' })).toBeDisabled();
  Object.assign(data.events[1], { orders_open_at: '2020-01-01T00:00:00Z', ordering_access: false });
  await page.goto('/menu?event=drive-in');
  await expect(page.getByRole('button', { name: 'Scan Event QR to Order' })).toBeDisabled();
  Object.assign(data.events[1], { ordering_access: true });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Add Test Taco to Bag' })).toBeEnabled();
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  await page.getByRole('radio', { name: /Mild salsa/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await page.getByRole('button', { name: 'Switch and Add Item' }).click();
  await expect(page.getByRole('alert', { name: 'Switch Ordering Context' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('papas-tacos:event'))).toBe('drive-in');
  await page.goto('/bag');
  await expect(page.getByRole('link', { name: 'Add More' })).toHaveAttribute('href', '/menu?event=drive-in');
});

test('bag shows collection events above the truck link and omits zero fees', async ({ page }, testInfo) => {
  await isolateOptionPicker(page);
  const data = fixture();
  data.events[0].title = 'Friday Market at the Riverside';
  data.events.push({ ...data.events[0], id: 'closed-market', title: 'Closed Market', ordering_status: 'closed' });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.evaluate(({ itemId, mildId }) => localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [mildId], quantity: 1 }] })), { itemId, mildId });
  await page.goto('/bag');
  const summary = page.getByRole('complementary', { name: 'Order Summary' });
  await expect(summary.getByText(`${data.events[0].title} / Collection from the Truck`, { exact: true })).toBeVisible();
  await expect(summary.getByText('Closed Market', { exact: true })).toHaveCount(0);
  const event = (await summary.getByText(`${data.events[0].title} / Collection from the Truck`, { exact: true }).boundingBox())!;
  const link = (await summary.getByRole('link', { name: 'Find the Truck' }).boundingBox())!;
  expect(link.y).toBeGreaterThanOrEqual(event.y + event.height);
  for (const [service, packaging] of [[0, 0], [50, 0], [0, 25], [50, 25]]) {
    data.settings.service_fee_pence = service;
    data.settings.packaging_fee_pence = packaging;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(summary.getByText('Service Fee', { exact: true })).toHaveCount(service > 0 ? 1 : 0);
    await expect(summary.getByText('Packaging', { exact: true })).toHaveCount(packaging > 0 ? 1 : 0);
    await expect(summary.getByText('Estimated Total', { exact: true }).locator('..').locator('dd')).toHaveText(`£${((850 + service + packaging) / 100).toFixed(2)}`);
  }
  data.events[1].ordering_status = 'open';
  data.events[1].title = 'Saturday Market';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(summary.getByText('Saturday Market / Collection from the Truck', { exact: true })).toBeVisible();
  await expect(summary.getByText(`${data.events[0].title} / Collection from the Truck`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('bag-collection.png'), fullPage: true });
});

test('catalogue refreshes without reload and coalesces overlapping update signals', async ({ page }) => {
  await page.clock.install();
  await isolateOptionPicker(page);
  const data = fixture();
  let requests = 0;
  let release: (() => void) | undefined;
  let hold = false;
  await page.route('**/api/catalogue', async (route) => {
    requests++;
    const snapshot = structuredClone(data);
    if (hold) await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/menu');
  await expect(page.getByRole('button', { name: 'Add Test Taco to Bag' })).toBeVisible();
  const initialRequests = requests;
  hold = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => requests).toBe(initialRequests + 1);
  data.catalogue.items[0].name = 'Freshly Updated Taco';
  data.catalogue.items[0].is_available = false;
  await page.evaluate(() => {
    for (const name of ['online', 'papas:site-updated', 'focus']) window.dispatchEvent(new Event(name));
  });
  expect(requests).toBe(initialRequests + 1);
  hold = false;
  release!();
  await expect(page.getByRole('button', { name: 'Add Freshly Updated Taco to Bag' })).toBeDisabled();
  expect(requests).toBe(initialRequests + 2);
  data.catalogue.items[0].is_available = true;
  await page.clock.fastForward(15001);
  await expect(page.getByRole('button', { name: 'Add Freshly Updated Taco to Bag' })).toBeEnabled();
  data.catalogue.items[0].name = 'Realtime Taco';
  await page.evaluate(() => (window as unknown as { __siteChange: () => void }).__siteChange());
  await page.clock.fastForward(201);
  await expect(page.getByRole('button', { name: 'Add Realtime Taco to Bag' })).toBeVisible();
});

test('catalogue timeout closes ordering and reconnect recovers without reloading', async ({ page }) => {
  await page.clock.install();
  await isolateOptionPicker(page);
  const data = fixture();
  let hold = false;
  let release: (() => void) | undefined;
  await page.route('**/api/catalogue', async (route) => {
    const snapshot = structuredClone(data);
    if (hold) await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: snapshot }).catch(() => {});
  });
  await page.goto('/menu');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  const picker = page.getByRole('dialog');
  await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeEnabled();
  hold = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.clock.runFor(12001);
  await expect(picker.getByRole('button', { name: 'Ordering Unavailable' })).toBeDisabled();
  data.catalogue.items[0].price_pence = 1100;
  hold = false;
  release!();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeEnabled();
  await expect(picker.getByText('£11.00', { exact: true })).toBeVisible();
  await expect(picker.getByRole('radio', { name: 'Mild salsa', exact: true })).toBeChecked();
});

test('another tab updates open picker prices and availability without a page reload', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  const picker = page.getByRole('dialog');
  await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  const editor = await page.context().newPage();
  await editor.goto('/sign-in');
  await page.bringToFront();
  data.catalogue.items[0].price_pence = 1200;
  data.catalogue.items[0].is_available = false;
  await editor.evaluate(() => localStorage.setItem('papas-tacos:site-update', crypto.randomUUID()));
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeDisabled();
  await expect(picker.getByText('£12.00', { exact: true })).toBeVisible();
  data.events[0].ordering_status = 'closed';
  await editor.evaluate(() => localStorage.setItem('papas-tacos:site-update', crypto.randomUUID()));
  await expect(picker.getByRole('button', { name: 'Orders Closed' })).toBeDisabled();
  await editor.close();
});

for (const tacoCount of [2, 3]) {
  test(`${tacoCount} tacos keep customisations and paid extras separate per taco`, async ({ page }) => {
    await isolateOptionPicker(page);
    const data = fixture();
    const options = {
      id: extrasId, name: 'Private Taco Options', group_type: 'removal', min_selections: 0, max_selections: 30,
      options: [
        { id: guacamoleId, modifier_group_id: extrasId, name: 'No Onions', price_pence: 0, allergens: [], is_available: true },
        { id: '00000000-0000-4000-8000-000000000032', modifier_group_id: extrasId, name: 'Extra Cheese', price_pence: 125, allergens: [], is_available: true },
      ],
    };
    const parents = Array.from({ length: tacoCount }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000004${index}`, name: `Taco ${index + 1} filling`, min_selections: 1, max_selections: 1,
      options: [{ ...data.catalogue.items[0].groups[0].options[0], id: `00000000-0000-4000-8000-00000000005${index}`, name: 'Chicken' }],
      child_group_ids: [extrasId],
    }));
    data.catalogue.items[0].groups = expandModifierGroups(parents.map(parent => parent.id), [...parents, options]) as typeof data.catalogue.items[0]['groups'];
    await page.route('**/api/catalogue', route => route.fulfill({ json: data }));
    await page.goto('/menu?event=market');
    await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
    const picker = page.getByRole('dialog');
    for (let index = 1; index <= tacoCount; index++) {
      await picker.getByRole('group', { name: `Taco ${index} filling`, exact: true }).getByRole('radio', { name: 'Chicken', exact: true }).check();
    }
    const first = picker.getByRole('group', { name: 'Taco 1 / Make It Yours', exact: true });
    const second = picker.getByRole('group', { name: 'Taco 2 / Make It Yours', exact: true });
    await expect(picker.getByRole('group', { name: 'Make It Yours', exact: true })).toHaveCount(0);
    await first.getByRole('checkbox', { name: 'No Onions', exact: true }).check();
    await expect(second.getByRole('checkbox', { name: 'No Onions', exact: true })).not.toBeChecked();
    await second.getByRole('checkbox', { name: /Extra Cheese/ }).check();
    if (tacoCount === 3) await picker.getByRole('group', { name: 'Taco 3 / Make It Yours', exact: true }).getByRole('checkbox', { name: /Extra Cheese/ }).check();
    await picker.getByRole('button', { name: 'Increase Test Taco' }).click();
    await expect(picker.getByText(tacoCount === 2 ? '£19.50' : '£22.00', { exact: true })).toBeVisible();
    await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
    await page.goto('/bag');
    const firstSummary = page.getByRole('region', { name: 'Taco 1', exact: true });
    const secondSummary = page.getByRole('region', { name: 'Taco 2', exact: true });
    await expect(firstSummary).toContainText('Make It Yours');
    await expect(firstSummary).toContainText('No Onions');
    await expect(firstSummary).not.toContainText('Extra Cheese');
    await expect(secondSummary).toContainText('Extra Cheese');
    await expect(secondSummary).toContainText('+£1.25');
    await expect(secondSummary).not.toContainText('No Onions');
    await expect(page.getByRole('group', { name: 'Selected Choices' })).not.toContainText('Private Taco Options');
    await page.getByRole('button', { name: 'Edit Test Taco', exact: true }).click();
    await expect(first.getByRole('checkbox', { name: 'No Onions', exact: true })).toBeChecked();
    await expect(second.getByRole('checkbox', { name: /Extra Cheese/ })).toBeChecked();
    await second.getByRole('checkbox', { name: /Extra Cheese/ }).uncheck();
    await expect(first.getByRole('checkbox', { name: 'No Onions', exact: true })).toBeChecked();
  });
}

test('nested reusable groups keep sauces and extras separate for each part', async ({ page }, testInfo) => {
  await isolateOptionPicker(page);
  const data = fixture();
  const sauce = data.catalogue.items[0].groups[0];
  sauce.name = 'Sauces';
  sauce.min_selections = 1;
  sauce.max_selections = 2;
  sauce.options.push({ ...sauce.options[0], id: '00000000-0000-4000-8000-000000000022', name: 'Hot salsa', price_pence: 50 });
  sauce.options.push({ ...sauce.options[0], id: '00000000-0000-4000-8000-000000000023', name: 'Smoky salsa', price_pence: 75 });
  const first = '00000000-0000-4000-8000-000000000040';
  const second = '00000000-0000-4000-8000-000000000041';
  const extras = data.catalogue.items[0].groups[1];
  extras.max_selections = 1;
  data.catalogue.items[0].groups = expandModifierGroups([first, second], [
    { id: first, name: 'Taco 1 Filling', min_selections: 1, max_selections: 1, options: [{ ...sauce.options[0], id: first, modifier_group_id: first, name: 'Ember Chicken' }], child_group_ids: [sauce.id, extras.id] },
    { id: second, name: 'Taco 2 Filling', min_selections: 1, max_selections: 1, options: [{ ...sauce.options[0], id: second, modifier_group_id: second, name: 'Midnight Beef' }], child_group_ids: [sauce.id, extras.id] },
    sauce, extras,
  ]) as (typeof data.catalogue.items)[number]['groups'];
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  const picker = page.getByRole('dialog');
  await picker.getByRole('radio', { name: 'Ember Chicken', exact: true }).check();
  await picker.getByRole('radio', { name: 'Midnight Beef', exact: true }).check();
  const firstSauce = picker.getByRole('group', { name: 'Taco 1 Filling / Sauces', exact: true });
  const secondSauce = picker.getByRole('group', { name: 'Taco 2 Filling / Sauces', exact: true });
  await firstSauce.getByRole('checkbox', { name: 'Mild salsa', exact: true }).check();
  await firstSauce.getByRole('checkbox', { name: /Hot salsa/ }).check();
  await expect(firstSauce.getByRole('checkbox', { name: /Smoky salsa/ })).toBeDisabled();
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeDisabled();
  await secondSauce.getByRole('checkbox', { name: /Hot salsa/ }).check();
  await expect(secondSauce.getByRole('checkbox', { name: /Smoky salsa/ })).toBeEnabled();
  const firstExtras = picker.getByRole('group', { name: 'Taco 1 Filling / Extras', exact: true });
  await firstExtras.getByRole('radio', { name: /Guacamole/ }).check();
  await expect(picker.getByRole('group', { name: 'Taco 2 Filling / Extras', exact: true }).getByRole('radio', { name: 'None' })).toBeChecked();
  await firstExtras.getByRole('radio', { name: 'None' }).check();
  await firstExtras.getByRole('radio', { name: /Guacamole/ }).check();
  await expect(picker.getByText('£11.00', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: testInfo.project.name === 'mobile' ? 320 : 1440, height: 960 });
  await secondSauce.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('nested-picker.png'), fullPage: true });
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await page.goto('/bag');
  const choices = page.getByRole('group', { name: 'Selected Choices' });
  await expect(choices.getByRole('list')).toHaveCount(0);
  const firstPart = choices.getByRole('region', { name: 'Taco 1', exact: true });
  const secondPart = choices.getByRole('region', { name: 'Taco 2', exact: true });
  await expect(firstPart.getByRole('term')).toHaveText(['Filling', 'Sauces', 'Extras']);
  await expect(secondPart.getByRole('term')).toHaveText(['Filling', 'Sauces']);
  await expect(firstPart.locator('[data-slot="badge"]')).toHaveText(['Ember Chicken', 'Mild salsa', 'Hot salsa+£0.50', 'Guacamole+£1.50']);
  await expect(secondPart.locator('[data-slot="badge"]')).toHaveText(['Midnight Beef', 'Hot salsa+£0.50']);
  await expect(choices).not.toContainText('Included');
  for (const block of await choices.locator('section, dd, [data-slot="badge"]').all()) expect(await block.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('grouped-bag.png'), fullPage: true });
  await page.getByRole('button', { name: 'Edit Test Taco' }).click();
  await expect(firstSauce.getByRole('checkbox', { name: /Hot salsa/ })).toBeChecked();
  await expect(secondSauce.getByRole('checkbox', { name: /Hot salsa/ })).toBeChecked();
  await secondSauce.getByRole('checkbox', { name: /Hot salsa/ }).uncheck();
  await expect(firstSauce.getByRole('checkbox', { name: /Hot salsa/ })).toBeChecked();
  await expect(picker.getByRole('button', { name: 'Update Bag' })).toBeDisabled();
});

test('sold-out options are faded disabled blocks with badges and normal cursors', async ({ page }, testInfo) => {
  await isolateOptionPicker(page);
  const data = fixture();
  const extras = data.catalogue.items[0].groups[1];
  extras.options.push({ ...extras.options[0], id: '00000000-0000-4000-8000-000000000032', name: 'Slow Roasted Sweetcorn and Black Bean Salsa', price_pence: 0, is_available: false });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByText('Included', { exact: true })).toHaveCount(0);
  await expect(picker.getByText(/£0\.00/)).toHaveCount(0);
  await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  await picker.getByRole('checkbox', { name: /Guacamole/ }).check();
  extras.options[0].is_available = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const unavailable = picker.locator('[data-sold-out]');
  await expect(unavailable).toHaveCount(2);
  await expect(picker.getByRole('checkbox', { name: /Guacamole/ })).toBeChecked();
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeDisabled();
  await picker.getByRole('checkbox', { name: /Guacamole/ }).uncheck();
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeEnabled();
  await expect(picker.getByText('£8.50', { exact: true })).toBeVisible();
  for (const block of await unavailable.all()) {
    await expect(block.locator('input')).toBeDisabled();
    await expect(block.locator('[data-slot="badge"]')).toHaveText('Sold Out');
    await expect(block.locator('[data-slot="badge"]')).toHaveClass(/bg-red-600/);
    await expect(block).toHaveCSS('filter', 'none');
    await expect(block).toHaveCSS('opacity', '0.5');
    await expect(block.locator('label')).toHaveCSS('cursor', 'default');
    await expect(block.locator('input')).toHaveCSS('cursor', 'default');
  }
  for (const width of [testInfo.project.name === 'mobile' ? 390 : 1440, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await unavailable.last().scrollIntoViewIfNeeded();
    for (const block of await unavailable.all()) expect(await block.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`sold-out-options-${width}.png`), fullPage: true });
  }
});

test('option images and descriptions switch with choices and survive bag editing', async ({ page }, testInfo) => {
  await isolateOptionPicker(page);
  const data = fixture();
  const flavour = data.catalogue.items[0].groups[0];
  Object.assign(flavour.options[0], { description: '<p><strong>Mild roasted salsa.</strong></p>', imageUrl: '/images/tacos.jpg?option=mild', image_alt: 'Mild salsa preview' });
  flavour.options.push({ ...flavour.options[0], id: '00000000-0000-4000-8000-000000000022', name: 'Plain', description: '', imageUrl: null, image_alt: '' } as typeof flavour.options[number]);
  flavour.options.push({ ...flavour.options[0], id: '00000000-0000-4000-8000-000000000023', name: 'Unavailable flavour', is_available: false });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeDisabled();
  await expect(picker.getByRole('radio', { name: /Unavailable flavour/ })).toBeDisabled();
  await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  await expect(picker.locator('[aria-live="polite"] strong')).toHaveText('Mild roasted salsa.');
  await expect.poll(() => picker.getByAltText('Mild salsa preview').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(picker.getByAltText('Mild salsa preview')).toHaveCSS('object-fit', 'contain');
  await picker.getByRole('radio', { name: 'Plain', exact: true }).check();
  await expect(picker.getByAltText('Test tacos')).toBeVisible();
  await expect(picker.locator('[aria-live="polite"]')).toContainText(data.catalogue.items[0].description);
  await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  for (const width of [testInfo.project.name === 'mobile' ? 390 : 1440, 320]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const label of await picker.locator('fieldset label').all()) expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await picker.locator('[aria-live="polite"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`option-preview-${width}.png`), fullPage: true });
  }
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await page.goto('/bag');
  await page.getByRole('button', { name: 'Edit Test Taco' }).click();
  await expect(picker.getByRole('radio', { name: 'Mild salsa', exact: true })).toBeChecked();
  await expect(picker.getByAltText('Mild salsa preview')).toBeVisible();
});

test('ordering controls fail closed and react to global and event changes', async ({ page }) => {
  const data = fixture();
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  data.settings.ordering_status = 'closed';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Add to Bag', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Orders Closed' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: /Your bag,/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Main Navigation' }).getByRole('link', { name: 'Your Bag' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  for (const change of [() => { data.settings.ordering_status = 'paused'; }, () => { data.settings.ordering_status = 'open'; data.events = []; }, () => { data.events = [{ ...fixture().events[0], ordering_status: 'closed' }]; }]) {
    change();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: /Add .* to Bag/ })).toHaveCount(0);
    await expect(page.getByRole('article').getByRole('button', { name: 'Orders Closed' })).toBeDisabled();
    const eventsLink = page.getByRole('article').getByRole('link', { name: 'Find Out Where Our Food Truck Will Be Next' });
    await expect(eventsLink).toHaveAttribute('href', '/events');
    await expect(eventsLink).toHaveCSS('border-top-width', '1px');
    await expect(eventsLink).toHaveCSS('justify-content', 'center');
    await expect(eventsLink).toHaveCSS('text-align', 'center');
  }
  data.events = fixture().events;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Add Test Taco to Bag' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Your bag,/ })).toBeVisible();
  await page.route('**/api/catalogue', (route) => route.fulfill({ status: 503 }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: /Add .* to Bag/ })).toHaveCount(0);
});

test('anonymous customisation, extras, fees, edit and reload persistence', async ({ page }, testInfo) => {
  const data = fixture();
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Test Taco', exact: true }) });
  await expect(card.getByLabel('Category: Tacos', { exact: true })).toBeVisible();
  await expect(card.getByLabel('Category: Tacos', { exact: true }).locator('svg.lucide-utensils-crossed')).toBeVisible();
  await expect(card.getByText("Papa's Choice", { exact: true })).toBeVisible();
  const categoryBounds = (await card.getByLabel('Category: Tacos', { exact: true }).boundingBox())!;
  const imageBounds = (await card.getByRole('img').boundingBox())!;
  expect(categoryBounds.x).toBeGreaterThan(imageBounds.x + imageBounds.width / 2);
  expect(categoryBounds.y).toBeLessThan(imageBounds.y + imageBounds.height / 2);
  await expect(card.getByLabel('Dietary: Vegetarian', { exact: true })).toBeVisible();
  await expect(card.getByLabel('Dietary: Vegetarian', { exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(card.getByLabel('Dietary: Vegetarian', { exact: true }).locator('svg')).toHaveCSS('color', 'rgb(118, 202, 159)');
  await expect(card.getByText('Dietary Information', { exact: true })).toBeVisible();
  await expect(card.getByLabel('Contains: Milk', { exact: true })).toBeVisible();
  await expect(card.getByRole('group')).toHaveCount(0);
  await expect(card.locator('fieldset')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Test Taco to bag' }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeDisabled();
  await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  await picker.getByRole('checkbox', { name: /Guacamole/ }).check();
  await picker.getByRole('button', { name: 'Increase Test Taco' }).click();
  await expect(picker).toContainText('£20.00');
  await expect(picker.getByLabel('Contains: Milk', { exact: true })).toBeAttached();
  const panelBounds = await picker.boundingBox();
  expect(panelBounds).not.toBeNull();
  expect(panelBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await page.screenshot({ path: testInfo.outputPath('customise.png') });
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View Bag', exact: true })).toContainText('£20.00');
  await page.getByRole('link', { name: 'View Bag', exact: true }).click();
  await expect(page).toHaveURL(/\/bag$/);
  await expect.poll(() => page.getByRole('article').getByRole('img', { name: 'Test tacos' }).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Order Summary' })).toBeVisible();
  await expect(page.getByRole('article').getByLabel('Contains: Milk', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('complementary')).toContainText('£20.75');
  await expect(page.getByRole('button', { name: 'Checkout Unavailable' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Test Taco' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Test Taco' }).click();
  await page.getByRole('checkbox', { name: /Guacamole/ }).uncheck();
  await page.getByRole('button', { name: 'Update Bag' }).click();
  await expect(page.getByRole('complementary')).toContainText('£17.75');
  await page.goto('/sign-in?next=/bag');
  await expect(page.getByRole('link', { name: 'Your bag, 2 items' })).toBeVisible();
  await page.goto('/bag');
  await expect(page.getByRole('heading', { name: 'Test Taco' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('bag.png'), fullPage: true });
  await page.getByRole('button', { name: 'Remove Test Taco' }).click();
  await expect(page.getByText('Your bag is empty.', { exact: true })).toBeVisible();
});

test('filtering and sold-out refresh retain the bag but flag unavailability', async ({ page }, testInfo) => {
  const data = fixture();
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  await expect(page.getByRole('button', { name: 'Add Test Taco to bag' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search Menu' }).fill('does not exist');
  await expect(page.getByText('No dishes match your selection.')).toBeVisible();
  await page.getByRole('button', { name: 'Reset Filters' }).click();
  await page.getByRole('combobox', { name: 'Dietary Preference' }).click();
  await page.getByRole('option', { name: 'Vegan', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('No dishes match your selection.')).toBeVisible();
  await page.getByRole('button', { name: 'Reset Filters' }).click();
  await page.getByRole('button', { name: 'Add Test Taco to bag' }).click();
  await page.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  await page.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  data.catalogue.items[0].is_available = false;
  await page.goto('/bag');
  await page.reload();
  await expect(page.getByText('This item is sold out.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Test Taco' }).click();
  await expect(page.getByRole('button', { name: 'Update Bag' })).toBeDisabled();
  data.catalogue.items[0].is_crowd_favourite = true;
  await page.goto('/menu');
  const card = page.getByRole('article');
  await expect(card.getByRole('button', { name: 'Add Test Taco to Bag' })).toBeDisabled();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    const soldOut = card.getByText('Sold Out', { exact: true });
    await expect(soldOut).toBeVisible();
    await expect(soldOut.locator('..')).toHaveCSS('background-color', /^(rgba\(0, 0, 0, 0\.4\)|oklab\(0 0 0 \/ 0\.4\))$/);
    const image = (await card.getByRole('img').boundingBox())!;
    const overlay = (await soldOut.locator('..').boundingBox())!;
    expect(overlay).toEqual(image);
    const textBounds = (await soldOut.boundingBox())!;
    const badgeBounds = (await card.getByText('Crowd Favourites', { exact: true }).boundingBox())!;
    expect(textBounds.y).toBeGreaterThanOrEqual(badgeBounds.y + badgeBounds.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.screenshot({ path: testInfo.outputPath(`sold-out-${width}.png`) });
  }
});

test('menu supports multiple categories and dietary choices, removal and reset', async ({ page }, testInfo) => {
  const data = fixture();
  const secondCategory = '00000000-0000-4000-8000-000000000011';
  data.catalogue.categories.push({ id: secondCategory, name: 'Sides', slug: 'sides', sort_order: 1 });
  data.catalogue.items.push({ ...data.catalogue.items[0], id: '00000000-0000-4000-8000-000000000002', category_id: secondCategory, name: 'Test Side', slug: 'test-side', dietary_tags: ['vegan'] });
  data.catalogue.items.push({ ...data.catalogue.items[0], id: '00000000-0000-4000-8000-000000000003', name: 'Test Chicken', slug: 'test-chicken', dietary_tags: [] });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  await expect(page.getByRole('article')).toHaveCount(3);
  for (const [label, option] of [['Menu Category', 'Tacos'], ['Menu Category', 'Sides'], ['Dietary Preference', 'Vegetarian'], ['Dietary Preference', 'Vegan']]) {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('article').getByRole('heading')).toHaveText(['Test Taco', 'Test Side']);
  const searchBackground = await page.getByRole('searchbox', { name: 'Search Menu' }).evaluate((input) => getComputedStyle(input).backgroundColor);
  for (const control of await page.locator('.filter-select__control').all()) {
    await expect(control).toHaveCSS('background-color', searchBackground);
    await expect(control).toHaveCSS('cursor', 'pointer');
  }
  await expect(page.getByRole('combobox', { name: 'Menu Category' })).toHaveCSS('cursor', 'pointer');
  await expect(page.locator('.filter-select__multi-value').first()).toHaveCSS('background-color', 'rgb(240, 187, 125)');
  await expect(page.getByRole('button', { name: 'Remove Tacos', exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.2)');
  await expect(page.getByRole('button', { name: 'Reset Filters' })).toHaveCSS('background-color', 'rgb(240, 187, 125)');
  for (const control of await page.locator('.filter-select__control').all()) await expect(control).toHaveCSS('height', '44px');
  await page.getByRole('button', { name: 'Remove Tacos', exact: true }).click();
  await expect(page.getByRole('article').getByRole('heading')).toHaveText(['Test Side']);
  await page.getByRole('searchbox', { name: 'Search Menu' }).fill('missing');
  await expect(page.getByText('No dishes match your selection.')).toBeVisible();
  await page.getByRole('button', { name: 'Reset Filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('searchbox', { name: 'Search Menu' })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Reset Filters' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Dietary Preference' }).focus();
  await page.keyboard.type('vegan');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('article').getByRole('heading')).toHaveText(['Test Side']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('menu-filters.png'), fullPage: true });
});

test('scroll to top appears past one viewport and hides after five idle seconds', async ({ page }, testInfo) => {
  const data = fixture();
  data.catalogue.items = Array.from({ length: 12 }, (_, index) => ({ ...data.catalogue.items[0], id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: index === 0 ? 'Test Taco' : `Taco ${index + 1}`, slug: `taco-${index + 1}` }));
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Test Taco', exact: true })).toBeVisible();
  await page.clock.install();
  const control = page.locator('button[aria-label="Scroll to Top"]');
  await expect(control).toHaveAttribute('aria-hidden', 'true');
  await page.evaluate(() => window.scrollTo(0, innerHeight + 100));
  await expect(control).toHaveAttribute('aria-hidden', 'false');
  await expect(control).toHaveCSS('opacity', '1');
  await expect(control).toHaveCSS('right', page.viewportSize()!.width >= 640 ? '40px' : '24px');
  await expect(control).toHaveCSS('bottom', page.viewportSize()!.width >= 640 ? '32px' : '24px');
  await page.screenshot({ path: testInfo.outputPath('scroll-to-top.png') });
  await page.clock.fastForward(4000);
  await expect(control).toHaveAttribute('aria-hidden', 'false');
  await page.evaluate(() => window.scrollBy(0, -10));
  await page.clock.fastForward(4000);
  await expect(control).toHaveAttribute('aria-hidden', 'false');
  await page.clock.fastForward(1000);
  await expect(control).toHaveAttribute('aria-hidden', 'true');
  await expect(control).toHaveCSS('opacity', '0');
  await expect(control).toHaveAttribute('tabindex', '-1');
  await page.evaluate(() => window.scrollBy(0, -10));
  await expect(control).toHaveAttribute('aria-hidden', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await control.click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(control).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('html').evaluate((element) => ({
    width: getComputedStyle(element, '::-webkit-scrollbar').width,
    thumb: getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
    radius: getComputedStyle(element, '::-webkit-scrollbar-thumb').borderRadius,
    arrows: getComputedStyle(element, '::-webkit-scrollbar-button').display,
  }))).toEqual({ width: '10px', thumb: expect.stringMatching(/^rgb\((240, 187, 125|255, 211, 159)\)$/), radius: '0px', arrows: 'none' });
});

test('picker shows one custom or fallback allergy notice', async ({ page }, testInfo) => {
  const data = fixture();
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  for (const scenario of [
    { note: 'Ask us about preparation before ordering this dish.', allergens: ['milk'], expected: 'Ask us about preparation before ordering this dish.' },
    { note: '', allergens: [], expected: 'Allergen information is awaiting confirmation. Ask the team before ordering; an empty allergen list does not mean allergen-free.' },
    { note: '   ', allergens: ['milk'], expected: 'Cross-contamination may occur. Speak to our team about any food allergy before ordering.' },
    { note: 'Allergen information is awaiting confirmation. Ask the team before ordering; an empty allergen list does not mean allergen-free.', allergens: ['sesame'], expected: 'Allergen information is awaiting confirmation. Ask the team before ordering; listed allergens may not be exhaustive.' },
    { note: 'Ask the team before ordering; an empty allergen list does not mean allergen-free.', allergens: ['milk'], expected: 'Ask the team before ordering; listed allergens may not be exhaustive.' },
  ]) {
    data.catalogue.items[0].allergen_note = scenario.note;
    data.catalogue.items[0].allergens = scenario.allergens;
    await page.goto('/menu');
    await page.getByRole('button', { name: 'Add Test Taco to Bag', exact: true }).click();
    const picker = page.getByRole('dialog');
    const notice = picker.getByRole('note', { name: 'Allergy Notice' });
    await expect(notice).toHaveCount(1);
    await expect(notice).toHaveText(scenario.expected);
    await expect(notice).toHaveCSS('border-top-width', '1px');
    await expect(notice.locator('svg.lucide-circle-alert')).toBeVisible();
    await expect(picker.getByText('Please confirm allergen information with our team before ordering.', { exact: true })).toHaveCount(0);
    await expect(picker.getByLabel('Contains: Milk', { exact: true })).toHaveCount(scenario.allergens.includes('milk') ? 1 : 0);
    await expect(picker.getByLabel('Contains: Sesame', { exact: true })).toHaveCount(scenario.allergens.includes('sesame') ? 1 : 0);
    if (scenario.note.trim()) {
      await expect(picker.getByText('Cross-contamination may occur.', { exact: false })).toHaveCount(0);
      await notice.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('allergy-notice.png') });
    }
  }
});

test('homepage has three Papas Choice items followed by three Crowd Favourites', async ({ page }, testInfo) => {
  const data = fixture();
  data.catalogue.items = Array.from({ length: 8 }, (_, index) => ({ ...data.catalogue.items[0], id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: `Highlight ${index + 1}`, slug: `highlight-${index + 1}`, is_featured: index < 4, is_crowd_favourite: index >= 4, sort_order: index }));
  data.catalogue.items[0].description = 'Fresh salsa.';
  data.catalogue.items[1].description = 'Roasted vegetables with fresh salsa and coriander. '.repeat(12);
  data.catalogue.items[2].description = '<p>Fresh tacos.</p><p>Made daily with salsa.</p><p>' + 'Choose your filling and extras. '.repeat(12) + '</p>';
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/');
  const slogans = page.locator('.festival-band > span');
  await expect(slogans).toHaveCount(3);
  await expect(page.locator('.festival-band')).toHaveCSS('column-gap', page.viewportSize()!.width >= 1024 ? '192px' : '48px');
  for (const slogan of await slogans.all()) {
    await expect(slogan).toBeVisible();
    await expect(slogan).toHaveCSS('column-gap', '8px');
    await expect(slogan.locator('svg')).toHaveCount(1);
  }
  const papas = page.getByRole('region', { name: "Papa's Choice", exact: true });
  const crowd = page.getByRole('region', { name: 'Crowd Favourites', exact: true });
  await expect(papas.getByText('Handpicked by Papa', { exact: true })).toHaveCSS('color', 'rgb(241, 91, 80)');
  await expect(crowd.getByText('Loved by the Crowd', { exact: true })).toHaveCSS('color', 'rgb(241, 91, 80)');
  await expect(papas.getByRole('article').getByRole('heading')).toHaveText(['Highlight 1', 'Highlight 2', 'Highlight 3']);
  const descriptionAreas = papas.getByRole('article').locator('h3 + div');
  for (const area of await descriptionAreas.all()) {
    await expect(area.locator(':scope > div').first()).toHaveCSS('height', '91px');
    expect((await area.boundingBox())!.height).toBe(131);
  }
  await expect(papas.getByRole('button', { name: 'Show full description for Highlight 1', exact: true })).toHaveCount(0);
  const expand = papas.getByRole('button', { name: 'Show full description for Highlight 2', exact: true });
  await expect(expand).toBeVisible();
  await expand.click();
  expect((await descriptionAreas.nth(1).boundingBox())!.height).toBeGreaterThan(131);
  await papas.getByRole('button', { name: 'Show less for Highlight 2', exact: true }).click();
  expect((await descriptionAreas.nth(1).boundingBox())!.height).toBe(131);
  await expect(crowd.getByRole('article').getByRole('heading')).toHaveText(['Highlight 5', 'Highlight 6', 'Highlight 7']);
  await expect(papas.getByText("Papa's Choice", { exact: true })).toHaveCount(4);
  await expect(crowd.getByText('Crowd Favourites', { exact: true })).toHaveCount(4);
  await expect(page.getByRole('main').getByText('Featured', { exact: true })).toHaveCount(0);
  expect((await crowd.boundingBox())!.y).toBeGreaterThan((await papas.boundingBox())!.y + (await papas.boundingBox())!.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await papas.screenshot({ path: testInfo.outputPath('papas-choice.png') });
  await crowd.screenshot({ path: testInfo.outputPath('crowd-favourites.png') });
  data.catalogue.items[0].is_crowd_favourite = true;
  await page.goto('/menu');
  const shared = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Highlight 1', exact: true }) });
  await expect(shared.getByText("Papa's Choice", { exact: true })).toBeVisible();
  await expect(shared.getByText('Crowd Favourites', { exact: true })).toBeVisible();
  await expect(shared.getByText("Papa's Choice", { exact: true }).locator('svg.lucide-skull')).toBeVisible();
  await expect(shared.getByText('Crowd Favourites', { exact: true }).locator('svg.lucide-star')).toBeVisible();
  for (const label of ["Papa's Choice", 'Crowd Favourites']) await expect(shared.getByText(label, { exact: true })).toHaveCSS('color', 'rgb(240, 187, 125)');
});

test('menu descriptions display in full without clipping or an expander', async ({ page }, testInfo) => {
  const data = fixture();
  data.catalogue.items[0].description = 'Freshly prepared tacos with roasted vegetables, black beans, coriander, lime and our homemade salsa. '.repeat(8);
  data.catalogue.items.push({ ...data.catalogue.items[0], id: '00000000-0000-4000-8000-000000000002', name: 'Short Taco', slug: 'short-taco', description: 'Fresh salsa.' });
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/menu');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Test Taco', exact: true }) });
  const description = card.getByText(data.catalogue.items[0].description, { exact: true }).locator('..');
  await expect(page.getByRole('button', { name: 'Show full description for Short Taco' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Show full description for Test Taco' })).toHaveCount(0);
  expect(await description.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('expanded-description.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await description.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('description-preview.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('rich menu descriptions show formatting and spaced paragraphs without unsafe content', async ({ page }, testInfo) => {
  const data = fixture();
  data.catalogue.items[0].description = '<p><strong>Fresh &amp; spicy</strong> tacos.</p><p>Made daily with <em>homemade salsa</em>.</p><ul><li>Choose your filling</li><li>Add your extras</li></ul><script>window.__unsafeDescription = true</script><img src=x onerror="window.__unsafeDescription = true">';
  data.catalogue.items[0].description += `<p>${'Freshly prepared with roasted vegetables and homemade salsa. '.repeat(12)}</p>`;
  data.catalogue.items[0].is_featured = true;
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.goto('/');
  const highlight = page.getByRole('region', { name: "Papa's Choice", exact: true }).getByRole('article').filter({ has: page.getByRole('heading', { name: 'Test Taco', exact: true }) });
  await expect(highlight.locator('strong')).toHaveText('Fresh & spicy');
  await expect(highlight.getByText('Made daily with homemade salsa.', { exact: true })).toHaveCSS('margin-top', '12px');
  const highlightDescription = highlight.locator('strong').locator('../..');
  await expect(highlight.getByRole('button', { name: 'Show full description for Test Taco' })).toBeVisible();
  expect(await highlightDescription.evaluate((element) => {
    const boundary = element.getBoundingClientRect().bottom;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      if (Array.from(range.getClientRects()).some((rect) => rect.top < boundary && rect.bottom > boundary)) return true;
    }
    return false;
  })).toBe(false);
  await highlight.screenshot({ path: testInfo.outputPath('homepage-preview.png') });
  await highlight.getByRole('button', { name: 'Show full description for Test Taco' }).click();
  expect(await highlightDescription.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await highlight.screenshot({ path: testInfo.outputPath('homepage-description.png') });
  await page.goto('/menu');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Test Taco', exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Show full description for Test Taco' })).toHaveCount(0);
  await expect(card.getByText('Dietary Information', { exact: true }).locator('../../..')).toHaveCSS('border-top-width', '1px');
  await expect(card.locator('strong').filter({ hasText: 'Fresh & spicy' })).toBeVisible();
  await expect(card.locator('em')).toHaveText('homemade salsa');
  await expect(card.getByText('Made daily with homemade salsa.', { exact: true })).toHaveCSS('margin-top', '12px');
  await expect(card.locator('li')).toHaveCount(2);
  await expect(card.locator('script, [onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => '__unsafeDescription' in window)).toBe(false);
  await page.getByRole('searchbox', { name: 'Search Menu' }).fill('Fresh & spicy');
  await expect(card).toHaveCount(1);
  await page.getByRole('button', { name: 'Add Test Taco to bag' }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.locator('strong').filter({ hasText: 'Fresh & spicy' })).toBeVisible();
  const expand = picker.getByRole('button', { name: 'Show full description for Test Taco' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  const pickerDescription = picker.locator(`[id="${await expand.getAttribute('aria-controls')}"]`);
  await expect(pickerDescription).toHaveCSS('overflow-y', 'hidden');
  await expand.click();
  expect(await pickerDescription.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeInViewport();
  await picker.getByRole('button', { name: 'Show less for Test Taco' }).click();
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(picker.getByText('Made daily with homemade salsa.', { exact: true })).toHaveCSS('margin-top', '12px');
  await expect(picker.locator('script, [onerror]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rich-description.png') });
});

test('public pages and a populated menu fit a narrow viewport', async ({ page }, testInfo) => {
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: fixture() }));
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of ['/menu', '/events', '/testimonials', '/bag']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
  await page.goto('/menu');
  await expect(page.getByRole('button', { name: 'Add Test Taco to bag' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('menu.png'), fullPage: true });
});

test('corrupt local storage and a catalogue outage leave a usable bag page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('papas-tacos:bag:v1', '{not valid json'));
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: { catalogue: { items: [], categories: [], available: false }, settings: null } }));
  await page.goto('/bag');
  await expect(page.getByText('Your bag is empty.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore the Menu' })).toBeVisible();
});

test('editing explicitly removes a sold-out extra and recalculates the saved bag', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  data.catalogue.items[0].groups[1].options[0].is_available = false;
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.addInitScript(({ itemId, mildId, guacamoleId }) => {
    localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [mildId, guacamoleId], quantity: 1 }] }));
  }, { itemId, mildId, guacamoleId });
  await page.goto('/bag');
  await expect(page.getByText('One or more choices are unavailable. Please edit this item.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Test Taco' }).click();
  await expect(page.getByRole('checkbox', { name: /Guacamole/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Update Bag' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Guacamole/ }).uncheck();
  await page.getByRole('button', { name: 'Update Bag' }).click();
  await expect(page.getByRole('complementary')).toContainText('£9.25');
  await expect(page.getByText('One or more choices are unavailable. Please edit this item.')).not.toBeVisible();
});

test('ingredient removals stay free, preserve separate recipes and require explicit review when withdrawn', async ({ page }, testInfo) => {
  await isolateOptionPicker(page);
  const data = fixture();
  const removals = Object.assign(data.catalogue.items[0].groups[1], {
    name: 'Nachos Removals', group_type: 'removal', max_selections: 30,
    options: [
      { id: guacamoleId, modifier_group_id: extrasId, name: 'No Cheese', price_pence: 0, allergens: [], is_available: true, sort_order: 0 },
      { id: '00000000-0000-4000-8000-000000000032', modifier_group_id: extrasId, name: 'No Onions', price_pence: 0, allergens: [], is_available: true, sort_order: 1 },
      { id: '00000000-0000-4000-8000-000000000033', modifier_group_id: extrasId, name: 'Extra Salsa', price_pence: 0, allergens: [], is_available: true, sort_order: 2 },
    ],
  });
  await page.route('**/api/catalogue', route => route.fulfill({ json: data }));
  await page.goto('/menu?event=market');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  const picker = page.getByRole('dialog');
  const remove = picker.getByRole('group', { name: 'Make It Yours', exact: true });
  await expect(remove.locator('p')).toHaveText('Prefer it without or need a little extra? Tick to remove any ingredients or modify options on your order. Leave unticked for the standard recipe.');
  await expect(remove).not.toContainText('Nachos Removals');
  await expect(remove).not.toContainText('Up to');
  await expect(remove).not.toContainText('Optional');
  await expect(remove).toHaveClass(/bg-brand-yellow\/10/);
  await expect(remove).not.toHaveClass(/pink|red/);
  await expect(remove).toHaveCSS('border-top-width', '1px');
  await expect(remove).toHaveCSS('border-left-width', '4px');
  await expect(picker.getByRole('group', { name: 'Salsa', exact: true })).toContainText('Choose 1');
  await expect(picker.getByRole('group', { name: 'Salsa', exact: true })).toContainText('Required');
  await expect(remove.getByRole('checkbox')).toHaveCount(3);
  await expect(remove.getByRole('checkbox', { name: 'Extra Salsa', exact: true })).not.toBeChecked();
  await expect(remove).not.toContainText('No No');
  await expect(remove.getByRole('checkbox', { name: 'No Cheese' })).not.toBeChecked();
  await expect(remove.getByRole('checkbox', { name: 'No Onions' })).not.toBeChecked();
  await remove.scrollIntoViewIfNeeded();
  await remove.screenshot({ path: testInfo.outputPath('remove-options.png') });
  await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  await remove.getByRole('checkbox', { name: 'No Cheese' }).check();
  await remove.getByRole('checkbox', { name: 'No Onions' }).check();
  await expect(remove.getByRole('checkbox', { name: 'No Onions' })).toHaveClass(/accent-brand-yellow/);
  await page.setViewportSize({ width: 320, height: 844 });
  await remove.scrollIntoViewIfNeeded();
  expect(await remove.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await picker.getByRole('button', { name: 'Increase Test Taco' }).click();
  await expect(picker.getByText('£17.00', { exact: true })).toBeVisible();
  await expect(picker.locator('[aria-label="Contains: Milk"]')).toBeVisible();
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await page.goto('/bag');
  await expect(page.getByRole('button', { name: 'Edit Test Taco' })).toHaveCount(2);
  const summary = page.getByRole('region', { name: 'Make It Yours' });
  await expect(summary).toContainText('No Cheese');
  await expect(summary).toContainText('No Onions');
  await page.getByRole('button', { name: 'Edit Test Taco' }).last().click();
  await expect(remove.getByRole('checkbox', { name: 'No Cheese' })).toBeChecked();
  await expect(remove.getByRole('checkbox', { name: 'No Onions' })).toBeChecked();
  await remove.getByRole('checkbox', { name: 'No Cheese' }).uncheck();
  await picker.getByRole('button', { name: 'Update Bag' }).click();
  await expect(summary).not.toContainText('No Cheese');
  removals.options[1].is_available = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('One or more choices are unavailable. Please edit this item.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Test Taco' }).last().click();
  const withdrawn = remove.getByRole('checkbox', { name: /No Onions/ });
  await expect(withdrawn).toBeChecked();
  await expect(withdrawn).toBeEnabled();
  await expect(picker.getByRole('button', { name: 'Update Bag' })).toBeDisabled();
  await withdrawn.uncheck();
  await picker.getByRole('button', { name: 'Update Bag' }).click();
  await expect(page.getByRole('button', { name: 'Edit Test Taco' })).toHaveCount(1);
  await expect(page.getByText('One or more choices are unavailable. Please edit this item.')).not.toBeVisible();
});

test('paid customisations display surcharges and multiply through picker and bag quantities', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  Object.assign(data.catalogue.items[0].groups[1], {
    group_type: 'removal', min_selections: 0, max_selections: 30,
    options: [
      { id: guacamoleId, modifier_group_id: extrasId, name: 'Extra Cheese', price_pence: 125, allergens: [], is_available: true, sort_order: 0 },
      { id: '00000000-0000-4000-8000-000000000032', modifier_group_id: extrasId, name: 'No Onions', price_pence: 0, allergens: [], is_available: true, sort_order: 1 },
    ],
  });
  await page.route('**/api/catalogue', route => route.fulfill({ json: data }));
  await page.goto('/menu?event=market');
  await page.getByRole('button', { name: 'Add Test Taco to Bag' }).click();
  const picker = page.getByRole('dialog');
  const options = picker.getByRole('group', { name: 'Make It Yours', exact: true });
  await expect(options.getByRole('checkbox', { name: /Extra Cheese/ })).toHaveAccessibleName('Extra Cheese +£1.25');
  await expect(options.getByRole('checkbox', { name: 'No Onions', exact: true })).toBeVisible();
  await expect(options).not.toContainText('£0.00');
  await picker.getByRole('radio', { name: 'Mild salsa', exact: true }).check();
  await options.getByRole('checkbox', { name: /Extra Cheese/ }).check();
  await options.getByRole('checkbox', { name: 'No Onions', exact: true }).check();
  await picker.getByRole('button', { name: 'Increase Test Taco' }).click();
  await expect(picker.getByText('£19.50', { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await page.goto('/bag');
  const summary = page.getByRole('region', { name: 'Make It Yours' });
  await expect(summary).toContainText('Extra Cheese');
  await expect(summary).toContainText('+£1.25');
  await expect(summary).toContainText('No Onions');
  await page.getByRole('button', { name: 'Edit Test Taco', exact: true }).click();
  await expect(options.getByRole('checkbox', { name: /Extra Cheese/ })).toBeChecked();
  await options.getByRole('checkbox', { name: /Extra Cheese/ }).uncheck();
  await expect(picker.getByText('£17.00', { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Update Bag' }).click();
  await expect(summary).not.toContainText('Extra Cheese');
  await expect(summary).toContainText('No Onions');
});

test('deleted removal choices require acknowledgement before a saved recipe can be updated', async ({ page }) => {
  await isolateOptionPicker(page);
  const data = fixture();
  data.catalogue.items[0].groups.splice(1, 1);
  await page.route('**/api/catalogue', route => route.fulfill({ json: data }));
  await page.addInitScript(({ itemId, mildId, guacamoleId }) => {
    localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [mildId, guacamoleId], quantity: 1 }] }));
    localStorage.setItem('papas-tacos:event', 'market');
  }, { itemId, mildId, guacamoleId });
  await page.goto('/bag');
  await page.getByRole('button', { name: 'Edit Test Taco' }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('alert')).toContainText('A saved choice is no longer on the menu');
  await expect(picker.getByRole('button', { name: 'Update Bag' })).toBeDisabled();
  await picker.getByRole('button', { name: 'Clear unavailable choices' }).click();
  await picker.getByRole('button', { name: 'Update Bag' }).click();
  await expect(page.getByText('One or more choices are unavailable. Please edit this item.')).not.toBeVisible();
});

test('long food labels and a populated bag stay usable at narrow widths', async ({ page }, testInfo) => {
  const data = fixture();
  data.catalogue.items[0].name = 'Roasted Vegetable and Black Bean Tacos';
  data.catalogue.items[0].allergens = ['cereals-containing-gluten', 'sulphur-dioxide-sulphites', 'tree-nuts', 'milk'];
  data.catalogue.items[0].dietary_tags = ['vegetarian', 'gluten-free', 'dairy-free'];
  data.catalogue.items[0].groups[0].name = 'Taco 1 filling';
  data.catalogue.items[0].groups[0].options[0].name = 'Ember Chicken';
  data.catalogue.items[0].groups[1].name = 'Taco 2 filling';
  data.catalogue.items[0].groups[1].options[0].name = 'Midnight Beef';
  data.catalogue.items[0].groups[1].options[0].price_pence = 0;
  data.catalogue.items[0].price_pence = 800;
  data.settings.minimum_order_pence = 1500;
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.addInitScript(({ itemId, mildId, guacamoleId }) => localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [mildId, guacamoleId], quantity: 1 }] })), { itemId, mildId, guacamoleId });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/menu');
    await expect(page.getByRole('heading', { name: data.catalogue.items[0].name })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View Bag', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View Bag', exact: true })).toHaveCSS('background-color', 'rgb(8, 123, 85)');
    const search = page.getByRole('searchbox', { name: 'Search Menu' });
    await search.focus();
    await expect(search).toHaveCSS('outline-style', 'none');
    await expect(search).toHaveCSS('box-shadow', 'none');
    const searchBounds = (await search.boundingBox())!;
    const resetBounds = (await page.getByRole('button', { name: 'Reset Filters' }).boundingBox())!;
    const filterBounds = await page.locator('.filter-select__control').evaluateAll((controls) => controls.map((control) => { const bounds = control.getBoundingClientRect(); return { y: bounds.y, width: bounds.width, height: bounds.height }; }));
    expect(searchBounds.height).toBe(44);
    expect(resetBounds.height).toBe(44);
    expect(resetBounds.y).toBe(searchBounds.y);
    expect(searchBounds.width / (searchBounds.width + resetBounds.width)).toBeCloseTo(0.85, 2);
    expect(filterBounds[0].height).toBe(44);
    expect(filterBounds[1].height).toBe(44);
    expect(filterBounds[0].width).toBeCloseTo(filterBounds[1].width, 0);
    expect(filterBounds[0].y).toBe(filterBounds[1].y);
    expect(filterBounds[0].y).toBeGreaterThan(searchBounds.y + searchBounds.height);
    await page.evaluate(() => {
      const control = document.querySelector('input[type="search"]')!;
      window.scrollBy(0, control.getBoundingClientRect().top - 30);
    });
    expect(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, 50)?.closest('header') !== null)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    const barBounds = (await page.getByRole('link', { name: 'View Bag', exact: true }).boundingBox())!;
    const cardBounds = (await page.getByRole('article').boundingBox())!;
    expect(barBounds.y + barBounds.height).toBeLessThanOrEqual(cardBounds.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`menu-badges-${width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'View Bag', exact: true }).click();
    await expect(page.getByText('Add £7.00 more to reach the £15.00 minimum food order.')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCSS('border-bottom-width', '1px');
    for (const action of ['Increase', 'Decrease']) {
      const button = page.getByRole('button', { name: `${action} ${data.catalogue.items[0].name}`, exact: true });
      await expect(button).toHaveCSS('color', 'rgb(240, 187, 125)');
      await expect(button).not.toHaveCSS('background-color', 'rgb(240, 187, 125)');
    }
    for (const control of [page.getByRole('button', { name: `Edit ${data.catalogue.items[0].name}`, exact: true }), page.getByRole('link', { name: 'Add More', exact: true })]) {
      const resting = await control.evaluate((element) => getComputedStyle(element).backgroundColor);
      await control.hover();
      await expect(control).not.toHaveCSS('background-color', resting);
      await page.mouse.move(0, 0);
    }
    await expect(page.getByRole('complementary').getByRole('status').filter({ hasText: 'Online checkout' })).toHaveCSS('border-top-width', '1px');
    for (const action of ['Edit', 'Remove']) await expect(page.getByRole('button', { name: `${action} ${data.catalogue.items[0].name}`, exact: true })).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.getByRole('group', { name: 'Selected Choices' }).getByRole('region', { name: 'Taco 1', exact: true })).toContainText('Ember Chicken');
    await expect(page.getByRole('group', { name: 'Selected Choices' }).getByRole('region', { name: 'Taco 2', exact: true })).toContainText('Midnight Beef');
    for (const label of ['Category', 'Dietary', 'Allergens']) {
      const information = page.getByRole('article').getByRole('group', { name: label, exact: true });
      await expect(information).toBeVisible();
      await expect(information).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(information).toHaveCSS('padding', '0px');
      await expect(information).toHaveCSS('border-top-width', '0px');
    }
    await expect(page.getByRole('article').locator('fieldset')).toHaveCount(0);
    const informationRow = page.getByRole('article').getByRole('group', { name: 'Category', exact: true }).locator('..');
    await expect(informationRow).toHaveCSS('border-top-width', '1px');
    await expect(informationRow).toHaveCSS('flex-wrap', 'wrap');
    if (width >= 768) {
      const categoryBounds = (await page.getByRole('group', { name: 'Category', exact: true }).boundingBox())!;
      const dietaryBounds = (await page.getByRole('group', { name: 'Dietary', exact: true }).boundingBox())!;
      expect(dietaryBounds.y).toBe(categoryBounds.y);
      expect(dietaryBounds.x).toBeGreaterThan(categoryBounds.x + categoryBounds.width);
    }
    expect(await page.getByRole('article').getByLabel('Category: Tacos', { exact: true }).evaluate((badge) => badge.scrollWidth <= badge.clientWidth)).toBe(true);
    await expect(page.getByRole('article').getByRole('img').locator('..')).toHaveCSS('border-color', 'rgb(240, 187, 125)');
    await expect(page.getByRole('article').getByLabel('Contains: Sulphur Dioxide Sulphites')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`bag-badges-${width}.png`), fullPage: true });
  }
});