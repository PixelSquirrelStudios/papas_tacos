import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { siFacebook, siInstagram } from 'simple-icons';

let bundle: string;
test('homepage includes the supplied Instagram feed below the social heading', async ({ page }) => {
  let requests = 0;
  await page.route('https://elfsightcdn.com/platform.js', (route) => {
    requests += 1;
    return route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.goto('/');
  const social = page.getByRole('region', { name: "A LITTLE MORE PAPA'S." });
  const widget = social.locator('.elfsight-app-e2c3ec3f-f6cd-45bd-bc52-0811f7bb1787');
  await expect(widget).toHaveAttribute('data-elfsight-app-lazy', '');
  await expect.poll(() => requests).toBe(1);
  await expect(page.locator('script[src="https://elfsightcdn.com/platform.js"]')).toHaveCount(1);
  const headingBounds = (await social.getByRole('heading').boundingBox())!;
  const widgetBounds = (await widget.boundingBox())!;
  expect(widgetBounds.y).toBeGreaterThan(headingBounds.y + headingBounds.height);
});

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { EventPreview, SocialLinks } from '@/components/catalogue/public-content';
      const detail = new URLSearchParams(location.search).has('detail');
      const settings = {ordering_status: 'open', instagram_url: 'https://www.instagram.com/papas_tacos/', facebook_url: 'https://www.facebook.com/papastacos/'};
      const event = {id: 'fixture', slug: 'street-food-weekend', title: 'Friday Street Food and Live Music at the Riverside Market', venue_name: 'Riverside Market', address_line_1: '123 Market Street', address_line_2: 'By the riverside entrance', town: 'Bristol', postcode: 'BS1 1AA', map_url: null, starts_at: '2030-09-25T17:00:00Z', ends_at: '2030-09-26T21:00:00Z', pickup_enabled: true, ordering_status: 'open', orders_open_at: null, orders_close_at: null, imageUrl: '/images/tacos_hero.jpg', image_alt: 'Tacos ready for the street food market', description: 'Join us by the river for freshly made tacos, live music and an evening with the whole family. '.repeat(8)};
      if (detail) event.imageUrl = '/images/tacos.jpg';
      createRoot(document.getElementById('fixture')).render(<main className="page-width py-12"><p className="eyebrow text-primary">Out on the road</p><h1 className="page-title mb-8">{detail ? event.title : 'Find the Truck'}</h1><EventPreview event={event} settings={settings} detail={detail} />{!detail && <EventPreview event={{...event, id: 'second', slug: 'next-stop', title: 'Sunday Market', imageUrl: null, pickup_enabled: false}} settings={settings} />}<SocialLinks settings={settings} /></main>);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'public-content-fixture', setup(builder) {
      builder.onResolve({ filter: /^next\/(image|link)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
        ? `import React from 'react'; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }`
        : `import React from 'react'; export default function Image({fill, unoptimized, ...props}) { return <img {...props} style={fill ? {position:'absolute',width:'100%',height:'100%',inset:0} : undefined} />; }` }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

async function fixture(page: Page, detail = false) {
  await page.goto('/events');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.route('**/__public_fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: bundle }));
  await page.route('**/__public_test?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="fixture"></div><script src="/__public_fixture.js"></script></body></html>` }));
  await page.goto(`/__public_test?${detail ? 'detail=1' : 'listing=1'}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('article').first()).toBeVisible();
}

test('event cards group dates venue pickup and actions with real social brand icons', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fixture(page);
  const card = page.getByRole('article').first();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(card).toHaveCSS('border-top-width', '1px');
  await expect(card).toHaveCSS('border-top-left-radius', '8px');
  await expect(card.getByText('Serving Times', { exact: true })).toBeVisible();
  await expect(card.getByText('Find Us', { exact: true })).toBeVisible();
  for (const label of ['Serving Times', 'Find Us']) await expect(card.getByText(label, { exact: true })).toHaveCSS('color', 'rgb(240, 187, 125)');
  await expect(card).toContainText('18:00 - 22:00');
  await expect(card).toContainText('Until');
  await expect(card).toContainText('By the riverside entrance');
  await expect(card.getByRole('link', { name: 'Event Details' })).toHaveAttribute('href', '/events/street-food-weekend');
  const directions = card.getByRole('link', { name: 'Directions' });
  const map = new URL((await directions.getAttribute('href'))!);
  expect(map.searchParams.get('query')).toContain('Riverside Market 123 Market Street Bristol BS1 1AA');
  await expect(directions).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByLabel('Event image unavailable')).toBeVisible();
  await expect.poll(() => card.getByRole('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  for (const [name, icon] of [['Instagram', siInstagram], ['Facebook', siFacebook]] as const) {
    const link = page.getByRole('link', { name, exact: true });
    await expect(link.locator('svg').first().locator('path')).toHaveAttribute('d', icon.path);
    await expect(link).toHaveAttribute('target', '_blank');
  }
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const imageBounds = (await card.getByRole('img').boundingBox())!;
    const titleBounds = (await card.getByRole('heading').boundingBox())!;
    const dateBounds = (await card.locator('time').boundingBox())!;
    const servingBounds = (await card.getByText('Serving Times', { exact: true }).boundingBox())!;
    expect(servingBounds.x).toBe(titleBounds.x);
    expect(servingBounds.y).toBeGreaterThanOrEqual(titleBounds.y + titleBounds.height);
    expect(dateBounds.y).toBe(titleBounds.y);
    expect(dateBounds.x + dateBounds.width).toBeLessThan(titleBounds.x);
    if (width < 1024) expect(titleBounds.y).toBeGreaterThanOrEqual(imageBounds.y + imageBounds.height);
    else expect(titleBounds.x).toBeGreaterThanOrEqual(imageBounds.x + imageBounds.width);
    await page.screenshot({ path: testInfo.outputPath(`events-${width}.png`), fullPage: true });
  }
  await fixture(page, true);
  await expect(page.getByRole('link', { name: 'Browse Menu' })).toHaveAttribute('href', '/menu');
  await expect(page.getByRole('link', { name: 'Event Details' })).toHaveCount(0);
  await expect(page.getByRole('article').getByText(/^Join us by the river/)).toHaveCSS('-webkit-line-clamp', 'none');
  await expect(page.getByRole('region', { name: 'About This Stop' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Plan Your Visit' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCSS('border-top-width', '0px');
  for (const label of ['Date & Time', 'Find Us']) await expect(page.getByText(label, { exact: true })).toHaveCSS('color', 'rgb(240, 187, 125)');
  const detailImage = page.getByRole('article').getByRole('img');
  await expect(detailImage).toHaveCSS('object-fit', 'contain');
  await expect.poll(() => detailImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    const about = (await page.getByRole('region', { name: 'About This Stop' }).boundingBox())!;
    const image = (await page.getByRole('article').getByRole('img').boundingBox())!;
    if (width < 1024) expect(about.y).toBeGreaterThanOrEqual(image.y + image.height);
    else expect(about.x).toBeGreaterThanOrEqual(image.x + image.width);
    const naturalRatio = await detailImage.evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight);
    expect(image.width / image.height).toBeCloseTo(naturalRatio, 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`event-detail-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});