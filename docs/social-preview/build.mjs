// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Renders card.html to social-preview.png at exactly 1280x640 — the size GitHub
 * asks for under Settings → Social preview, and the size it then serves as
 * `og:image` to anything that unfurls the repository link.
 *
 *   npm i playwright && npx playwright install chromium
 *   node docs/social-preview/build.mjs
 *
 * Playwright is not a dependency of the project, the same way it is not one for
 * docs/demo/record.mjs — this is a tool for whoever refreshes the asset. The
 * PNG is uploaded by hand; GitHub has no API for the social preview.
 *
 * Rendered at 1x rather than 2x on purpose. GitHub caps the upload at 1MB and
 * the card is mostly flat colour with one screenshot in it, so a 2x render buys
 * sharpness nobody sees in a feed and costs the whole budget.
 */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { statSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'social-preview.png');

const browser = await chromium.launch({
  // Set by the container image; Playwright finds it on a normal machine.
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });

await page.goto(pathToFileURL(join(here, 'card.html')).href);
// Webfonts, then the screenshot. Both silently degrade the card if missed.
await page.evaluate(() => document.fonts.ready);
const shotLoaded = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const img = document.querySelector('.shot img');
      const done = () => resolve(img.naturalWidth > 0);
      if (img.complete) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    }),
);
// `complete` is true for a failed load too, so without this the card renders
// with a hole where the product is and nothing says so.
if (!shotLoaded) {
  console.error('The dashboard screenshot did not load — check the src in card.html.');
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(400);

await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1280, height: 640 } });
await browser.close();

const kb = Math.round(statSync(out).size / 1024);
console.log(`social-preview.png — 1280x640, ${kb} KB`);
if (kb > 1024) {
  console.error('Over GitHub’s 1MB limit for a social preview.');
  process.exit(1);
}
