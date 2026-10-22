import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { resolveLinkedItems } from '../../src/lib/catalogue/linked-items';

const parentId = '00000000-0000-4000-8000-000000000001';
const fantaId = '00000000-0000-4000-8000-000000000002';
const cokeId = '00000000-0000-4000-8000-000000000003';
const categoryId = '00000000-0000-4000-8000-000000000010';
const groupId = '00000000-0000-4000-8000-000000000020';
const fantaChoice = '00000000-0000-4000-8000-000000000021';
const cokeChoice = '00000000-0000-4000-8000-000000000022';
const eventId = '00000000-0000-4000-8000-000000000030';
let bundle: string;

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { BagProvider, MenuOrderingProvider } from '@/components/bag/bag-provider';
      import { MenuBrowser } from '@/components/catalogue/menu-browser';
      import { BagView } from '@/components/bag/bag-view';
      import { RecordEditor } from '@/components/admin/record-editor';
      import { RecordCard } from '@/components/admin/record-card';
      const kind = new URLSearchParams(location.search).get('kind');
      const references = {
        modifier_groups:[{id:'${groupId}',name:'Choose your drink'}],
        menu_categories:[{id:'${categoryId}',name:'Drinks'}],
        menu_items:[{id:'${fantaId}',name:'Fanta Orange',slug:'fanta-orange',price_pence:200,is_published:true,item_kind:'product',show_standalone:false}],
      };
      createRoot(document.getElementById('fixture')).render(kind === 'admin-cards'
        ? <><RecordCard resourceKey="menu" row={{id:'${parentId}',name:'Cans of Pop',item_kind:'group',price_pence:0}} references={references}>{null}</RecordCard>
          <RecordCard resourceKey="options" row={{id:'${fantaChoice}',name:'Fanta choice',linked_menu_item_id:'${fantaId}',linked_quantity:2,pricing_mode:'item',price_pence:0}} references={references}>{null}</RecordCard></>
        : kind === 'admin-option'
        ? <RecordEditor resourceKey="options" row={null} references={references} onClose={() => {}} onSaved={() => window.__saved = true} />
        : kind === 'admin-parent' ? <RecordEditor resourceKey="menu" row={null} references={references} onClose={() => {}} onSaved={() => window.__saved = true} />
        : <main className="page-width py-8"><BagProvider>{kind === 'bag' ? <BagView /> : <MenuOrderingProvider eventId="${eventId}"><MenuBrowser initial={{items:[],categories:[],available:false}} /></MenuOrderingProvider>}</BagProvider></main>);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'linked-items-fixture', setup(builder) {
      builder.onResolve({ filter: /^(next\/(link|image|navigation)|@\/app\/admin\/actions|@\/lib\/supabase\/config)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
        loader: 'tsx', resolveDir: process.cwd(),
        contents: args.path === 'next/link' ? 'import React from "react"; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }'
          : args.path === 'next/image' ? 'import React from "react"; export default function Image({fill,unoptimized,priority,...props}) { return <img {...props} style={fill ? {position:"absolute",width:"100%",height:"100%",inset:0} : undefined} />; }'
            : args.path === 'next/navigation' ? 'export const useRouter = () => ({refresh(){}}); export const usePathname = () => location.pathname;'
              : args.path.endsWith('/config') ? 'export const supabaseConfig = () => null;'
                : 'export async function saveRecord(...args) { window.__saveArgs = args; return {ok:true}; }',
      }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

function catalogue() {
  const base = {
    category_id: categoryId, slug: 'drink', description: '', price_pence: 200, image_path: null,
    imageUrl: null, image_alt: '', dietary_tags: [], allergens: [], allergen_note: '', is_available: true,
    is_featured: false, is_crowd_favourite: false, sort_order: 0, item_kind: 'product' as const, show_standalone: false, groups: [],
  };
  return {
    available: true, categories: [{ id: categoryId, name: 'Drinks', slug: 'drinks', sort_order: 0 }],
    items: resolveLinkedItems([
      { ...base, id: parentId, name: 'Cans of Pop', price_pence: 0, item_kind: 'group', show_standalone: true, groups: [{
        id: groupId, name: 'Choose your drink', min_selections: 1, max_selections: 1, options: [
          { id: fantaChoice, modifier_group_id: groupId, name: 'Old Fanta label', price_pence: 0, allergens: [], is_available: true, sort_order: 0, linked_menu_item_id: fantaId, linked_quantity: 1, pricing_mode: 'item' },
          { id: cokeChoice, modifier_group_id: groupId, name: 'Old Coke label', price_pence: 0, allergens: [], is_available: true, sort_order: 1, linked_menu_item_id: cokeId, linked_quantity: 1, pricing_mode: 'item' },
        ],
      }] },
      { ...base, id: fantaId, name: 'Fanta Orange', description: 'Orange-flavoured sparkling drink.', allergens: ['milk'] },
      { ...base, id: cokeId, name: 'Coca-Cola', price_pence: 250 },
    ]),
  };
}

async function fixture(page: Page, kind = 'menu') {
  await page.goto('/sign-in');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.route('**/__linked.js', (route) => route.fulfill({ contentType: 'application/javascript', body: bundle }));
  await page.route('**/__linked?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="fixture"></div><script src="/__linked.js"></script></body></html>` }));
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: {
    catalogue: catalogue(),
    settings: { business_name: "Papa's Tacos", ordering_status: 'open', card_enabled: true, service_fee_pence: 0, packaging_fee_pence: 0, minimum_order_pence: 0 },
    events: [{ id: eventId, title: 'Friday Market', service_mode: 'car', pickup_enabled: true, ordering_status: 'open', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z' }],
  } }));
  await page.route('**/api/stock*', (route) => route.fulfill({ json: { stock: [
    { menu_item_id: parentId, tracking_mode: 'none', available_quantity: null },
    { menu_item_id: fantaId, tracking_mode: 'global', available_quantity: 2 },
    { menu_item_id: cokeId, tracking_mode: 'global', available_quantity: 0 },
  ] } }));
  await page.goto(`/__linked?kind=${kind}`);
}

test('grouped drinks use real product names, prices, allergens and individual stock', async ({ page }) => {
  await fixture(page);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('£2.00');
  await page.getByRole('button', { name: 'Add Cans of Pop to Bag' }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('radio', { name: /Coca-Cola/ })).toBeDisabled();
  await expect(picker.getByRole('button', { name: 'Add to Bag', exact: true })).toBeDisabled();
  await picker.getByRole('radio', { name: /Fanta Orange/ }).check();
  await expect(picker).toContainText('Orange-flavoured sparkling drink.');
  await expect(picker.getByLabel('Contains: Milk', { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Increase Cans of Pop' }).click();
  await expect(picker.getByRole('button', { name: 'Increase Cans of Pop' })).toBeDisabled();
  await expect(picker).toContainText('£4.00');
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await page.goto('/__linked?kind=bag');
  await expect(page.getByRole('heading', { name: 'Cans of Pop', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fanta Orange', exact: true })).toBeVisible();
  await expect(page.getByText('£2.00 each', { exact: true })).toBeVisible();
  await expect(page.getByText('£0.00 each before extras', { exact: true })).toHaveCount(0);
  const selectedChoices = page.getByRole('group', { name: 'Fanta Orange', exact: true });
  await expect(selectedChoices).toContainText('£2.00');
  await expect(selectedChoices).not.toContainText('+£2.00');
  await expect(page.getByRole('complementary', { name: 'Order Summary' })).toContainText('£4.00');
  await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toBeVisible();
});

test('grouped bag consolidates different product prices while preserving independent controls', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/stock*', (route) => route.fulfill({ json: { stock: [
    { menu_item_id: parentId, tracking_mode: 'none', available_quantity: null },
    { menu_item_id: fantaId, tracking_mode: 'global', available_quantity: 5 },
    { menu_item_id: cokeId, tracking_mode: 'global', available_quantity: 5 },
  ] } }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'Add Cans of Pop to Bag' }).click();
  const picker = page.getByRole('dialog');
  await picker.getByRole('radio', { name: /Fanta Orange/ }).check();
  await picker.getByRole('button', { name: 'Increase Cans of Pop' }).click();
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await page.getByRole('button', { name: 'Add Cans of Pop to Bag' }).click();
  await picker.getByRole('radio', { name: /Coca-Cola/ }).check();
  await picker.getByRole('button', { name: 'Add to Bag', exact: true }).click();
  await page.goto('/__linked?kind=bag');
  const section = page.getByRole('article', { name: 'Cans of Pop', exact: true });
  await expect(section).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Cans of Pop', exact: true })).toHaveCount(1);
  await expect(section.getByLabel('Cans of Pop total', { exact: true })).toHaveText('£6.50');
  const fanta = section.getByRole('group', { name: 'Fanta Orange', exact: true });
  const coke = section.getByRole('group', { name: 'Coca-Cola', exact: true });
  await expect(fanta).toContainText('£2.00 each');
  await expect(fanta.getByLabel('Fanta Orange quantity', { exact: true })).toHaveText('2');
  await expect(coke).toContainText('£2.50 each');
  await fanta.getByRole('button', { name: 'Decrease Fanta Orange' }).click();
  await expect(section.getByLabel('Cans of Pop total', { exact: true })).toHaveText('£4.50');
  await coke.getByRole('button', { name: 'Edit Coca-Cola', exact: true }).click();
  await expect(picker.getByRole('radio', { name: /Coca-Cola/ })).toBeChecked();
  await picker.getByRole('button', { name: 'Update Bag', exact: true }).click();
  await coke.getByRole('button', { name: 'Remove Coca-Cola', exact: true }).click();
  await expect(coke).toHaveCount(0);
  await expect(fanta).toBeVisible();
  await expect(section.getByLabel('Cans of Pop total', { exact: true })).toHaveText('£2.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin cards describe grouped prices and show inherited prices with quantity multipliers', async ({ page }) => {
  await fixture(page, 'admin-cards');
  const cards = page.getByRole('article');
  await expect(cards.nth(0)).toContainText('Priced by Choices');
  await expect(cards.nth(1)).toContainText('£4.00');
  await expect(page.getByText('£0.00', { exact: true })).toHaveCount(0);
});

test('all required product choices sold out disables only their grouped listing', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/stock*', (route) => route.fulfill({ json: { stock: [
    { menu_item_id: parentId, tracking_mode: 'none', available_quantity: null },
    { menu_item_id: fantaId, tracking_mode: 'global', available_quantity: 0 },
    { menu_item_id: cokeId, tracking_mode: 'global', available_quantity: 0 },
  ] } }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Add Cans of Pop to Bag' })).toBeDisabled();
  await expect(page.getByRole('article').getByText('Sold Out', { exact: true })).toBeVisible();
});

