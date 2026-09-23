import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { siFacebook, siInstagram } from 'simple-icons';

let bundle: string;
test('homepage About event callouts and Contact appear in order and link to the About page', async ({ page }, testInfo) => {
  await page.route('https://elfsightcdn.com/platform.js', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  const about = page.locator('section[aria-labelledby="about-title"]').first();
  await expect(about.locator('#about-title')).toBeVisible();
  await expect(about.locator('[data-about-copy]')).toBeVisible();
  await expect.poll(() => about.getByRole('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.locator('.hero').evaluate((element) => element.nextElementSibling?.classList.contains('festival-band'))).toBe(true);
  expect(await page.locator('.festival-band').evaluate((element) => element.nextElementSibling?.getAttribute('aria-labelledby'))).toBe('about-title');
  for (const name of ['Corporate Events', 'Parties', 'Weddings']) await expect(page.locator('#our-spirit').getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Enquire About Your Event' }).click();
  await expect(page).toHaveURL(/#contact$/);
  const enquiryForm = page.getByRole('form', { name: 'Event booking enquiry' });
  await expect(enquiryForm).toBeVisible();
  expect((await page.getByRole('button', { name: 'Send Enquiry', exact: true }).boundingBox())!.width).toBeCloseTo((await enquiryForm.boundingBox())!.width, 1);
  const events = (await page.getByRole('heading', { name: 'THE NEXT STOP.' }).boundingBox())!;
  const contact = (await page.locator('#contact').boundingBox())!;
  const social = (await page.getByRole('region', { name: "A LITTLE MORE PAPA'S." }).boundingBox())!;
  expect(contact.y).toBeGreaterThan(events.y);
  expect(social.y).toBeGreaterThanOrEqual(contact.y + contact.height);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await about.screenshot({ path: testInfo.outputPath(`about-${width}.png`) });
    await page.locator('#our-spirit').screenshot({ path: testInfo.outputPath(`callouts-${width}.png`) });
    await page.locator('#contact').screenshot({ path: testInfo.outputPath(`contact-${width}.png`) });
  }
  await about.getByRole('link', { name: "More About Papa's" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main .eyebrow')).toHaveCount(0);
  await expect(page.locator('main [data-about-copy]')).toBeVisible();
  await expect(page.getByRole('link', { name: "Book Papa's", exact: true })).toHaveAttribute('href', '/#contact');
});

test('main and footer Contact links open the standalone enquiry page', async ({ page }) => {
  await page.route('https://elfsightcdn.com/platform.js', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  const footerContact = page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Contact', exact: true });
  await expect(footerContact).toHaveAttribute('href', '/contact');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const menuContact = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Contact', exact: true });
  await expect(menuContact).toHaveAttribute('href', '/contact');
  await menuContact.click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole('heading', { level: 1, name: 'GOOD FOOD. GREAT OCCASIONS.' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Event booking enquiry' })).toBeVisible();
});

test('booking enquiry preserves failed input and retry identity then reports success', async ({ page }) => {
  const submitted: Record<string, string>[] = [];
  await page.route('https://elfsightcdn.com/platform.js', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/api/contact', async (route) => {
    submitted.push(route.request().postDataJSON());
    return route.fulfill(submitted.length === 1 ? { status: 502, json: { error: 'Your enquiry could not be sent. Please try again shortly.' } } : { json: { ok: true } });
  });
  await page.goto('/#contact');
  const form = page.getByRole('form', { name: 'Event booking enquiry' });
  const eventType = form.getByRole('combobox', { name: 'Event Type' });
  await expect(eventType).toHaveCSS('height', '48px');
  expect((await eventType.boundingBox())?.height).toBe((await form.getByLabel('Phone Number').boundingBox())?.height);
  await form.getByLabel('Your Name').fill('Alex Guest');
  await form.getByLabel('Email Address').fill('alex@example.com');
  await form.getByLabel('Phone Number').fill('+44 7700 900123');
  await form.getByRole('combobox', { name: 'Event Type' }).click();
  const wedding = page.getByRole('option', { name: 'Wedding', exact: true });
  await expect(wedding).toHaveCSS('cursor', 'pointer');
  await wedding.hover();
  await expect(wedding).toHaveCSS('background-color', 'rgb(201, 145, 80)');
  await wedding.click();
  await expect(form.getByRole('combobox', { name: 'Event Type' })).toContainText('Wedding');
  const eventDate = form.getByLabel('Event Date');
  await expect(eventDate).toHaveCSS('height', '48px');
  await eventDate.click();
  const calendar = page.getByRole('grid');
  await expect(calendar).toBeVisible();
  const previousMonth = page.getByRole('button', { name: /previous month/i });
  const nextMonth = page.getByRole('button', { name: /next month/i });
  const monthLabel = page.getByText(new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date()), { exact: true });
  const [previousBounds, nextBounds, labelBounds] = await Promise.all([previousMonth.boundingBox(), nextMonth.boundingBox(), monthLabel.boundingBox()]);
  expect(previousBounds!.y + previousBounds!.height / 2).toBeCloseTo(labelBounds!.y + labelBounds!.height / 2, 0);
  expect(nextBounds!.y + nextBounds!.height / 2).toBeCloseTo(labelBounds!.y + labelBounds!.height / 2, 0);
  const supportsHover = await page.evaluate(() => matchMedia('(hover: hover)').matches);
  if (supportsHover) {
    await previousMonth.hover();
    await expect(previousMonth).toHaveCSS('background-color', 'rgb(44, 48, 42)');
  }
  await expect(page.getByRole('button', { name: /today/i })).toHaveCSS('border-color', 'rgb(240, 187, 125)');
  const target = new Date();
  target.setDate(target.getDate() + 1);
  const targetMonth = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(target);
  const targetDay = page.getByRole('button', { name: new RegExp(`${targetMonth} ${target.getDate()}(?:st|nd|rd|th)?, ${target.getFullYear()}`, 'i') });
  if (supportsHover) {
    await targetDay.hover();
    await expect(targetDay).toHaveCSS('background-color', 'rgb(240, 187, 125)');
  }
  await targetDay.click();
  await form.getByLabel('Number of Guests').fill('80');
  await form.getByLabel('Venue or Area').fill('Cardiff');
  await form.getByLabel('Tell Us About Your Event').fill('Evening tacos for our wedding reception, please.');
  await form.getByRole('button', { name: 'Send Enquiry', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('could not be sent');
  await expect(form.getByLabel('Your Name')).toHaveValue('Alex Guest');
  await form.getByRole('button', { name: 'Send Enquiry', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Your enquiry has been sent');
  await expect(form.getByLabel('Your Name')).toHaveValue('');
  expect(submitted).toHaveLength(2);
  expect(submitted[0].requestId).toBe(submitted[1].requestId);
  expect(submitted[0]).toMatchObject({ name: 'Alex Guest', email: 'alex@example.com', eventType: 'Wedding', eventDate: `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`, guests: '80', location: 'Cardiff', website: '' });
});

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
      import { AboutContent } from '@/components/catalogue/about-content';
      const params = new URLSearchParams(location.search);
      const detail = params.has('detail');
      const about = params.has('about');
      const settings = {ordering_status: 'open', instagram_url: 'https://www.instagram.com/papas_tacos/', facebook_url: 'https://www.facebook.com/papastacos/'};
      const aboutSettings = {about_page_heading: 'Our Full Story', about_full_story: '<p>Our rich story.</p>', about_image_path: '/images/tacos.jpg', about_image_alt: 'Homepage featured image', about_page_image_1_path: '/images/tacos.jpg', about_page_image_1_alt: 'Story image one', about_page_image_2_path: '/images/tacos_hero.jpg', about_page_image_2_alt: 'Story image two', about_page_image_3_path: '/images/tacos.jpg', about_page_image_3_alt: 'Story image three'};
      const event = {id: 'fixture', slug: 'street-food-weekend', title: 'Friday Street Food and Live Music at the Riverside Market', venue_name: 'Riverside Market', address_line_1: '123 Market Street', address_line_2: 'By the riverside entrance', town: 'Bristol', postcode: 'BS1 1AA', map_url: null, starts_at: '2030-09-25T17:00:00Z', ends_at: '2030-09-26T21:00:00Z', pickup_enabled: true, ordering_status: 'open', orders_open_at: null, orders_close_at: null, imageUrl: '/images/tacos_hero.jpg', image_alt: 'Tacos ready for the street food market', description: 'Join us by the river for freshly made tacos, live music and an evening with the whole family. '.repeat(8)};
      if (detail) event.imageUrl = '/images/tacos.jpg';
      createRoot(document.getElementById('fixture')).render(about ? <main><AboutContent settings={aboutSettings} fullPage /></main> : <main className="page-width py-12"><p className="eyebrow text-primary">Out on the road</p><h1 className="page-title mb-8">{detail ? event.title : 'Find the Truck'}</h1><EventPreview event={event} settings={settings} detail={detail} />{!detail && <EventPreview event={{...event, id: 'second', slug: 'next-stop', title: 'Sunday Market', imageUrl: null, pickup_enabled: false}} settings={settings} />}<SocialLinks settings={settings} /></main>);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'public-content-fixture', setup(builder) {
      builder.onResolve({ filter: /^(next\/(image|link)|@\/lib\/catalogue\/data)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
        ? `import React from 'react'; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }`
        : args.path === 'next/image' ? `import React from 'react'; export default function Image({fill, unoptimized, ...props}) { return <img {...props} style={fill ? {position:'absolute',width:'100%',height:'100%',inset:0} : undefined} />; }`
        : `export function publicImage(path) { return path; }` }));
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

async function aboutFixture(page: Page) {
  await page.goto('/about');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.route('**/__public_fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: bundle }));
  await page.route('**/__public_test?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="fixture"></div><script src="/__public_fixture.js"></script></body></html>` }));
  await page.goto('/__public_test?about=1');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { level: 1, name: 'Our Full Story' })).toBeVisible();
}

test('About page replaces the homepage feature with up to three stacked story images', async ({ page }) => {
  await aboutFixture(page);
  const media = page.locator('[data-about-media]');
  const copy = page.locator('[data-about-copy]');
  await expect(media.getByRole('img')).toHaveCount(3);
  await expect(page.getByRole('img', { name: 'Homepage featured image' })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 960 });
  const images = await media.getByRole('img').evaluateAll((entries) => entries.map((entry) => { const bounds = entry.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; }));
  expect(images[1].y).toBeGreaterThanOrEqual(images[0].y + images[0].height);
  expect(images[2].y).toBeGreaterThanOrEqual(images[1].y + images[1].height);
  expect(images[0].width).toBeCloseTo(images[1].width, 0);
  expect((await media.boundingBox())!.x).toBeLessThan((await copy.boundingBox())!.x);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await media.boundingBox())!.y).toBeLessThan((await copy.boundingBox())!.y);
});

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