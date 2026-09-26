// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Takes the employee app's screenshots, in Thai and in English.
 *
 * The console's are taken by capture.mjs; this is the same idea for the Flutter
 * app: the real app, signed in as seeded employees, against the company
 * `npm run db:seed` builds. The app targets Android and iOS only, so it is
 * built for the web in a throwaway copy — `flutter create --platforms=web`
 * writes files this project does not keep — and driven in Chromium at a phone's
 * size. Flutter paints into a canvas, so the script switches on the semantics
 * tree the app gives screen readers and finds every field, tab and button by
 * the label a screen reader would announce.
 *
 * Needs the API (with this script's origin in CORS_ORIGINS), Flutter,
 * Playwright and ffmpeg with libwebp:
 *
 *   cd backend && SEED_PASSWORD=… npm run db:seed
 *   CORS_ORIGINS=http://localhost:5173,http://localhost:8080 npm run start:dev
 *   SEED_PASSWORD=… node docs/screenshots/capture-mobile.mjs
 *
 * MOBILE_WEB_BUILD=path/to/build/web skips the build and serves that one.
 *
 * What it writes:
 *
 *   docs/screenshots/mobile/NN-name.png        Thai, 390×844 at 2×   README.th.md
 *   docs/screenshots/mobile/en/NN-name.png     English, same         README.md
 *   landing/assets/shots/mobile-*.th.webp      Thai                  landing/
 *   landing/assets/shots/mobile-*.en.webp      English               landing/en/
 *
 * The Thai run clocks the employee in if they have not been yet, because the
 * home screen of somebody at work is the screen the app exists for. To take it
 * on a working morning, pin the API's clock — see clock.mjs.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { followApiClock } from './clock.mjs';

const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword) {
  console.error('Set SEED_PASSWORD to the password `npm run db:seed` was given.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const APP_PORT = Number(process.env.APP_PORT ?? 8080);
const APP = `http://localhost:${APP_PORT}`;
const EMPLOYEE = 'dev2@cwork.example';
/** dev2's manager, who approves their team's leave and expenses. */
const MANAGER = 'eng.manager@cwork.example';
/**
 * A few metres from the seeded head office on Sathorn (13.7211, 100.5285), well
 * inside its 250 m geofence — where somebody clocking in actually stands.
 */
const AT_THE_OFFICE = { latitude: 13.72118, longitude: 100.52856 };
const PHONE = { width: 390, height: 844 };
const DOCS = join(repo, 'docs', 'screenshots', 'mobile');
const LANDING = join(repo, 'landing', 'assets', 'shots');

/** The app's strings (mobile/lib/core/i18n), in the language each run uses. */
const UI = {
  th: {
    email: 'อีเมล',
    password: 'รหัสผ่าน',
    signIn: 'เข้าสู่ระบบ',
    clockIn: 'ลงเวลาเข้างาน',
    clockOut: 'ลงเวลาออกงาน',
    leave: 'การลา',
    approvals: 'อนุมัติ',
    slips: 'สลิป',
    profile: 'โปรไฟล์',
    requestLeave: 'ขอลา',
    period: 'งวด',
  },
  en: {
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    clockIn: 'Clock in',
    clockOut: 'Clock out',
    leave: 'Leave',
    approvals: 'Approvals',
    slips: 'Slips',
    profile: 'Profile',
    requestLeave: 'Request leave',
    period: 'Period',
  },
};

/** The two the landing page shows beside its app claims: clocking in, and approving. */
const LANDING_SHOTS = { '02-home': 'mobile-home', '06-approvals': 'mobile-approvals' };

// ------------------------------------------------------------------ build
function buildApp() {
  if (process.env.MOBILE_WEB_BUILD) return process.env.MOBILE_WEB_BUILD;
  const work = join(tmpdir(), 'cwork-mobile-web');
  rmSync(work, { recursive: true, force: true });
  cpSync(join(repo, 'mobile'), work, {
    recursive: true,
    filter: (src) => !/^(build|\.dart_tool)(\/|$)/.test(relative(join(repo, 'mobile'), src)),
  });
  const flutter = (...args) => execFileSync('flutter', args, { cwd: work, stdio: 'inherit' });
  flutter('create', '--platforms=web', '.');
  flutter('build', 'web', `--dart-define=API_BASE_URL=${API}`);
  return join(work, 'build', 'web');
}

const build = buildApp();
if (!existsSync(join(build, 'index.html'))) {
  console.error(`No web build at ${build}`);
  process.exit(1);
}

// ------------------------------------------------------------------ serve
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
};
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, APP).pathname)).replace(/^\/+/, '');
  let file = join(build, path);
  if (!file.startsWith(build) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(build, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(APP_PORT, '127.0.0.1', resolve));

// ---------------------------------------------------------------- browser
mkdirSync(join(DOCS, 'en'), { recursive: true });
mkdirSync(LANDING, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

/**
 * What the app fetches from Google, answered without the browser going there.
 *
 * CanvasKit, Flutter's renderer, is fetched from www.gstatic.com by default;
 * the build carries the identical files, so they are served from it. The fonts
 * are fetched through Node, which honours the proxy and CA settings the bundled
 * browser does not: Roboto and Noto Sans Thai, which is what an Android phone
 * draws this app in. `fonts` records which families arrived.
 */
async function routeGoogle(context, fonts) {
  await context.route(/^https:\/\/www\.gstatic\.com\/flutter-canvaskit\/[0-9a-f]+\//, (route) => {
    const file = route
      .request()
      .url()
      .replace(/^.*\/flutter-canvaskit\/[0-9a-f]+\//, '');
    return route.fulfill({
      contentType: TYPES[extname(file)] ?? 'application/octet-stream',
      body: readFileSync(join(build, 'canvaskit', file)),
    });
  });
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    try {
      const res = await fetch(route.request().url());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fonts.add(route.request().url().split('/')[4]);
      await route.fulfill({
        contentType: res.headers.get('content-type') ?? 'font/woff2',
        body: Buffer.from(await res.arrayBuffer()),
      });
    } catch {
      await route.abort();
    }
  });
}

