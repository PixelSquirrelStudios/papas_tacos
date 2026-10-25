import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

test('scroll to top clears fragments without losing query parameters or history state', async ({ page }) => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'tsx',
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { ScrollToTop } from './src/components/scroll-to-top';
        createRoot(document.getElementById('fixture')).render(<ScrollToTop />);`,
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    plugins: [{ name: 'aliases', setup(builder) {
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
    } }],
  });
  await page.route('**/__scroll_fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: bundle.outputFiles[0].text }));
  await page.route('**/__scroll_fixture?*', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<html><head><style>body{height:400vh}button{position:fixed;bottom:20px;right:20px}</style></head><body><div id="fixture"></div><script src="/__scroll_fixture.js"></script></body></html>',
  }));
  await page.goto('/__scroll_fixture?event=market#contact');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    history.replaceState({ preserved: 'test' }, '');
    window.scrollTo(0, innerHeight + 100);
  });
  const button = page.getByRole('button', { name: 'Scroll to Top' });
  await expect(button).toBeVisible();
  const historyLength = await page.evaluate(() => history.length);
  await button.click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page).toHaveURL(/\/__scroll_fixture\?event=market$/);
  expect(await page.evaluate(() => history.state)).toEqual({ preserved: 'test' });
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});
