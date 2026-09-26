// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Takes every console screenshot in the READMEs and on the landing page.
 *
 * Same idea as docs/demo/record.mjs, for stills: it drives the real console,
 * signed in as a seeded account with a real second factor, against the company
 * `npm run db:seed` builds. A screenshot therefore cannot show a screen the
 * product does not have — if a page breaks, this run breaks with it.
 *
 * Needs a running stack and Playwright; neither is a project dependency.
 *
 *   cd backend && SEED_PASSWORD=… npm run db:seed && npm run start:dev
 *   cd web && npm run dev
 *   SEED_PASSWORD=… node docs/screenshots/capture.mjs
 *
 * What it writes, and where each output belongs:
 *
 *   docs/screenshots/NN-name.png          Thai, 1280×800 at 1×   both READMEs
 *   landing/assets/shots/name.th.webp     Thai, 1280×800 at 2×   landing/
 *   landing/assets/shots/name.en.webp     English, same          landing/en/
 *
 * The landing page gets a take per language because the interface has one
 * (CW-016): an English visitor should see the English console, not be told in
 * a caption that it exists. The WebP conversion needs ffmpeg with libwebp.
 * The share cards are built from these takes afterwards, by
 * docs/social-preview/build.mjs.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { totp } from '../demo/totp.mjs';