/** The page in front of the camera, for the picture of what went wrong. */
let lastPage;

/** A fresh phone in one language, with the app loaded and its semantics on. */
async function phone(language) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: language === 'th' ? 'th-TH' : 'en-GB',
    // The app formats instants in the device's zone; on a UTC machine a 09:00
    // shift would be captured as 02:00.
    timezoneId: 'Asia/Bangkok',
    geolocation: AT_THE_OFFICE,
    permissions: ['geolocation'],
  });
  const fonts = new Set();
  await routeGoogle(context, fonts);
  await followApiClock(context, `${API}/config`);
  // The app keeps its language in shared_preferences, which on the web is
  // localStorage under a "flutter." prefix, JSON-encoded.
  await context.addInitScript((lang) => {
    localStorage.setItem('flutter.cwork.language', JSON.stringify(lang));
  }, language);

  const page = await context.newPage();
  lastPage = page;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  await page.goto(APP, { waitUntil: 'networkidle' });
  await semantics(page);
  return { context, page, fonts, errors };
}

/** Turns on Flutter's semantics tree, once per page load. */
async function semantics(page) {
  const placeholder = page.locator('flt-semantics-placeholder');
  await placeholder.waitFor({ state: 'attached', timeout: 30000 });
  await placeholder.evaluate((el) => el.click());
  await page.locator('flt-semantics').first().waitFor({ state: 'attached', timeout: 10000 });
}

/**
 * Types into a text field and checks it took. Flutter keeps its own copy of
 * the text, and a keystroke can land before the field is listening — a
 * password short one character is a refused sign-in, and enough of those lock
 * the demo account.
 */
