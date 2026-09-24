import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'tsx', contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { ResourceManager } from '@/components/admin/resource-manager';
        import { ResourceReorder } from '@/components/admin/resource-reorder';
        import { OrderFilters } from '@/components/admin/order-filters';
        import { DashboardOverview } from '@/components/admin/dashboard-overview';
        import { AdminRefresh } from '@/components/admin/order-controls';
        import { SiteMenu } from '@/components/site-menu';
        import { OrderList } from '@/components/account/order-views';
        import AccountPage from '@/app/(public)/account/page';
        function OrdersFixture() {
          const [query, setQuery] = React.useState('/admin/orders');
          window.__onNavigate = setQuery;
          const params = new URL(query, location.origin).searchParams;
          return <main className="p-5"><OrderFilters initialSearch={params.get('q') || ''} initialStatuses={params.getAll('status').filter(status => status !== 'all')} initialEvents={params.getAll('event')} events={[{value: ids[0], label: 'Town Market'}, {value: ids[1], label: 'Food Festival'}]} /></main>;
        }
        const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
        const category = '00000000-0000-0000-0000-000000000010';
        const groups = [{ id: category, name: 'Tacos' }];
        const rows = ['Ember Chicken', 'Birria Beef', 'Garden Tacos'].map((name, index) => ({ id: ids[index], name, slug: name.toLowerCase().replaceAll(' ', '-'), category_id: category, description: 'Fresh salsa, coriander and lime with your choice of filling.', price_pence: 800 + index * 100, is_published: index !== 2, is_available: index !== 1, image_path: 'images/menu/fixture.jpg', image_alt: 'Tacos with fresh toppings', updated_at: '2026-09-21T12:00:00Z', sort_order: index * 10 }));
        const saved = JSON.parse(sessionStorage.getItem('saved-order') || 'null');
        const ordered = saved ? saved.map(id => rows.find(row => row.id === id)) : rows;
        const kind = new URLSearchParams(location.search).get('kind');
        if (kind === 'archived') rows[0].archived_at = '2026-09-21T12:00:00Z';
        if (kind === 'menu-rich') rows[0].description = '<p><strong>Fresh tacos</strong> with homemade salsa.</p><p>' + 'Roasted vegetables, coriander and lime with your choice of filling. '.repeat(12) + '</p><ul><li>Choose your extras</li></ul>';
        if (kind === 'menu-rich') Object.assign(rows[0], { is_featured: true, is_crowd_favourite: true, dietary_tags: ['vegetarian', 'gluten-free'], allergens: ['milk', 'sulphur-dioxide-sulphites'] });
        if (kind === 'grouped') {
          groups[0].sort_order = 20;
          groups.push({ id: '00000000-0000-0000-0000-000000000011', name: 'Desserts', sort_order: 10 });
          rows[1].category_id = groups[1].id;
          rows[1].sort_order = 0;
        }
        const order = { id: ids[0], order_number: 1042, status: 'ready_for_pickup', payment_status: 'paid', payment_method: 'card', total_pence: 1850, created_at: '2026-09-21T12:00:00Z', pickup_starts_at: '2026-09-21T13:00:00Z', pickup_ends_at: '2026-09-21T13:15:00Z', pickup_location: { venue_name: 'Town Market' } };
        const settingsRow = { business_name: "Papa's Tacos", ordering_status: 'closed', ordering_message: null, cash_enabled: true, card_enabled: false, service_fee_pence: 0, packaging_fee_pence: 0, minimum_order_pence: 0, contact_email: null, contact_phone: null, instagram_url: null, facebook_url: null, about_eyebrow: 'Our story', about_heading: 'A little about Papa’s', about_page_heading: 'About Papa’s Tacos', about_content: 'Original About copy.', about_full_story: '<p><strong>Original full story.</strong></p>', about_image_path: null, about_image_alt: 'Fresh tacos', about_page_image_1_path: null, about_page_image_1_alt: 'Papa’s Tacos street food', about_page_image_2_path: null, about_page_image_2_alt: 'Papa’s Tacos at an event', about_page_image_3_path: null, about_page_image_3_alt: 'Papa’s Tacos food truck', updated_at: '2026-09-22T12:00:00Z' };
        function DashboardFixture() {
          const [status, setStatus] = React.useState(kind === 'dashboard-paused' ? 'paused' : 'open');
          window.__updateOrdering = setStatus;
          return <DashboardOverview fullName="Sam" orders={[{...order, customer_name: 'Alex Taylor'}, {...order, id: ids[1], order_number: 1043, status: 'preparing', customer_name: 'Morgan Jones'}]} menu={rows} events={[{id: ids[0], title: 'Friday Street Food Market', venue_name: 'Town Square', starts_at: '2026-09-25T17:00:00Z'}]} settings={kind === 'dashboard-unavailable' ? undefined : {ordering_status: status, updated_at: '2026-09-22T12:00:00Z'}} />;
        }
        const root = createRoot(document.getElementById('fixture'));
        function MenuFixture() {
          const [items, setItems] = React.useState(rows);
          window.__updateAvailability = (id, available) => setItems(current => current.map(row => row.id === id ? {...row, is_available: available, updated_at: '2026-09-22T12:00:00Z'} : row));
          return <ResourceManager resourceKey="menu" rows={items} references={{menu_categories: groups, modifier_groups: []}} />;
        }
        if (kind === 'account-page') AccountPage({searchParams: Promise.resolve({})}).then(element => root.render(element));
        else root.render(
          <><AdminRefresh />{kind.startsWith('dashboard') ? <DashboardFixture /> :
          kind.startsWith('edit-') ? <ResourceManager resourceKey={kind.slice(5)} rows={kind === 'edit-settings' ? [settingsRow] : [{id: ids[0], name: 'Original Name', author_name: 'Original Customer', body: 'Wonderful food.', updated_at: '2026-09-22T12:00:00Z'}]} references={{}} /> :
          kind === 'reorder' ? <ResourceReorder resourceKey="menu" rows={ordered} scopes={groups} scope={category} /> :
          kind === 'order-filters' ? <OrdersFixture /> :
          ['menu', 'menu-rich', 'archived', 'grouped'].includes(kind) ? <MenuFixture /> :
          kind === 'customer' ? <main className="mx-auto max-w-5xl p-5"><h1 className="mb-6 text-3xl font-semibold">Your Orders</h1><OrderList orders={[order, {...order, id: ids[1], order_number: 1039, status: 'collected'}]} /></main> :
          <SiteMenu signedIn admin={false} />}</>
        );
      `,
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'isolated-dashboard-fixture', setup(builder) {
      builder.onResolve({ filter: /^(next\/(navigation|image|link)|@\/app\/.*actions|@\/lib\/supabase\/(config|client)|@\/lib\/auth\/session|@\/lib\/account\/data)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
        let contents = '';
        if (args.path === 'next/navigation') contents = `export const useRouter = () => ({ refresh() { window.__refreshes = (window.__refreshes || 0) + 1; }, push(url) { window.__navigation = url; }, replace(url) { window.__navigation = url; window.__onNavigate?.(url); } }); export const usePathname = () => location.pathname; export const notFound = () => { throw new Error('Not found'); };`;
        else if (args.path === '@/lib/auth/session') contents = `export const requireAccount = async () => ({user: {email: 'alexander.customer.with.a.long.email@example.com'}, profile: {full_name: 'Alex Taylor', phone: '', role: 'admin'}});`;
        else if (args.path === '@/lib/account/data') contents = `export const getCustomerOrders = async () => ({orders: [], total: 0}); export const getCustomerOrder = async () => null;`;
        else if (args.path === 'next/link') contents = `import React from 'react'; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }`;
        else if (args.path === 'next/image') contents = `import React from 'react'; export default function Image({fill, unoptimized, priority, ...props}) { return <img {...props} style={fill ? {position:'absolute',width:'100%',height:'100%',inset:0} : undefined} />; }`;
        else if (args.path.endsWith('/config')) contents = `export const supabaseConfig = () => ({url: location.origin, key: 'fixture'});`;
        else if (args.path.endsWith('/client')) contents = `export const createBrowserSupabase = () => ({});`;
        else contents = `
          export async function reorderRecords(key, ids, previous, scope) {
            window.__savedRequest = {key, ids, previous, scope};
            if (window.__failSave) return {ok:false, error:'List changed; refresh before reordering'};
            sessionStorage.setItem('saved-order', JSON.stringify(ids)); return {ok:true};
          }
          export async function signOut() { window.__signedOut = true; }
          export async function cancelCheckout() {}
          export async function removeRecord(...args) { window.__removed = args; return {ok:true}; }
          export async function unarchiveMenuItem(...args) { window.__unarchived = args; return {ok:true}; }
          export async function setMenuAvailability(id, version, available) {
            window.__availabilityRequest = {id, version, available};
            if (window.__holdAvailability) await new Promise(resolve => { window.__releaseAvailability = resolve; });
            if (window.__failAvailability) return {ok:false, error:'This item changed or was archived.'};
            window.__updateAvailability(id, available); return {ok:true};
          }
          export async function saveRecord(...args) { window.__savedRecord = args; return {ok:true}; }
          export async function updateOrder() { return {ok:true}; }
          export async function setMaintenanceMode() { return {ok:true}; }
          export async function setOrderingStatus(status, version) {
            window.__orderingRequest = {status, version};
            if (window.__holdOrdering) await new Promise(resolve => { window.__releaseOrdering = resolve; });
            if (window.__failOrdering) return {ok:false, error:'Ordering settings changed. Please try again.'};
            window.__updateOrdering?.(status); return {ok:true};
          }
          export async function assignGroups() { return {ok:true}; }
          export async function requestMagicLink() { return {status:'success', message:'Fixture'}; }
          export async function signInWithGoogle() {}
          export async function updateProfile() { return {status:'success', message:'Fixture'}; }
        `;
        return { contents, loader: 'tsx', resolveDir: process.cwd() };
      });
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

async function fixture(page: Page, kind: string) {
  await page.route('https://cdn.jsdelivr.net/npm/tinymce@8.9.1/**', async (route) => {
    const asset = new URL(route.request().url()).pathname.split('/tinymce@8.9.1/')[1];
    await route.fulfill({ contentType: asset.endsWith('.css') ? 'text/css' : 'application/javascript', body: await readFile(path.resolve('node_modules/tinymce', asset)) });
  });
  await page.goto('/sign-in');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.route('**/storage/v1/object/public/images/menu/fixture.jpg', async (route) => {
    await route.fulfill({ contentType: 'image/jpeg', body: await readFile(path.resolve('public/images/tacos_hero.jpg')) });
  });
  await page.route('**/__dashboard_fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: bundle }));
  await page.route('**/__dashboard_test?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="fixture"></div><script src="/__dashboard_fixture.js"></script></body></html>` }));
  await page.goto(`/__dashboard_test?kind=${kind}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#fixture > *').first()).toBeVisible();
}

test('account sidebar has room for navigation and long email addresses', async ({ page }, testInfo) => {
  await fixture(page, 'account-page');
  const sidebar = page.getByRole('complementary', { name: 'Account Navigation' });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 768) {
      expect((await sidebar.boundingBox())!.width).toBe(width >= 1024 ? 288 : 256);
      await expect(sidebar.getByRole('button', { name: 'Sign Out' })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: 'Admin Dashboard' })).toBeVisible();
    }
    for (const link of await page.getByRole('navigation', { name: 'Customer dashboard' }).getByRole('link').all()) {
      await expect(link).toBeVisible();
      expect(await link.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`account-${width}.png`), fullPage: true });
  }
});

test('admin cards show media, statuses, filters, actions and reorder navigation', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fixture(page, 'menu');
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /Refresh/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reorder', exact: true })).toHaveAttribute('href', '/admin/menu/reorder');
  await expect(page.getByText('Sold Out', { exact: true })).toBeVisible();
  await expect.poll(() => page.getByAltText('Tacos with fresh toppings').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByRole('textbox', { name: /Search Menu/i }).fill('Birria');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('textbox', { name: /Search Menu/i }).fill('');
  await page.getByRole('combobox', { name: 'Publication Status' }).click();
  await page.getByRole('option', { name: 'Draft', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Garden Tacos' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset Filters' }).click();
  await page.getByRole('button', { name: 'Edit Ember Chicken' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading')).toBeFocused();
  await expect(page.getByText('Cereals Containing Gluten', { exact: true })).toBeVisible();
  await expect(page.getByText('Gluten Free', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Ember Chicken' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('cannot be undone');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('admin-cards.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('dashboard cards and ordering switch handle saving, failure and recovery', async ({ page }, testInfo) => {
  await fixture(page, 'dashboard');
  const toggle = page.getByRole('switch', { name: 'Online Ordering' });
  await expect(toggle).toBeChecked();
  await expect(page.getByText('Open for Orders', { exact: true })).toBeVisible();
  for (const label of ['Active Orders: 2', 'Ready for Pickup: 1', 'Published Dishes: 2', 'Upcoming Events: 1']) await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  const shortcuts = page.getByRole('region', { name: 'Quick Shortcuts' });
  const expectedShortcuts = [
    ['Manage Menu', '/admin/menu'],
    ['Manage Categories', '/admin/categories'],
    ['Manage Orders', '/admin/orders'],
    ['Manage Events', '/admin/events'],
    ['Manage Pickup Slots', '/admin/slots'],
    ['Manage Modifier Groups', '/admin/modifiers'],
    ['Manage Modifier Options', '/admin/options'],
    ['Manage Testimonials', '/admin/testimonials'],
    ['Reorder Menu', '/admin/menu/reorder'],
    ['Reorder Categories', '/admin/categories/reorder'],
    ['Reorder Events', '/admin/events/reorder'],
    ['Reorder Modifier Groups', '/admin/modifiers/reorder'],
    ['Reorder Modifier Options', '/admin/options/reorder'],
    ['Reorder Testimonials', '/admin/testimonials/reorder'],
  ];
  await expect(shortcuts.getByRole('link')).toHaveText(expectedShortcuts.map(([label]) => label));
  for (const [label, href] of expectedShortcuts) await expect(shortcuts.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', href);
  await expect(page.getByRole('region', { name: 'Upcoming Events' }).getByRole('link', { name: 'Manage Menu' })).toHaveCount(0);
  const shortcutBounds = (await shortcuts.boundingBox())!;
  for (const label of ['Next Pickups', 'Upcoming Events']) {
    const sectionBounds = (await page.getByRole('region', { name: label }).boundingBox())!;
    expect(shortcutBounds.y).toBeGreaterThanOrEqual(sectionBounds.y + sectionBounds.height);
  }
  await expect(page.getByRole('button', { name: /Refresh/ })).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as { __holdOrdering: boolean }).__holdOrdering = true; });
  await toggle.click();
  await expect(toggle).toBeDisabled();
  await expect(page.getByText('Updating...', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __orderingRequest: unknown }).__orderingRequest)).toEqual({ status: 'closed', version: '2026-09-22T12:00:00Z' });
  await page.evaluate(() => { const state = window as unknown as { __holdOrdering: boolean; __releaseOrdering: () => void }; state.__holdOrdering = false; state.__releaseOrdering(); });
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText('Orders Closed', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __failOrdering: boolean }).__failOrdering = true; });
  await toggle.click();
  await expect(page.getByRole('alert')).toContainText('Ordering settings changed');
  await expect(toggle).not.toBeChecked();
  await page.evaluate(() => { (window as unknown as { __failOrdering: boolean }).__failOrdering = false; });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(toggle).toHaveCSS('background-color', 'rgb(118, 202, 159)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard-320.png'), fullPage: true });
});

test('dashboard distinguishes paused ordering and disables unavailable settings', async ({ page }) => {
  await fixture(page, 'dashboard-paused');
  await expect(page.getByText('Orders Paused', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Online Ordering' })).not.toBeChecked();
  await page.getByRole('switch', { name: 'Online Ordering' }).click();
  await expect(page.getByText('Open for Orders', { exact: true })).toBeVisible();
  await fixture(page, 'dashboard-unavailable');
  await expect(page.getByRole('switch', { name: 'Online Ordering' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Ordering settings are unavailable');
});

test('menu availability action toggles between states and preserves failed saves', async ({ page }, testInfo) => {
  await fixture(page, 'menu');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Ember Chicken', exact: true }) });
  const soldOut = card.getByRole('button', { name: 'Set As Sold Out: Ember Chicken', exact: true });
  const available = card.getByRole('button', { name: 'Set As Available: Ember Chicken', exact: true });
  await expect(soldOut).toHaveAttribute('title', 'Set As Sold Out');
  expect(await soldOut.evaluate(element => [element.previousElementSibling?.getAttribute('title'), element.nextElementSibling?.getAttribute('title')])).toEqual(['Modifier Groups', 'Archive']);
  await page.evaluate(() => { Object.assign(window, { __holdAvailability: true }); });
  await soldOut.click();
  await expect(soldOut).toBeDisabled();
  await expect(card.getByText('Available', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __availabilityRequest: unknown }).__availabilityRequest)).toEqual({ id: '00000000-0000-0000-0000-000000000001', version: '2026-09-21T12:00:00Z', available: false });
  await page.evaluate(() => { Object.assign(window, { __holdAvailability: false }); (window as unknown as { __releaseAvailability: () => void }).__releaseAvailability(); });
  await expect(available).toBeEnabled();
  await expect(card.getByText('Sold Out', { exact: true })).toBeVisible();
  await page.evaluate(() => { Object.assign(window, { __failAvailability: true }); });
  await available.click();
  await expect(available).toBeEnabled();
  await expect(card.getByText('Sold Out', { exact: true })).toBeVisible();
  await page.evaluate(() => { Object.assign(window, { __failAvailability: false }); });
  await available.click();
  await expect(soldOut).toBeEnabled();
  await expect(card.getByText('Available', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __availabilityRequest: unknown }).__availabilityRequest)).toEqual({ id: '00000000-0000-0000-0000-000000000001', version: '2026-09-22T12:00:00Z', available: true });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: testInfo.outputPath('availability-action.png') });
  await fixture(page, 'archived');
  await expect(page.getByRole('button', { name: 'Set As Sold Out: Ember Chicken', exact: true })).toBeDisabled();
});

test('admin menu descriptions preview whole lines and expand rich text', async ({ page }, testInfo) => {
  await fixture(page, 'menu-rich');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Ember Chicken', exact: true }) });
  const papas = card.getByText("Papa's Choice", { exact: true });
  const crowd = card.getByText('Crowd Favourites', { exact: true });
  await expect(papas.locator('svg.lucide-skull')).toBeVisible();
  await expect(crowd.locator('svg.lucide-star')).toBeVisible();
  for (const badge of [papas, crowd]) await expect(badge).toHaveCSS('color', 'rgb(240, 187, 125)');
  await expect(crowd.locator('svg')).toHaveCSS('fill', 'rgb(240, 187, 125)');
  await expect(card.getByLabel('Dietary: Vegetarian', { exact: true }).locator('svg')).toHaveCSS('color', 'rgb(118, 202, 159)');
  await expect(card.getByLabel('Contains: Milk', { exact: true }).locator('svg')).toHaveCSS('color', 'rgb(241, 91, 80)');
  await expect(card.getByText('Dietary Information', { exact: true }).locator('../../..')).toHaveCSS('border-top-width', '1px');
  const expand = card.getByRole('button', { name: 'Show full description for Ember Chicken' });
  await expect(expand).toBeVisible();
  const description = page.locator(`[id="${await expand.getAttribute('aria-controls')}"]`);
  await expect(description.locator('strong')).toHaveText('Fresh tacos');
  await expect(description.locator('p').nth(1)).toHaveCSS('margin-top', '12px');
  await expect(page.getByRole('button', { name: 'Show full description for Birria Beef' })).toHaveCount(0);
  for (const width of [page.viewportSize()!.width, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    for (const badge of await card.locator('[aria-label^="Dietary:"], [aria-label^="Contains:"]').all()) {
      await expect(badge).toBeVisible();
      expect(await badge.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await expect.poll(() => description.evaluate((element) => {
      const boundary = element.getBoundingClientRect().bottom;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const visible = new Set<number>();
      let sliced = false;
      while (walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const rect of range.getClientRects()) {
          if (rect.bottom <= boundary) visible.add(rect.top);
          if (rect.top < boundary && rect.bottom > boundary) sliced = true;
        }
      }
      return { lines: visible.size, sliced };
    })).toEqual({ lines: 6, sliced: false });
    await card.screenshot({ path: testInfo.outputPath(`admin-description-${width}.png`) });
    await expand.click();
    expect(await description.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    await expect(description.locator('li')).toHaveText('Choose your extras');
    await card.getByRole('button', { name: 'Show less for Ember Chicken' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('menu rich text editor formats paragraphs and saves HTML', async ({ page }, testInfo) => {
  await fixture(page, 'menu');
  await page.getByRole('button', { name: 'Edit Ember Chicken' }).click();
  const dialog = page.getByRole('dialog');
  const body = page.frameLocator('iframe.tox-edit-area__iframe').locator('body');
  await expect(body).toBeVisible();
  await expect(body).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(dialog.getByRole('toolbar')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(dialog.getByRole('button', { name: /Strikethrough|Clear formatting|Remove format/i })).toHaveCount(0);
  await body.fill('Fresh tacos');
  await body.press('ControlOrMeta+A');
  await dialog.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(body.locator('strong')).toHaveText('Fresh tacos');
  await body.press('ControlOrMeta+End');
  await body.press('Enter');
  await body.pressSequentially('Made daily with salsa.');
  await expect(body.locator('p')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('rich-text-editor.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() => (window as unknown as { __savedRecord: [string, string, string, Record<string, unknown>] }).__savedRecord);
  expect(saved[3].description).toContain('<strong>Fresh tacos</strong>');
  expect(String(saved[3].description).match(/<p>/g)).toHaveLength(2);
  expect(saved[3].description).toContain('Made daily with salsa.');
});

test('menu editor saves Papas Choice and Crowd Favourites independently', async ({ page }) => {
  await fixture(page, 'menu');
  await page.getByRole('button', { name: 'Edit Ember Chicken' }).click();
  const dialog = page.getByRole('dialog');
  const papas = dialog.getByRole('switch', { name: "Papa's Choice", exact: true });
  const crowd = dialog.getByRole('switch', { name: 'Crowd Favourites', exact: true });
  await expect(dialog.getByRole('switch', { name: 'Featured', exact: true })).toHaveCount(0);
  await papas.check();
  await crowd.check();
  await papas.uncheck();
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() => (window as unknown as { __savedRecord: [string, string, string, Record<string, unknown>] }).__savedRecord);
  expect(saved[0]).toBe('menu');
  expect(saved[3].is_featured).toBe(false);
  expect(saved[3].is_crowd_favourite).toBe(true);
});

test('named edit forms focus the heading without selecting the first text field', async ({ page }) => {
  for (const resource of ['testimonials', 'categories', 'modifiers']) {
    await fixture(page, `edit-${resource}`);
    await page.getByRole('button', { name: /^Edit Original/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toBeFocused();
    const firstInput = dialog.locator('input[type="text"]').first();
    await expect(firstInput).toHaveValue(resource === 'testimonials' ? 'Original Customer' : 'Original Name');
    expect(await firstInput.evaluate((input: HTMLInputElement) => input.selectionStart === input.selectionEnd)).toBe(true);
    await expect(firstInput).not.toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

test('admin refreshes automatically while leaving open edits undisturbed', async ({ page }) => {
  await page.clock.install();
  await fixture(page, 'menu');
  const count = () => page.evaluate(() => (window as unknown as { __refreshes?: number }).__refreshes ?? 0);
  const initial = await count();
  await page.clock.fastForward(15000);
  await expect.poll(count).toBeGreaterThan(initial);
  await page.getByRole('button', { name: 'Edit Ember Chicken' }).click();
  const duringEdit = await count();
  await page.clock.fastForward(30000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(await count()).toBe(duringEdit);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(count).toBeGreaterThan(duringEdit);
  const beforeReconnect = await count();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(count).toBeGreaterThan(beforeReconnect);
});

test('combined menu groups items by category order before their local positions', async ({ page }) => {
  await fixture(page, 'grouped');
  await expect(page.getByRole('heading', { level: 2, name: /^(Desserts|Tacos)$/ })).toHaveText(['Desserts', 'Tacos']);
  await expect(page.getByRole('article').getByRole('heading')).toHaveText(['Birria Beef', 'Ember Chicken', 'Garden Tacos']);
});

test('admin filters combine categories and publication statuses and reset search', async ({ page }, testInfo) => {
  await fixture(page, 'grouped');
  for (const [label, option] of [['Category', 'Tacos'], ['Category', 'Desserts'], ['Publication Status', 'Published'], ['Publication Status', 'Draft']]) {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Reorder', exact: true })).toHaveAttribute('href', '/admin/menu/reorder');
  await page.getByRole('button', { name: 'Remove Desserts', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Reorder', exact: true })).toHaveAttribute('href', '/admin/menu/reorder?scope=00000000-0000-0000-0000-000000000010');
  await page.getByRole('button', { name: 'Remove Published', exact: true }).click();
  await expect(page.getByRole('article').getByRole('heading')).toHaveText(['Garden Tacos']);
  await page.getByRole('textbox', { name: /Search Menu/i }).fill('missing');
  await expect(page.getByRole('heading', { name: 'No Matching Records' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset Filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('textbox', { name: /Search Menu/i })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Reset Filters' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('admin-filters.png'), fullPage: true });
});

test('order filters start empty, automatically apply choices and search, and reset', async ({ page }, testInfo) => {
  await fixture(page, 'order-filters');
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filter', exact: true })).toHaveCount(0);
  for (const [label, option] of [['Order Status', 'Order Received'], ['Order Status', 'Collected'], ['Event', 'Town Market'], ['Event', 'Food Festival']]) {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
    await page.keyboard.press('Escape');
  }
  await page.getByRole('textbox', { name: 'Search Orders' }).pressSequentially('Alex Smith');
  await expect(page.getByRole('textbox', { name: 'Search Orders' })).toBeFocused();
  for (const control of await page.locator('.filter-select__control').all()) await expect(control).toHaveCSS('height', '44px');
  const destination = new URL(await page.evaluate(() => (window as unknown as { __navigation: string }).__navigation), 'http://localhost');
  expect(destination.pathname).toBe('/admin/orders');
  expect(destination.searchParams.getAll('status')).toEqual(['ordered', 'collected']);
  expect(destination.searchParams.getAll('event')).toEqual(['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']);
  expect(destination.searchParams.get('q')).toBe('Alex Smith');
  expect(destination.searchParams.has('page')).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('order-filters.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reset Filters' }).click();
  expect(await page.evaluate(() => (window as unknown as { __navigation: string }).__navigation)).toBe('/admin/orders?status=all');
  await expect(page.getByRole('textbox', { name: 'Search Orders' })).toHaveValue('');
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
});

test('archived menu items offer a confirmed Unarchive action', async ({ page }) => {
  await fixture(page, 'archived');
  await page.getByRole('combobox', { name: 'Publication Status' }).click();
  await page.getByRole('option', { name: 'Archived', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Unarchive Ember Chicken', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('unpublished, unavailable draft');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { __unarchived?: string[] }).__unarchived)).toBeUndefined();
  await page.getByRole('button', { name: 'Unarchive Ember Chicken', exact: true }).click();
  await page.getByRole('button', { name: 'Unarchive', exact: true }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __unarchived: string[] }).__unarchived)).toEqual(['00000000-0000-0000-0000-000000000001', '2026-09-21T12:00:00Z']);
});

test('keyboard reorder can reset, save and retain saved positions after reload', async ({ page }, testInfo) => {
  await fixture(page, 'reorder');
  await expect(page.getByRole('link', { name: 'Category Order', exact: true })).toHaveAttribute('href', '/admin/categories/reorder');
  await expect(page.getByRole('link', { name: 'Item Order', exact: true })).toHaveAttribute('aria-current', 'page');
  const items = page.getByRole('list', { name: /Display Order/ }).getByRole('listitem');
  const handle = page.getByRole('button', { name: 'Reorder Ember Chicken', exact: true });
  await handle.focus();
  await page.keyboard.press('Space', { delay: 50 });
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[id^="DndLiveRegion"]')).toContainText('over droppable area 00000000-0000-0000-0000-000000000001');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[id^="DndLiveRegion"]')).toContainText('over droppable area 00000000-0000-0000-0000-000000000002');
  await page.keyboard.press('Space');
  await expect(items.first()).toContainText('Birria Beef');
  await expect(page.getByRole('button', { name: 'Save Order' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reset Changes' }).click();
  await expect(items.first()).toContainText('Ember Chicken');
  await expect(page.getByRole('button', { name: 'Save Order' })).toBeDisabled();
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map((animation) => animation.finished)); });
  await handle.focus();
  await page.keyboard.press('Space', { delay: 50 });
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[id^="DndLiveRegion"]')).toContainText('over droppable area 00000000-0000-0000-0000-000000000001');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[id^="DndLiveRegion"]')).toContainText('over droppable area 00000000-0000-0000-0000-000000000002');
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Save Order' }).click();
  await expect(page.getByRole('button', { name: 'Save Order' })).toBeDisabled();
  const saved = await page.evaluate(() => (window as unknown as { __savedRequest: { ids: string[]; previous: string[]; scope: string } }).__savedRequest);
  expect(saved.ids[0]).toBe(saved.previous[1]);
  expect(saved.scope).toBe('00000000-0000-0000-0000-000000000010');
  await page.reload();
  await expect(items.first()).toContainText('Birria Beef');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('admin-reorder.png'), fullPage: true });
});

test('pointer dragging stages changes and failed saves preserve them', async ({ page }) => {
  await fixture(page, 'reorder');
  const handle = page.getByRole('button', { name: 'Reorder Ember Chicken', exact: true });
  const target = page.getByRole('button', { name: 'Reorder Garden Tacos', exact: true });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  const items = page.getByRole('list', { name: /Display Order/ }).getByRole('listitem');
  await expect(items.last()).toContainText('Ember Chicken');
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map((animation) => animation.finished)); });
  await page.evaluate(() => { (window as unknown as { __failSave: boolean }).__failSave = true; });
  await page.getByRole('button', { name: 'Save Order' }).click();
  await expect(page.getByRole('alert')).toContainText('List changed');
  await expect(items.last()).toContainText('Ember Chicken');
  await expect(page.getByRole('button', { name: 'Save Order' })).toBeEnabled();
});

test('customer order cards fit and signed-in navigation includes working Sign Out', async ({ page }, testInfo) => {
  await fixture(page, 'customer');
  await expect(page.getByRole('heading', { name: 'Order #1042' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('customer-orders.png'), fullPage: true });
  await page.goto('/__dashboard_test?kind=navigation');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Your Account', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __signedOut: boolean }).__signedOut)).toBe(true);
});

test('menu editor preserves descriptions when its CDN is unavailable', async ({ page }) => {
  await fixture(page, 'menu');
  await page.route('https://cdn.jsdelivr.net/npm/tinymce@8.9.1/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Edit Ember Chicken' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Your content is preserved');
  await expect(dialog.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Fresh salsa, coriander and lime with your choice of filling.');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() => (window as unknown as { __savedRecord: [string, string, string, Record<string, unknown>] }).__savedRecord);
  expect(saved[3].description).toBe('Fresh salsa, coriander and lime with your choice of filling.');
});

test('site settings card summarizes operations and form saves all About content', async ({ page }, testInfo) => {
  await fixture(page, 'edit-settings');
  const settingsCard = page.getByRole('article');
  for (const name of ['Ordering Overview', 'Payments and Charges', 'Contact and Social', 'About Content']) await expect(settingsCard.getByRole('region', { name })).toBeVisible();
  const orderingOverview = settingsCard.getByRole('region', { name: 'Ordering Overview' });
  await expect(orderingOverview).toContainText('Closed');
  await expect(orderingOverview).toHaveCSS('border-left-color', 'rgb(241, 91, 80)');
  const payments = settingsCard.getByRole('region', { name: 'Payments and Charges' });
  await expect(payments).toContainText(/Cash\s*Enabled/);
  await expect(payments).toContainText(/Card\s*Disabled/);
  await expect(payments.getByRole('heading').locator('svg')).toHaveCSS('color', 'rgb(118, 202, 159)');
  await expect(payments.getByText('£0.00').first()).toHaveCSS('color', 'rgb(118, 202, 159)');
  await expect(settingsCard.getByRole('region', { name: 'Contact and Social' })).toContainText('0/2 contact methods and 0/2 social profiles configured');
  const aboutContent = settingsCard.getByRole('region', { name: 'About Content' });
  await expect(aboutContent).toContainText('0/3 Page Images');
  await expect(aboutContent.getByRole('heading').locator('svg')).toHaveCSS('color', 'rgb(118, 202, 159)');
  const cardEdit = settingsCard.getByRole('button', { name: 'Edit Site Settings', exact: true });
  await expect(cardEdit).toHaveCSS('height', '48px');
  await expect(cardEdit).toHaveCSS('background-color', 'rgb(240, 187, 125)');
  expect((await cardEdit.boundingBox())!.width).toBeCloseTo((await settingsCard.boundingBox())!.width - 34, 0);
  await settingsCard.screenshot({ path: testInfo.outputPath('site-settings-card.png') });
  await cardEdit.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Allowed Maintenance Emails')).toHaveCount(0);
  await dialog.getByLabel('About Eyebrow').fill('Meet Papa');
  await dialog.getByLabel('About Heading').fill('Our flavour, our story');
  await dialog.getByLabel('About Page Heading').fill('The Full Papa’s Story');
  await dialog.getByLabel('About Content').fill('Fresh ingredients and bold flavours.\n\nMade for South Wales events.');
  for (const control of [/Blocks|Paragraph/i, /Strikethrough/i, /Blockquote/i, /Insert\/edit link/i, /Clear formatting|Remove format/i]) await expect(dialog.getByRole('button', { name: control })).toBeVisible();
  const story = page.frameLocator('iframe.tox-edit-area__iframe').locator('body');
  await expect(story).toHaveText('Original full story.');
  await story.fill('A longer story for the About page.');
  await dialog.getByRole('button', { name: /Blocks|Paragraph/i }).click();
  await page.getByText('Heading 2', { exact: true }).click();
  await expect(story.locator('h2')).toHaveText('A longer story for the About page.');
  await dialog.getByLabel('About Image Description').fill('Papa serving freshly made tacos');
  await expect(dialog.getByText('About Featured Image', { exact: true })).toBeVisible();
  await expect(dialog.getByText('About Page Story Image 1', { exact: true })).toBeVisible();
  await expect(dialog.getByText('About Page Story Image 2', { exact: true })).toBeVisible();
  await expect(dialog.getByText('About Page Story Image 3', { exact: true })).toBeVisible();
  await dialog.getByLabel('About Page Story Image 1 Description').fill('Tacos being prepared for an event');
  await dialog.getByLabel('About Page Story Image 2 Description').fill('Papa’s Tacos serving at a festival');
  await dialog.getByLabel('About Page Story Image 3 Description').fill('Papa’s Tacos food truck at a market');
  const scrollRegion = dialog.locator('[data-admin-form-scroll]');
  await scrollRegion.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const lastFieldBounds = (await dialog.getByLabel('About Page Story Image 3 Description').boundingBox())!;
  const actionBounds = (await dialog.locator('[data-admin-form-actions]').boundingBox())!;
  const dialogBounds = (await dialog.boundingBox())!;
  expect(lastFieldBounds.y + lastFieldBounds.height).toBeLessThanOrEqual(actionBounds.y);
  expect(Math.abs(actionBounds.y + actionBounds.height - (dialogBounds.y + dialogBounds.height))).toBeLessThanOrEqual(2);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() => (window as unknown as { __savedRecord: [string, null, string, Record<string, unknown>] }).__savedRecord);
  expect(saved[0]).toBe('settings');
  expect(saved[1]).toBeNull();
  expect(saved[3]).not.toHaveProperty('maintenance_allowed_emails');
  expect(saved[3]).toMatchObject({ about_eyebrow: 'Meet Papa', about_heading: 'Our flavour, our story', about_page_heading: 'The Full Papa’s Story', about_content: 'Fresh ingredients and bold flavours.\n\nMade for South Wales events.', about_full_story: '<h2><strong>A longer story for the About page.</strong></h2>', about_image_path: null, about_image_alt: 'Papa serving freshly made tacos', about_page_image_1_path: null, about_page_image_1_alt: 'Tacos being prepared for an event', about_page_image_2_path: null, about_page_image_2_alt: 'Papa’s Tacos serving at a festival', about_page_image_3_path: null, about_page_image_3_alt: 'Papa’s Tacos food truck at a market' });
});