// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Takes the screenshots in docs/guide/import-from-excel.th.md, the HR guide to
 * the three spreadsheet imports (CW-059).
 *
 * Like docs/screenshots/capture.mjs it drives the real console, signed in as a
 * seeded HR account with a real second factor. It also imports for real: each
 * page is shown with a file that has mistakes, then a clean file, then the
 * result. The run therefore needs a company fresh from `npm run db:seed`, and
 * running it twice on the same database fails at the first import, because
 * the employee codes then exist already.
 *
 *   cd backend && SEED_PASSWORD=… npm run db:seed && npm run start:dev
 *   cd web && npm run dev
 *   SEED_PASSWORD=… node docs/guide/capture-imports.mjs
 *
 * Writes Thai screenshots at 1280×800, 1×, to docs/guide/img/. The files it
 * uploads are CSV built in memory; the import reads them the same way it reads
 * .xlsx. They are handed over as buffers, not paths: Playwright silently drops
 * a file whose path has Thai in it, and HR's files are named in Thai.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { totp } from '../demo/totp.mjs';
import { followApiClock } from '../screenshots/clock.mjs';

const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword) {
  console.error('Set SEED_PASSWORD to the password `npm run db:seed` was given.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'img');
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const SECRET = 'CWORKDEMOMFASECRET234567';
const ACCOUNT = 'hr.manager@cwork.example';

/** The files HR would upload: each import once with mistakes, once clean. */
const FILES = {
  'พนักงาน-มีจุดผิด.csv': [
    'รหัสพนักงาน,คำนำหน้า,ชื่อ,นามสกุล,วันเริ่มงาน,วันครบทดลองงาน,รหัสเครื่องสแกนนิ้ว,แผนก',
    'K-101,นางสาว,กาญจนา,มีสุข,1/3/2565,,0101,ฝ่ายผลิต',
    'K-102,นาย,,ทองดี,15/6/2566,,0102,ฝ่ายวิศวกรรม',
    'K-103,นาง,สุดา,แสงทอง,31/9/2569,28/11/2569,0103,ฝ่ายขาย',
    'K-101,นาย,สมพร,ใจเย็น,1/9/2569,,0104,ฝ่ายขาย',
  ],
  'พนักงาน.csv': [
    'รหัสพนักงาน,คำนำหน้า,ชื่อ,นามสกุล,วันเริ่มงาน,วันครบทดลองงาน,รหัสเครื่องสแกนนิ้ว,แผนก',
    'K-101,นางสาว,กาญจนา,มีสุข,1/3/2565,,0101,ฝ่ายขาย',
    'K-102,นาย,ประเสริฐ,ทองดี,15/6/2566,,0102,ฝ่ายวิศวกรรม',
    'K-103,นาง,สุดา,แสงทอง,1/8/2569,28/11/2569,0103,ฝ่ายขาย',
  ],
  'วันลา-มีจุดผิด.csv': [
    'รหัสพนักงาน,ชื่อ,ลาพักร้อน,ลาป่วย,ลากิจ',
    'K-101,กาญจนา มีสุข,2,1.5,1',
    'K-102,ประเสริฐ ทองดี,30,,',
    'K-104,สมพร ใจเย็น,1,,',
  ],
  'วันลา.csv': [
    'รหัสพนักงาน,ชื่อ,ลาพักร้อน,ลาป่วย,ลากิจ',
    'K-101,กาญจนา มีสุข,2,1.5,1',
    'K-102,ประเสริฐ ทองดี,3,,',
    'K-103,สุดา แสงทอง,,1,',
  ],
  'ยอดเงินเดือน-มีจุดผิด.csv': [
    'รหัสพนักงาน,ชื่อ,เงินได้ที่ต้องเสียภาษี,ภาษีหัก ณ ที่จ่าย,ประกันสังคม (ส่วนลูกจ้าง)',
    'K-101,กาญจนา มีสุข,"270,000",4500,6750',
    'K-102,ประเสริฐ ทองดี,7800,"315,000",6750',
  ],
  'ยอดเงินเดือน.csv': [
    'รหัสพนักงาน,ชื่อ,เงินได้ที่ต้องเสียภาษี,ภาษีหัก ณ ที่จ่าย,ประกันสังคม (ส่วนลูกจ้าง)',
    'K-101,กาญจนา มีสุข,"270,000",4500,6750',
    'K-102,ประเสริฐ ทองดี,"315,000",7800,6750',
    'K-103,สุดา แสงทอง,"36,000",0,1500',
  ],
};

/** Same as capture.mjs: Google Fonts through Node, so Thai is in the real face. */
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
  await page.mouse.move(page.viewportSize().width - 8, 20);
  await page.evaluate(() => document.fonts.ready);
  const families = await page.evaluate(() => [...document.fonts].map((f) => f.family).join(','));
  if (!families.includes('IBM Plex Sans Thai')) {
    throw new Error('IBM Plex Sans Thai never loaded — refusing to capture a fallback face');
  }
  await page.waitForTimeout(400);
}

/** Rings the one control a step is about, so the reader finds it at a glance. */
async function ring(page, selector) {
  await page.addStyleTag({
    content: `${selector} { outline: 3px solid #e11d48 !important; outline-offset: 3px; }`,
  });
}

async function shot(target, name) {
  await target.screenshot({ path: join(OUT, `${name}.png`), scale: 'css', animations: 'disabled' });
  console.log(`  ${name}.png`);
}

const card = (page, title) => page.locator('section.card').filter({ hasText: title }).first();

async function upload(page, file, expect) {
  await page.locator('input[type=file]').setInputFiles({
    name: file,
    mimeType: 'text/csv',
    buffer: Buffer.from(FILES[file].join('\n') + '\n'),
  });
  await page.getByText(expect).first().waitFor({ timeout: 20000 });
  await settle(page);
}

async function signIn(page, offset) {
  // A TOTP code is single-use: start on a fresh step, counted on the API's clock.
  const into = (Date.now() + offset) % 30000;
  if (into > 3000) await new Promise((resolve) => setTimeout(resolve, 30000 - into + 400));
  await page.goto(BASE + '/login');
  await page.waitForSelector('.auth__card');
  await page.locator('input[type=email]').fill(ACCOUNT);
  await page.locator('input[type=password]').fill(seedPassword);
  await page.locator('.auth__card button[type=submit]').click();
  const code = page.locator('.auth__card input[autocomplete=one-time-code]');
  await code.waitFor({ timeout: 15000 });
  await code.fill(totp(SECRET, Date.now() + offset));
  await page.locator('.auth__card button[type=submit]').click();
  await page.waitForSelector('.sidebar__nav', { timeout: 20000 });
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  locale: 'th-TH',
  timezoneId: 'Asia/Bangkok',
});
await serveWebfonts(context);
const offset = await followApiClock(context, `${API}/config`);
await context.addInitScript(() => {
  if (!sessionStorage.getItem('guide-ui-set')) {
    localStorage.setItem(
      'cwork.ui',
      JSON.stringify({
        state: { theme: 'light', language: 'th', languageExplicit: true },
        version: 0,
      }),
    );
    sessionStorage.setItem('guide-ui-set', '1');
  }
});
const page = await context.newPage();
await signIn(page, offset);
console.log(`signed in as ${ACCOUNT}`);