test('admin links a real product with explicit pricing and no duplicate inherited fields', async ({ page }) => {
  await fixture(page, 'admin-option');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Modifier Group *', exact: true }).click();
  await page.getByRole('option', { name: 'Choose your drink', exact: true }).click();
  await dialog.getByLabel('Linked Menu Item', { exact: true }).click();
  await page.getByRole('option', { name: 'Fanta Orange (fanta-orange)', exact: true }).click();
  await expect(dialog.locator('[data-admin-field="name"]')).toHaveCount(0);
  await expect(dialog).toContainText('Fanta Orange');
  await dialog.getByLabel('Choice Pricing', { exact: true }).click();
  await page.getByRole('option', { name: "Use Linked Item's Price", exact: true }).click();
  await expect(dialog.locator('[data-admin-field="price_pence"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__saved'))).toBe(true);
  const args = await page.evaluate(() => Reflect.get(window, '__saveArgs'));
  expect(args[3]).toMatchObject({ linked_menu_item_id: fantaId, linked_quantity: 1, pricing_mode: 'item', price_pence: 0, name: 'Fanta Orange' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin grouped listing has zero base price and independent standalone visibility', async ({ page }) => {
  await fixture(page, 'admin-parent');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Name *', exact: true }).fill('Cans of Pop');
  await dialog.getByLabel('Menu Item Kind', { exact: true }).click();
  await page.getByRole('option', { name: 'Grouped Listing (Stock Comes from Linked Choices)', exact: true }).click();
  await expect(dialog.locator('[data-admin-field="price_pence"]')).toHaveCount(0);
  await expect(dialog.getByLabel('Show as a Standalone Menu Item', { exact: true })).toBeChecked();
  await dialog.getByRole('combobox', { name: 'Category *', exact: true }).click();
  await page.getByRole('option', { name: 'Drinks', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__saved'))).toBe(true);
  const args = await page.evaluate(() => Reflect.get(window, '__saveArgs'));
  expect(args[3]).toMatchObject({ item_kind: 'group', show_standalone: true, price_pence: 0 });
});
