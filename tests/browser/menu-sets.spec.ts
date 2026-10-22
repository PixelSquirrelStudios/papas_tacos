import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

async function fixture(page: Page) {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { MenuSetEditor } from '@/components/admin/menu-set-editor';
      const items = [
        {id:'00000000-0000-4000-8000-000000000001',name:'Taco',slug:'taco',category_id:'meals',price_pence:850,is_published:true,is_available:true},
        {id:'00000000-0000-4000-8000-000000000002',name:'Churros',category_id:'sweets',price_pence:400,is_published:true,is_available:true},
        {id:'00000000-0000-4000-8000-000000000003',name:'Cola',category_id:'sweets',price_pence:200,is_published:true,is_available:false},
        {id:'00000000-0000-4000-8000-000000000004',name:'Loaded Beef Nachos',slug:'loaded-beef-nachos',category_id:'meals',price_pence:850,is_published:true,is_available:true},
        {id:'00000000-0000-4000-8000-000000000005',name:'Loaded Beef Nachos',slug:'loaded-beef-nachos-drive-in',category_id:'meals',price_pence:850,is_published:true,is_available:true},
      ];
      const sections = [{id:'main',menu_set_id:'set',title:'THE MAIN EVENT',sort_order:0},{id:'sweet',menu_set_id:'set',title:'SOMETHING SWEET',sort_order:1}];
      createRoot(document.getElementById('fixture')).render(<MenuSetEditor set={{id:'set',name:'Movie Night',is_default:false,updated_at:'2030-01-01T00:00:00Z'}} sections={sections} entries={[]} items={items} categories={[{id:'meals',name:'Meals'},{id:'sweets',name:'Sweets and Drinks'}]} />);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'menu-set-fixture', setup(builder) {
      builder.onResolve({ filter: /^(next\/(navigation|link)|@\/app\/admin\/menu-sets\/actions)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
        ? 'import React from "react"; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }'
        : args.path === 'next/navigation' ? 'export const useRouter = () => ({refresh(){},replace(){}});'
          : 'export async function saveMenuSet(input) { window.__savedMenuSet = input; return window.__saveMenuResult || {ok:true,id:"set"}; }' }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  await page.goto('/sign-in');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.route('**/__menu_set.js', (route) => route.fulfill({ contentType: 'application/javascript', body: result.outputFiles[0].text }));
  await page.route('**/__menu_set', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="fixture"></div><script src="/__menu_set.js"></script></body></html>` }));
  await page.goto('/__menu_set');
  await expect(page.getByRole('heading', { name: 'Edit Menu Set' })).toBeVisible();
}

test('menu set editor builds custom sections and per-set prices with accessible alternatives to dragging', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Add Taco to section' }).click();
  await expect(page.getByRole('button', { name: 'Add Taco to section' })).toBeDisabled();
  const priceInput = page.getByLabel('Set price for Taco', { exact: true });
  expect(await priceInput.evaluate((element: HTMLInputElement) => {
    const style = getComputedStyle(element);
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = style.font;
    const textWidth = context.measureText(element.placeholder).width;
    return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24 >= textWidth;
  })).toBe(true);
  await page.getByLabel('Set price for Taco', { exact: true }).fill('12.50');
  await page.getByLabel('Target Section').selectOption('sweet');
  await page.getByRole('button', { name: 'Add Churros to section' }).click();
  await page.getByRole('button', { name: 'Add Section', exact: true }).click();
  await page.getByLabel('Section Title', { exact: true }).last().fill('SNACKS & DRINKS');
  await page.getByRole('button', { name: 'Add Cola to section' }).click();
  await page.getByRole('button', { name: 'Move section SNACKS & DRINKS up' }).click();
  await page.getByRole('button', { name: 'Save Menu Set' }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const saved = await page.evaluate(() => Reflect.get(window, '__savedMenuSet'));
  expect(saved.sections.map((section: { title: string }) => section.title)).toEqual(['THE MAIN EVENT', 'SNACKS & DRINKS', 'SOMETHING SWEET']);
  expect(saved.sections[0].items[0].pricePence).toBe(1250);
  expect(saved.sections[1].items[0].pricePence).toBeNull();
  await page.getByRole('button', { name: 'Remove Taco from set' }).click();
  await expect(page.getByRole('button', { name: 'Add Taco to section' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('same-named items can be distinguished and searched by slug in the library and set', async ({ page }) => {
  await fixture(page);
  const library = page.getByRole('complementary', { name: 'Menu Item Library' });
  await expect(library.getByText('loaded-beef-nachos', { exact: true })).toBeVisible();
  await expect(library.getByText('loaded-beef-nachos-drive-in', { exact: true })).toBeVisible();
  await page.getByLabel('Search Menu Items').fill('loaded-beef-nachos-drive-in');
  await expect(library.getByRole('button', { name: 'Add Loaded Beef Nachos to section' })).toHaveCount(1);
  await library.getByRole('button', { name: 'Add Loaded Beef Nachos to section' }).click();
  await expect(page.getByRole('region', { name: 'THE MAIN EVENT', exact: true }).getByText('loaded-beef-nachos-drive-in', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('menu set editor preserves unsaved work and explains invalid prices and save conflicts', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Add Taco to section' }).click();
  await page.getByLabel('Set price for Taco', { exact: true }).fill('12.345');
  await page.getByRole('button', { name: 'Save Menu Set' }).click();
  await expect(page.getByRole('alert')).toContainText('at most two decimal places');
  await page.getByLabel('Set price for Taco', { exact: true }).fill('12.50');
  await page.evaluate(() => Reflect.set(window, '__saveMenuResult', { ok: false, error: 'Menu set changed; refresh before saving' }));
  await page.getByRole('button', { name: 'Save Menu Set' }).click();
  await expect(page.getByRole('alert')).toContainText('Menu set changed');
  await expect(page.getByLabel('Set price for Taco', { exact: true })).toHaveValue('12.50');
});

test('menu set editor drags library items into sections and between sections', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixture(page);
  async function drag(source: ReturnType<Page['getByRole']>, destination: ReturnType<Page['getByRole']>) {
    const sourceCard = source.locator('..');
    const cardBounds = (await sourceCard.boundingBox())!;
    const start = (await source.boundingBox())!;
    const end = (await destination.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2, { steps: 5 });
    const preview = page.locator('[data-drag-preview]');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('taco');
    expect(Math.abs((await preview.boundingBox())!.width - cardBounds.width)).toBeLessThan(2);
    if (await source.getAttribute('aria-label') === 'Reorder Taco') {
      await expect(preview.locator('input')).toHaveValue('12.50');
      await expect(preview).toContainText('Catalogue price');
    } else {
      await expect(preview).toContainText('£8.50');
    }
    await page.mouse.move(end.x + end.width / 2, end.y + end.height - 20, { steps: 20 });
    await expect(destination).toHaveAttribute('data-drop-target', 'true');
    await expect(destination.locator('[data-drop-marker]')).toHaveCount(1);
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
  }
  await drag(page.getByRole('button', { name: 'Drag Taco', exact: true }), page.getByRole('region', { name: 'THE MAIN EVENT', exact: true }));
  await expect(page.getByRole('region', { name: 'THE MAIN EVENT', exact: true }).getByLabel('Set price for Taco', { exact: true })).toBeVisible();
  await page.getByLabel('Set price for Taco', { exact: true }).fill('12.50');
  await drag(page.getByRole('button', { name: 'Reorder Taco', exact: true }), page.getByRole('region', { name: 'SOMETHING SWEET', exact: true }));
  await expect(page.getByRole('region', { name: 'SOMETHING SWEET', exact: true }).getByLabel('Set price for Taco', { exact: true })).toBeVisible();
});

test('full-card dragging shows insertion positions and cancels without changing the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await fixture(page);
  await page.getByRole('button', { name: 'Add Taco to section', exact: true }).click();
  await page.getByRole('button', { name: 'Add Churros to section', exact: true }).click();
  const main = page.getByRole('region', { name: 'THE MAIN EVENT', exact: true });
  const handle = page.getByRole('button', { name: 'Reorder Churros', exact: true });
  const start = (await handle.boundingBox())!;
  const first = (await main.locator('li').first().boundingBox())!;
  await page.mouse.move(start.x + 20, start.y + 20);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2, first.y + 8, { steps: 20 });
  await expect(page.locator('[data-drag-preview]')).toContainText('Churros');
  await expect(main.locator('[data-drop-marker]')).toHaveCount(1);
  await page.mouse.up();
  await expect(main.locator('li').first()).toContainText('Churros');
  await expect(page.locator('[data-drag-preview]')).toHaveCount(0);
  const tacoHandle = page.getByRole('button', { name: 'Reorder Taco', exact: true });
  const taco = (await tacoHandle.boundingBox())!;
  await page.mouse.move(taco.x + 20, taco.y + 20);
  await page.mouse.down();
  await page.mouse.move(taco.x + 40, taco.y - 40, { steps: 10 });
  await expect(page.locator('[data-drag-preview]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-drag-preview]')).toHaveCount(0);
  await expect(page.locator('[data-drop-marker]')).toHaveCount(0);
  await expect(main.locator('li').first()).toContainText('Churros');
});