// ------------------------------------------------------------- employees
await page.goto(BASE + '/employees');
await settle(page);
await ring(page, 'a[href="/employees/import"]');
await shot(page, '01-employees-entry');

await page.goto(BASE + '/employees/import');
await settle(page);
await shot(page, '02-employees-steps');

await upload(page, 'พนักงาน-มีจุดผิด.csv', 'จุดที่ต้องแก้');
await shot(card(page, '3.'), '03-employees-problems');

await upload(page, 'พนักงาน.csv', 'ไฟล์ถูกต้องครบถ้วน');
await shot(card(page, '3.'), '04-employees-ready');

await card(page, '3.').locator('button.btn--primary').click();
await page.getByRole('status').getByText('นำเข้าพนักงานแล้ว').waitFor();
await settle(page);
await shot(page.locator('section.card').first(), '05-employees-done');

// ------------------------------------------------------------- leave
await page.goto(BASE + '/leave');
await settle(page);
await ring(page, 'a[href="/leave/import"]');
await shot(page, '06-leave-entry');

await page.goto(BASE + '/leave/import');
await settle(page);
await upload(page, 'วันลา-มีจุดผิด.csv', 'จุดที่ต้องแก้');
await shot(card(page, '3.'), '07-leave-problems');

await upload(page, 'วันลา.csv', 'ไฟล์ถูกต้องครบถ้วน');
await shot(card(page, '3.'), '08-leave-ready');

await card(page, '3.').locator('button.btn--primary').click();
await page.getByRole('status').getByText('นำเข้าวันลา').waitFor();
await settle(page);
await shot(page.locator('section.card').first(), '09-leave-done');

// ------------------------------------------------------------- pay before Cwork
await page.goto(BASE + '/payroll');
await settle(page);
await ring(page, 'a[href="/payroll/import"]');
await shot(page, '10-payroll-entry');

await page.goto(BASE + '/payroll/import');
await settle(page);
await shot(card(page, 'ก่อนใช้ Cwork'), '11-payroll-months');

await upload(page, 'ยอดเงินเดือน-มีจุดผิด.csv', 'จุดที่ต้องแก้');
await shot(card(page, '3.'), '12-payroll-problems');

await upload(page, 'ยอดเงินเดือน.csv', 'ไฟล์ถูกต้องครบถ้วน');
await shot(card(page, '3.'), '13-payroll-ready');

await card(page, '3.').locator('button.btn--primary').click();
await page.getByRole('status').getByText('นำเข้ายอด').waitFor();
await settle(page);
await shot(page.locator('section.card').first(), '14-payroll-done');

await browser.close();
console.log(`done: ${OUT}`);
