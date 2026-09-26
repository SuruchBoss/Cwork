// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Renders card.html at exactly 1280x640 — the size GitHub asks for under
 * Settings → Social preview — in English for GitHub and the English landing
 * page, and in Thai for the Thai landing page's og:image.
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
import { copyFileSync, statSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const landing = join(here, '..', '..', 'landing', 'assets');

/**
 * Each card, and where it goes. The English card is GitHub's social preview
 * and the English landing page's og:image; the Thai card is the Thai page's.
 * Only landing/ is published, which is why the landing copies are files of
 * their own rather than links into docs/.
 */
const CARDS = [
  { hash: '', out: join(here, 'social-preview.png'), copies: [join(landing, 'og.en.png')] },
  { hash: '#th', out: join(landing, 'og.th.png'), copies: [] },
];

const browser = await chromium.launch({
  // Set by the container image; Playwright finds it on a normal machine.
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

/**
 * Google Fonts fetched through Node, which honours the proxy and CA settings
 * the bundled browser does not (see serveWebfonts in docs/demo/record.mjs).
 */
async function serveWebfonts(page) {
  const UA =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    try {
      const res = await fetch(route.request().url(), { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await route.fulfill({
        status: 200,
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        body: Buffer.from(await res.arrayBuffer()),
      });
    } catch {
      await route.continue();
    }
  });
}

for (const card of CARDS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await serveWebfonts(page);
  await page.goto(pathToFileURL(join(here, 'card.html')).href + card.hash);

  // Webfonts, then the screenshot. Both silently degrade the card if missed.
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
  );
  if (!faces.includes('Anuphan')) {
    console.error(`The headline face never loaded (got: ${faces.join(', ') || 'none'}).`);
    await browser.close();
    process.exit(1);
  }
  const shotLoaded = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const img = document.querySelector('.shot img');
        const done = () => resolve(img.naturalWidth > 0);
        if (img.complete && img.src) done();
        else {
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }
      }),
  );
  // `complete` is true for a failed load too, so without this the card renders
  // with a hole where the product is and nothing says so.
  if (!shotLoaded) {
    console.error('The dashboard screenshot did not load — run docs/screenshots/capture.mjs.');
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(400);

  await page.screenshot({ path: card.out, clip: { x: 0, y: 0, width: 1280, height: 640 } });
  await page.close();
  for (const copy of card.copies) copyFileSync(card.out, copy);

  const kb = Math.round(statSync(card.out).size / 1024);
  console.log(`${card.out.split('/').slice(-2).join('/')} — 1280x640, ${kb} KB`);
  if (kb > 1024) {
    console.error('Over GitHub’s 1MB limit for a social preview.');
    process.exit(1);
  }
}
await browser.close();
