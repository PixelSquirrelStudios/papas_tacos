import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { build } from 'esbuild';

test('public menu visibility covers homepage, header, navigation, footer and direct access without hiding event menus', async () => {
  const state = { enabled: true, catalogueReads: 0 };
  globalThis.__publicMenuTest = state;
  try {
    const bundle = await build({
      stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
        import { renderToStaticMarkup } from 'react-dom/server';
        import Home from '@/app/(public)/page';
        import Menu from '@/app/(public)/menu/page';
        import { SiteHeader } from '@/components/site-header';
        import { SiteFooter } from '@/components/site-footer';
        import { SiteMenu } from '@/components/site-menu';
        export async function home() { return renderToStaticMarkup(await Home()); }
        export async function menu(event) { return renderToStaticMarkup(await Menu({searchParams:Promise.resolve({event})})); }
        export async function header() { return renderToStaticMarkup(await SiteHeader()); }
        export async function footer() { return renderToStaticMarkup(await SiteFooter()); }
        export function navigation(enabled) { return renderToStaticMarkup(<SiteMenu signedIn={false} admin={false} publicMenuEnabled={enabled} />); }
      ` },
      bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
      banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` },
      plugins: [{ name: 'public-menu-boundaries', setup(builder) {
        const modules = {
          'next/link': 'export default function Link({children,...props}) { return <a {...props}>{children}</a>; }',
          'next/image': 'export default function Image({fill,priority,unoptimized,...props}) { return <img {...props} />; }',
          'next/script': 'export default function Script() { return null; }',
          '@/lib/auth/session': 'export async function getViewer() { return null; }',
          '@/components/brand': 'export function Brand() { return <span>Brand</span>; }',
          '@/components/bag/bag-button': 'export function BagButton() { return null; }',
          '@/components/bag/header-menu-button': 'export function HeaderMenuButton() { return <a href="/menu">Header Menu</a>; }',
          '@/components/bag/bag-provider': 'export function MenuOrderingProvider({children}) { return children; } export function useOrderingOpen() { return false; }',
          '@/components/catalogue/menu-browser': 'export function MenuBrowser() { return <div data-menu-browser>Menu Products</div>; }',
          '@/components/catalogue/public-content': 'export function EventPreview() { return null; } export function ReviewList() { return null; } export function SocialLinks() { return null; }',
          '@/components/catalogue/about-content': 'export function AboutContent() { return <div>About Content</div>; }',
          '@/components/catalogue/contact-form': 'export function ContactForm() { return null; }',
          '@/app/auth/actions': 'export function signOut() {}',
          '@/components/auth/submit-button': 'export function SignOutButton() { return null; }',
          '@/components/ui/sheet': `export function Sheet({children}) { return <div>{children}</div>; }
            export const SheetClose = Sheet, SheetContent = Sheet, SheetDescription = Sheet, SheetHeader = Sheet, SheetTitle = Sheet, SheetTrigger = Sheet;`,
          '@/lib/catalogue/data': `export async function getSettings() { return {public_menu_enabled:globalThis.__publicMenuTest.enabled}; }
            export async function getCatalogue() { globalThis.__publicMenuTest.catalogueReads++; return {available:true,categories:[],items:[]}; }
            export async function getEvents() { return {available:true,events:[{id:'event-id',menu_set_id:null}]}; }
            export async function getTestimonials() { return {available:true,reviews:[]}; }`,
        };
        builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(modules, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: modules[args.path], loader: 'tsx', resolveDir: process.cwd() }));
        builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
      } }],
    });
    const ui = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    assert.match(await ui.home(), /papas-choice-title/);
    assert.match(await ui.home(), /crowd-favourites-title/);
    assert.match(await ui.header(), /href="\/menu"/);
    assert.match(await ui.footer(), /href="\/menu"/);
    assert.match(ui.navigation(true), /href="\/menu"/);
    assert.match(await ui.menu(), /data-menu-browser/);
    state.enabled = false;
    state.catalogueReads = 0;
    const home = await ui.home();
    assert.doesNotMatch(home, /papas-choice-title|crowd-favourites-title|href="\/menu"|data-menu-browser/);
    assert.match(home, /About Content/);
    assert.equal(state.catalogueReads, 0);
    for (const html of [await ui.header(), await ui.footer(), ui.navigation(false)]) {
      assert.doesNotMatch(html, /href="\/menu"/);
      assert.match(html, /href="\/events"/);
    }
    assert.match(await ui.menu(), /Public Menu Unavailable/);
    assert.equal(state.catalogueReads, 0);
    assert.match(await ui.menu('event-id'), /data-menu-browser/);
    assert.equal(state.catalogueReads, 1);
  } finally { delete globalThis.__publicMenuTest; }
});
