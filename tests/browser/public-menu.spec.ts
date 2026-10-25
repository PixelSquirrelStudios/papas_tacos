import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

test('public menu visibility updates live in both directions while event menus stay available', async ({ page }) => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import MenuPage from '@/app/(public)/menu/page';
      import { SiteUpdates } from '@/components/site-updates';
      window.__menuEnabled = true;
      window.__menuRenders = 0;
      const root = createRoot(document.getElementById('fixture'));
      window.__refreshMenu = async () => {
        const menu = await MenuPage({searchParams: Promise.resolve({event: new URLSearchParams(location.search).get('event') || undefined})});
        root.render(<><SiteUpdates />{menu}</>);
        window.__menuRenders++;
      };
      window.__refreshMenu();
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'public-menu-live-fixture', setup(builder) {
      const modules: Record<string, string> = {
        'next/navigation': `export const usePathname = () => location.pathname;
          export const useRouter = () => ({refresh() { window.__refreshMenu(); }});`,
        'next/link': 'export default function Link({children,...props}) { return <a {...props}>{children}</a>; }',
        '@/lib/supabase/config': 'export const supabaseConfig = () => ({url:location.origin,key:"fixture"});',
        '@/lib/supabase/client': `export const createBrowserSupabase = () => ({channel() {
          const channel = {on(event, filter, callback) {
            if (filter.table === 'business_settings') window.__settingsChange = callback;
            return channel;
          }, subscribe() { return channel; }};
          return channel;
        }, removeChannel() {}});`,
        '@/lib/catalogue/data': `export async function getSettings() { return {public_menu_enabled:window.__menuEnabled}; }
          export async function getCatalogue() { return {available:true,categories:[],items:[]}; }
          export async function getEvents() { return {available:true,events:[{id:'market',menu_set_id:null}]}; }`,
        '@/components/catalogue/menu-browser': 'export function MenuBrowser() { return <p>Menu products</p>; }',
        '@/components/bag/bag-provider': 'export function MenuOrderingProvider({children}) { return children; }',
      };
      builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(modules, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: modules[args.path], loader: 'tsx', resolveDir: process.cwd() }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  await page.route('**/__public_menu_fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: result.outputFiles[0].text }));
  await page.route(/\/menu(?:\?.*)?$/, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="fixture"></div><script src="/__public_menu_fixture.js"></script></body></html>',
  }));
  await page.goto('/menu');
  await expect(page.getByText('Menu products', { exact: true })).toBeVisible();
  const documentRequests: string[] = [];
  page.on('request', (request) => { if (request.isNavigationRequest()) documentRequests.push(request.url()); });
  const setVisibility = async (enabled: boolean) => {
    await page.evaluate((value) => {
      Reflect.set(window, '__menuEnabled', value);
      Reflect.get(window, '__settingsChange')();
    }, enabled);
  };
  await setVisibility(false);
  await expect(page.getByRole('heading', { name: 'Public Menu Unavailable' })).toBeVisible();
  await expect(page.getByText('Menu products', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Our public menu is not currently displayed.', { exact: false })).toBeVisible();
  await setVisibility(true);
  await expect(page.getByText('Menu products', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Public Menu Unavailable' })).toHaveCount(0);
  expect(documentRequests).toEqual([]);

  await page.goto('/menu?event=market');
  await expect(page.getByText('Menu products', { exact: true })).toBeVisible();
  const renders = await page.evaluate(() => Reflect.get(window, '__menuRenders'));
  await setVisibility(false);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__menuRenders'))).toBeGreaterThan(renders);
  await expect(page.getByText('Menu products', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Public Menu Unavailable' })).toHaveCount(0);
});
