import { expect, test } from '@playwright/test';

const itemId = '00000000-0000-4000-8000-000000000001';
const categoryId = '00000000-0000-4000-8000-000000000010';
const salsaId = '00000000-0000-4000-8000-000000000020';
const extrasId = '00000000-0000-4000-8000-000000000030';
const mildId = '00000000-0000-4000-8000-000000000021';
const guacamoleId = '00000000-0000-4000-8000-000000000031';

function fixture() {
  return {
    events: [{ pickup_enabled: true, ordering_status: 'open', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z', orders_open_at: null, orders_close_at: null }],
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
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Your Bag' })).toHaveCount(0);
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
  await picker.getByRole('radio', { name: 'Mild salsa Included' }).check();
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
  await page.getByRole('radio', { name: 'Mild salsa Included' }).check();
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
  const control = page.locator('button[aria-label="Scroll to top"]');
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
  ]) {
    data.catalogue.items[0].allergen_note = scenario.note;
    data.catalogue.items[0].allergens = scenario.allergens;
    await page.goto('/menu');
    await page.getByRole('button', { name: 'Add Test Taco to Bag', exact: true }).click();
    const picker = page.getByRole('dialog');
    const notice = picker.getByRole('note', { name: 'Allergy notice' });
    await expect(notice).toHaveCount(1);
    await expect(notice).toHaveText(scenario.expected);
    await expect(notice).toHaveCSS('border-top-width', '1px');
    await expect(notice.locator('svg.lucide-circle-alert')).toBeVisible();
    await expect(picker.getByText('Please confirm allergen information with our team before ordering.', { exact: true })).toHaveCount(0);
    await expect(picker.getByLabel('Contains: Milk', { exact: true })).toHaveCount(scenario.allergens.length ? 1 : 0);
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
  await expect(crowd.getByText('Loved by the crowd', { exact: true })).toHaveCSS('color', 'rgb(241, 91, 80)');
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

test('editing removes a sold-out extra and recalculates the saved bag', async ({ page }) => {
  const data = fixture();
  data.catalogue.items[0].groups[1].options[0].is_available = false;
  await page.route('**/api/catalogue', (route) => route.fulfill({ json: data }));
  await page.addInitScript(({ itemId, mildId, guacamoleId }) => {
    localStorage.setItem('papas-tacos:bag:v1', JSON.stringify({ version: 1, lines: [{ itemId, optionIds: [mildId, guacamoleId], quantity: 1 }] }));
  }, { itemId, mildId, guacamoleId });
  await page.goto('/bag');
  await expect(page.getByText('One or more extras are unavailable. Please edit this item.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Test Taco' }).click();
  await expect(page.getByText('Unavailable extras have been removed. Review your choices before updating.')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Guacamole/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Update Bag' }).click();
  await expect(page.getByRole('complementary')).toContainText('£9.25');
  await expect(page.getByText('One or more extras are unavailable. Please edit this item.')).not.toBeVisible();
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
    await expect(page.getByRole('article')).toHaveCSS('background-color', 'rgb(34, 37, 34)');
    await expect(page.getByRole('article')).toHaveCSS('border-top-width', '1px');
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
    await expect(page.getByRole('list', { name: 'Selected Choices' })).toContainText('Taco 1: Ember Chicken');
    await expect(page.getByRole('list', { name: 'Selected Choices' })).toContainText('Taco 2: Midnight Beef');
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