const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword) {
  console.error('Set SEED_PASSWORD to the password `npm run db:seed` was given.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SECRET = 'CWORKDEMOMFASECRET234567';
const ACCOUNT = 'ceo@cwork.example';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const LANDING = join(repo, 'landing', 'assets', 'shots');
const scratch = join(tmpdir(), 'cwork-capture');

/**
 * Every console screen, by route. `docs` is the README file name (null when the
 * READMEs do not show it); `landing` marks the ones the landing page tells its
 * stories with.
 */
const SCREENS = [
  { key: 'dashboard', route: '/', docs: '03-dashboard', landing: true },
  { key: 'approvals', route: '/approvals', docs: '09-approvals', landing: true },
  { key: 'employees', route: '/employees', docs: '04-employees', landing: true },
  { key: 'employee', route: 'first:/employees/', docs: '18-employee-detail', landing: true },
  { key: 'leave', route: '/leave', docs: '05-leave', landing: true },
  { key: 'attendance', route: '/attendance', docs: '06-attendance', landing: true },
  { key: 'roster', route: '/roster', docs: '22-roster', landing: true },
  { key: 'payroll', route: '/payroll', docs: '07-payroll' },
  { key: 'payroll-run', route: 'first:/payroll/runs/', docs: '19-payroll-run', landing: true },
  { key: 'expenses', route: '/expenses', docs: '08-expenses' },
  { key: 'benefits', route: '/benefits', docs: '23-benefits' },
  { key: 'recruitment', route: '/recruitment', docs: '11-recruitment', landing: true },
  { key: 'performance', route: '/performance', docs: '10-performance', landing: true },
  { key: 'documents', route: '/documents', docs: '13-documents' },
  { key: 'offboarding', route: '/offboarding', docs: '12-offboarding' },
  { key: 'knowledge', route: '/knowledge', docs: '14-knowledge' },
  { key: 'organization', route: '/organization', docs: '16-organization' },
  { key: 'audit', route: '/audit', docs: '17-audit', landing: true },
];

rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
mkdirSync(LANDING, { recursive: true });

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

/** The console's persisted UI preferences, set before the app first reads them. */
function uiState(language, theme = 'light') {
  return JSON.stringify({ state: { theme, language, languageExplicit: true }, version: 0 });
}

/**
 * Fetches Google Fonts through Node, which honours the proxy and CA settings
 * the bundled browser does not. Without it the console silently falls back to
 * whatever Thai face the machine has — see serveWebfonts in record.mjs.
 */
async function serveWebfonts(context) {
  const UA =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
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

async function settle(page) {
  await page.waitForSelector('.page', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  // Park the pointer on the empty right of the top bar: left where the last
  // click was, it hovers a table row and the shot shows it highlighted.
  await page.mouse.move(page.viewportSize().width - 8, 20);
  await page.evaluate(() => document.fonts.ready);
  const families = await page.evaluate(() => [...document.fonts].map((f) => f.family).join(','));
  if (!families.includes('IBM Plex Sans Thai')) {
    throw new Error('IBM Plex Sans Thai never loaded — refusing to capture a fallback face');
  }
  await page.waitForTimeout(500);
}

/** Resolves `first:/prefix/` to the first link in the current list that starts with it. */
async function open(page, route) {
  if (!route.startsWith('first:')) {
    await page.goto(BASE + route);
    return;
  }
  const prefix = route.slice('first:'.length);
  const list = prefix.startsWith('/payroll') ? '/payroll' : prefix.replace(/\/$/, '');
  await page.goto(BASE + list);
  await settle(page);
  const href = await page.locator(`a[href^="${prefix}"]`).first().getAttribute('href');
  if (!href) throw new Error(`no link starting ${prefix} on ${list}`);
  await page.goto(BASE + href);
}

async function webp(png, out) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-quality', '82', out]);
}

/** Waits for the start of a TOTP step: a code is single-use, and each sign-in spends one. */
async function freshStep() {
  const into = Date.now() % 30000;
  if (into > 3000) await new Promise((resolve) => setTimeout(resolve, 30000 - into + 400));
}

/**
 * A browser for one language, signed in.
 *
 * Each language gets its own browser locale and the organisation's time zone.
 * Without the time zone the console renders times in the container's UTC, and
 * a 09:00 clock-in in Bangkok is captured as 02:00 — a screenshot of a product
 * bug that does not exist.
 */
async function signedIn(language, { captureAuth = false } = {}) {
  const context = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    locale: language === 'th' ? 'th-TH' : 'en-GB',
    timezoneId: 'Asia/Bangkok',
  });
  await serveWebfonts(context);
  await context.addInitScript((state) => {
    if (!sessionStorage.getItem('capture-ui-set')) {
      localStorage.setItem('cwork.ui', state);
      sessionStorage.setItem('capture-ui-set', '1');
    }
  }, uiState(language));
  const page = await context.newPage();

  await freshStep();
  await page.goto(BASE + '/login');
  await page.waitForSelector('.auth__card');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('input[type=email]').fill(ACCOUNT);
  if (captureAuth) {
    await page.screenshot({ path: join(repo, 'docs/screenshots/01-login.png'), scale: 'css' });
  }
  await page.locator('input[type=password]').fill(seedPassword);
  await page.locator('.auth__card button[type=submit]').click();

  // The sign-in card has inputs of its own, so wait for the code field itself.
  const code = page.locator('.auth__card input[autocomplete=one-time-code]');
  await code.waitFor({ timeout: 15000 });
  await code.fill(totp(SECRET));
  if (captureAuth) {
    await page.screenshot({ path: join(repo, 'docs/screenshots/02-mfa-code.png'), scale: 'css' });
  }
  await page.locator('.auth__card button[type=submit]').click();
  await page.waitForSelector('.sidebar__nav', { timeout: 20000 });
  console.log(`signed in (${language})`);
  return { context, page };
}

// ------------------------------------------------------------ both languages
for (const language of ['th', 'en']) {
  const { context, page } = await signedIn(language, { captureAuth: language === 'th' });

  for (const screen of SCREENS) {
    if (language === 'en' && !screen.landing) continue;
    await open(page, screen.route);
    await settle(page);

    const png = join(scratch, `${screen.key}.${language}.png`);
    await page.screenshot({ path: png });
    if (screen.landing) await webp(png, join(LANDING, `${screen.key}.${language}.webp`));
    if (language === 'th' && screen.docs) {
      await page.screenshot({
        path: join(repo, 'docs/screenshots', `${screen.docs}.png`),
        scale: 'css',
      });
    }
    console.log(`  ${language} ${screen.key}`);
  }

  if (language === 'th') {
    // Dark theme.
    await page.evaluate((state) => localStorage.setItem('cwork.ui', state), uiState('th', 'dark'));
    await page.goto(BASE + '/');
    await settle(page);
    await page.screenshot({
      path: join(repo, 'docs/screenshots/20-dashboard-dark.png'),
      scale: 'css',
    });

    // The console at phone width.
    await page.evaluate((state) => localStorage.setItem('cwork.ui', state), uiState('th'));
    await page.setViewportSize(PHONE);
    await page.goto(BASE + '/');
    await settle(page);
    await page.screenshot({
      path: join(repo, 'docs/screenshots/21-mobile-width.png'),
      scale: 'css',
    });
  }

  await context.close();
}

await browser.close();
rmSync(scratch, { recursive: true, force: true });
console.log('done');
