import { expect, test } from '@playwright/test';

test('home renders its image without horizontal overflow', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText("PAPA'S");
  await expect(page.getByAltText('Tacos topped with fresh salsa, coriander and lime')).toBeVisible();
  await expect.poll(() => page.locator('main img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.hero-copy').evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)); });
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('navigation drawer closes on a link and returns focus on Escape', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('dialog').getByRole('link', { name: 'Create an Account' }).click();
  await expect(page).toHaveURL(/\/login\?mode=signup$/);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByLabel('Your Name')).toBeVisible();
});

test('hero and banner fill the viewport below the header and grow safely on short screens', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('.hero-copy').evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)); });
    const header = await page.getByRole('banner').boundingBox();
    const hero = await page.locator('.hero').boundingBox();
    const banner = await page.locator('.festival-band').boundingBox();
    const copy = await page.locator('.hero-copy').boundingBox();
    expect(header).not.toBeNull();
    expect(hero).not.toBeNull();
    expect(banner).not.toBeNull();
    expect(copy).not.toBeNull();
    expect(hero!.y).toBeCloseTo(header!.height, 0);
    expect(hero!.height + banner!.height).toBeGreaterThanOrEqual(viewport.height - header!.height - 1);
    expect(banner!.y).toBeCloseTo(hero!.y + hero!.height, 0);
    if (viewport.height >= 844) expect(banner!.y + banner!.height).toBeCloseTo(viewport.height, 0);
    expect(copy!.y).toBeGreaterThanOrEqual(hero!.y);
    expect(copy!.y + copy!.height).toBeLessThanOrEqual(hero!.y + hero!.height);
    expect(copy!.y + copy!.height / 2).toBeCloseTo(hero!.y + hero!.height / 2, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`hero-${viewport.width}x${viewport.height}.png`) });
  }
});

test('auth tabs preserve checkout return path and validate before sending', async ({ page }, testInfo) => {
  await page.goto('/login?next=%2Fcheckout%3Fevent%3D123');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await page.getByRole('tab', { name: 'Create an Account' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Create an Account' })).toBeVisible();
  await expect(page.getByLabel('Your Name')).toBeVisible();
  await expect(page.locator('input[name="next"]').first()).toHaveValue('/checkout?event=123');
  await page.getByLabel('Your Name').fill('Test Customer');
  await page.getByLabel('Email Address').fill('not-an-email');
  await page.getByRole('button', { name: 'Email Me a Sign-In Link' }).click();
  expect(await page.getByLabel('Email Address').evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('signup.png'), fullPage: true });
});

test('header actions fit and both auth tabs stay inside their holder', async ({ page }, testInfo) => {
  for (const width of [1440, 768, 640, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    for (const name of ['Create an Account', 'Sign In']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
      const contained = await page.getByRole('tablist').evaluate((list) => {
        const bounds = list.getBoundingClientRect();
        return [...list.querySelectorAll('[role=tab]')].every((tab) => {
          const rect = tab.getBoundingClientRect();
          return rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.left >= bounds.left && rect.right <= bounds.right;
        });
      });
      expect(contained).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await expect(page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'The Menu', exact: true })).toBeVisible();
    for (const control of [page.getByRole('link', { name: /Your bag,/ }), page.getByRole('button', { name: 'Open navigation' })]) {
      expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.getByRole('banner').evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(0);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`login-${width}.png`), fullPage: true });
  }
});

test('anonymous account and admin visits redirect to sign-in', async ({ page }) => {
  for (const path of ['/account', '/admin']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    await expect(page.getByRole('heading', { name: 'HOLA, HUNGRY?' })).toBeVisible();
  }
});

test('failed callbacks recover locally, with no token or external return URL', async ({ page, request }) => {
  const response = await request.get('/auth/callback?error=access_denied&next=https%3A%2F%2Fexample.com', { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers()['location']).toMatch(/\/login\?error=invalid_link&next=%2Faccount$/);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  await page.goto('/auth/confirm');
  await expect(page.getByRole('alert')).toContainText('expired');
  await expect(page).toHaveURL(/\/login\?error=invalid_link&next=%2Faccount$/);
  await page.goto('/login?next=/admin&next=/account');
  await expect(page.locator('input[name="next"]').first()).toHaveValue('/account');
});

test('small mobile viewport keeps the hero and form usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: 'Explore the Menu', exact: true })).toBeVisible();
  await page.goto('/login?mode=signup');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Email Me a Sign-In Link' })).toBeVisible();
});