async function typeInto(page, label, text) {
  const field = page.getByLabel(label, { exact: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await field.tap();
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(text, { delay: 40 });
    await page.waitForTimeout(300);
    if ((await page.evaluate(() => document.activeElement?.value)) === text) return;
  }
  throw new Error(`"${label}" would not take the text typed into it`);
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const tab = (page, name) => page.getByRole('tab', { name, exact: true });

async function signIn(page, ui, email) {
  await typeInto(page, ui.email, email);
  await typeInto(page, ui.password, seedPassword);
  await button(page, ui.signIn).tap();
  await tab(page, ui.profile).waitFor({ timeout: 20000 });
}

/** Lets the screen finish arriving: data, images and any transition. */
async function settle(page, ms = 2500) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

async function shoot(page, language, name) {
  const file = language === 'th' ? join(DOCS, `${name}.png`) : join(DOCS, 'en', `${name}.png`);
  await page.screenshot({ path: file });
  if (LANDING_SHOTS[name]) {
    const out = join(LANDING, `${LANDING_SHOTS[name]}.${language}.webp`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-quality', '82', out]);
  }
  console.log(`  ${language} ${name}`);
}

/** Back to the shell's first tab: the session survives a reload, the stack does not. */
async function home(page, ui) {
  await page.reload({ waitUntil: 'networkidle' });
  await semantics(page);
  await tab(page, ui.profile).waitFor({ timeout: 20000 });
}

function checkFonts(fonts) {
  if (!fonts.has('notosansthai') || !fonts.has('roboto')) {
    throw new Error(
      `fonts that loaded: ${[...fonts].join(', ') || 'none'} — refusing to capture a fallback face`,
    );
  }
}

/**
 * Reported rather than fatal. Some plugins have no web implementation, and
 * one of them (safe_device, whose init is fire-and-forget) throws the moment
 * the employee clocks in — here, never on the phones the app is built for.
 * Look at the screenshots; anything else here is worth reading.
 */
function reportErrors(errors, who) {
  if (errors.length === 0) return;
  console.warn(
    `  ${who}: the page threw ${errors.length} time(s); first:\n    ${errors[0].split('\n').slice(0, 3).join('\n    ')}`,
  );
}

// ----------------------------------------------------------------- capture
try {
  for (const language of ['th', 'en']) {
    const ui = UI[language];

    // The employee.
    const { context, page, fonts, errors } = await phone(language);
    await typeInto(page, ui.email, EMPLOYEE);
    await page.locator('body').tap({ position: { x: 8, y: 8 } });
    await settle(page, 800);
    await shoot(page, language, '01-login');
    await signIn(page, ui, EMPLOYEE);

    // The clock card arrives after the shell does.
    const clockIn = button(page, ui.clockIn);
    await clockIn.or(button(page, ui.clockOut)).waitFor({ timeout: 15000 });
    if (language === 'th' && (await clockIn.count()) > 0) {
      await clockIn.tap();
      // Long enough for the confirmation to come and go.
      await page.waitForTimeout(6000);
    }
    await settle(page);
    checkFonts(fonts);
    await shoot(page, language, '02-home');

    await tab(page, ui.leave).tap();
    await settle(page);
    await shoot(page, language, '03-leave');

    await button(page, ui.requestLeave).tap();
    await settle(page, 1500);
    await shoot(page, language, '08-leave-request');

    await home(page, ui);
    await tab(page, ui.slips).tap();
    await settle(page);
    await shoot(page, language, '04-payslip');

    await page
      .getByRole('button', { name: new RegExp(`^${ui.period} `) })
      .first()
      .tap();
    await settle(page);
    await shoot(page, language, '05-payslip-detail');

    await home(page, ui);
    await tab(page, ui.profile).tap();
    await settle(page);
    await shoot(page, language, '07-profile');
    reportErrors(errors, EMPLOYEE);
    await context.close();

    // Their manager, whose phone is where the team's requests now wait.
    const manager = await phone(language);
    await signIn(manager.page, ui, MANAGER);
    await tab(manager.page, ui.approvals).tap();
    await settle(manager.page);
    checkFonts(manager.fonts);
    await shoot(manager.page, language, '06-approvals');
    reportErrors(manager.errors, MANAGER);
    await manager.context.close();
  }
} catch (error) {
  const snapshot = join(tmpdir(), 'capture-mobile-failure.png');
  await lastPage?.screenshot({ path: snapshot }).catch(() => {});
  const labels = await lastPage
    ?.$$eval('flt-semantics[role], flt-semantics input', (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return `${el.getAttribute('role') ?? el.tagName}: ${el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 60)} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} vis=${s.visibility} disp=${s.display}]`;
      }),
    )
    .catch(() => []);
  console.error(
    `Failed; the screen is at ${snapshot}. What it offered:\n  ${(labels ?? []).join('\n  ')}`,
  );
  throw error;
} finally {
  await browser.close();
  server.close();
}
console.log('done');
