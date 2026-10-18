// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Takes the screenshots in docs/guide/hr-daily-tasks.th.md, the HR guide to the
 * four everyday jobs of the pilot (CW-066): import the fingerprint scanner's
 * file and settle a day, record leave for an employee, run the shadow payroll
 * for a 15-day period and for a month, and print the payslips and the receipt
 * sheet.
 *
 * It is the walk a first-time HR does, in Thai, on the screen those users have:
 * 1366×768 at 1×. Every screen comes from the seeded demo company and files
 * built in memory; nothing here is a real company's data. The run changes the
 * database (it imports, records leave and runs payroll for real), so it needs a
 * company fresh from `npm run db:seed`:
 *
 *   cd backend && SEED_PASSWORD=… npm run db:seed && npm run start:dev
 *   cd web && npm run dev
 *   SEED_PASSWORD=… node docs/guide/capture-hr-tasks.mjs
 *
 * HR is signed in as hr.manager and the owner as ceo; each sign-in needs a
 * second-factor code the API has not seen yet, so the run waits for the next
 * 30-second step between sign-ins. The scanner file is handed to the page as a
 * buffer, not a path: Playwright silently drops a file whose path has Thai in it.
 *
 * Writes docs/guide/img/hr-NN-*.png.
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
const HR = 'hr.manager@cwork.example';
const OWNER = 'ceo@cwork.example';
const SCREEN = { width: 1366, height: 768 };
mkdirSync(OUT, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the API's own clock, and a second-factor code it has not seen ----------

const apiDate = (await fetch(`${API}/config`)).headers.get('date');
const offset = new Date(apiDate).getTime() - Date.now();
let lastStep = -1;
async function freshCode() {
  for (;;) {
    const at = Date.now() + offset;
    const step = Math.floor(at / 30000);
    if (step !== lastStep && at % 30000 < 24000) {
      lastStep = step;
      return totp(SECRET, at);
    }
    await sleep(500);
  }
}

const today = new Date(Date.now() + offset);
const year = today.getUTCFullYear();
const month = today.getUTCMonth() + 1;
const iso = (d) => `${year}-${pad(month)}-${pad(d)}`;
const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

// ---- data the guide needs, through the API ----------------------------------

async function token(email) {
  const post = async (path, body) => {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const first = await post('/auth/login', { email, password: seedPassword });
  const second = await post('/auth/mfa/verify', {
    challengeToken: first.body.challengeToken,
    code: await freshCode(),
  });
  if (second.status !== 200) throw new Error(`second factor refused: ${second.status}`);
  return second.body.accessToken;
}

async function call(access, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${access}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/**
 * Five people with a scanner number each (they are the ones in the file), two
 * of them paid by the day so the 15-day period has someone to pay, and a
 * minimum daily wage on the worksites so the sample wage is checked against
 * something instead of drawing a warning about a missing one.
 */
async function prepare(access) {
  const list = await call(access, 'GET', '/employees?limit=30');
  const active = list.data.filter((e) => e.status === 'ACTIVE');
  if (active.length < 8) throw new Error('the seed has fewer than eight active employees');
  const people = [];
  for (const [index, employee] of active.slice(0, 5).entries()) {
    const number = String(101 + index);
    await call(access, 'PATCH', `/employees/${employee.id}`, { scannerId: number });
    people.push({ id: employee.id, number, name: employee.firstNameTh });
  }
  for (const location of await call(access, 'GET', '/work-locations')) {
    await call(access, 'PATCH', `/work-locations/${location.id}`, {
      minimumDailyWage: 400,
      minimumDailyWageSource: 'ตัวอย่างสำหรับคู่มือ ไม่ใช่ประกาศจริง',
    });
  }
  for (const employee of [people[0], people[2]]) {
    await call(access, 'POST', '/payroll/compensation', {
      employeeId: employee.id,
      effectiveFrom: iso(1),
      baseSalary: 0,
      payFrequency: 'SEMI_MONTHLY',
      dailyRate: 450,
    });
  }
  return people;
}

/**
 * One scanner file: UTF-16LE with a byte-order mark, tab-separated, no header,
 * every field closed with a comma. Mostly two times a day; one day has a single
 * time and one has three, which wait for HR; one number belongs to nobody yet.
 */
function scannerFile(people) {
  const days = [];
  for (let d = 1; d <= Math.min(15, lastDay); d += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d);
  }
  const lines = [];
  days.forEach((d, dayIndex) => {
    people.forEach((person, personIndex) => {
      const minute = (personIndex * 7 + dayIndex * 3) % 20;
      const clockIn = `08:${pad(minute)}`;
      const clockOut = `17:${pad((minute * 2) % 40)}`;
      let times = `${clockIn} ${clockOut}`;
      if (personIndex === 1 && dayIndex === 1) times = clockIn;
      if (personIndex === 3 && dayIndex === 2) times = `${clockIn} 12:03 ${clockOut}`;
      lines.push(
        [`${person.name} ,`, `${person.number} ,`, `${pad(d)}/${pad(month)}/${year} ,`, `${times} ,`, ''].join('\t'),
      );
    });
    if (dayIndex < 2) {
      lines.push(['ชั่วคราว ,', '777 ,', `${pad(d)}/${pad(month)}/${year} ,`, '08:30 17:30 ,', ''].join('\t'));
    }
  });
  return Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(lines.join('\r\n') + '\r\n', 'utf16le'),
  ]);
}

// ---- the browser ------------------------------------------------------------

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** Web fonts through Node, because the browser's own network is not always allowed out. */
async function fonts(context) {
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    try {
      const res = await fetch(route.request().url(), { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error();
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

const browser = await chromium.launch();
const ui = JSON.stringify({
  state: { theme: 'light', language: 'th', languageExplicit: true },
  version: 0,
});

/** Signs in as `email` and returns a page in a fresh context, Thai, at the office PC's size. */
async function signIn(email) {
  const options = {
    viewport: SCREEN,
    deviceScaleFactor: 1,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  };
  const login = await browser.newContext(options);
  await fonts(login);
  await followApiClock(login, `${API}/config`);
  await login.addInitScript((s) => {
    if (!sessionStorage.getItem('u')) {
      localStorage.setItem('cwork.ui', s);
      sessionStorage.setItem('u', '1');
    }
  }, ui);
  const page = await login.newPage();
  await page.goto(BASE + '/login');
  await page.waitForSelector('.auth__card');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(seedPassword);
  await page.locator('.auth__card button[type=submit]').click();
  const code = page.locator('.auth__card input[autocomplete=one-time-code]');
  await code.waitFor({ timeout: 15000 });
  await code.fill(await freshCode());
  await page.locator('.auth__card button[type=submit]').click();
  await page.waitForSelector('.sidebar__nav', { timeout: 20000 });
  const storageState = await login.storageState();
  await login.close();
  const context = await browser.newContext({ ...options, storageState });
  await fonts(context);
  await followApiClock(context, `${API}/config`);
  await context.addInitScript((s) => localStorage.setItem('cwork.ui', s), ui);
  return { context, page: await context.newPage() };
}

async function settle(page) {
  await page.waitForSelector('.page', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await page.mouse.move(SCREEN.width - 8, 20);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/** `at`: a locator to bring to the top of the screen first; the default is the top of the page. */
async function shot(page, name, { at } = {}) {
  await settle(page);
  if (at) await at.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('wrote', name);
}

/** A date typed the way HR types it: the field selects itself, so typing replaces it. */
async function typeDate(page, field, text) {
  await field.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
}

const thaiYear = year + 543;
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** The row of the pay period that spans the whole month, whatever order the list is in. */
const spanRow = (page, from, to) =>
  page.locator('tr', {
    hasText: `${from} ${MONTHS[month - 1]} ${thaiYear} – ${to} ${MONTHS[month - 1]} ${thaiYear}`,
  });
const monthRow = (page) => spanRow(page, 1, lastDay);
const halfRow = (page) => spanRow(page, 1, 15);
const dmy = (d) => `${d}/${month}/${thaiYear}`;

// ---- the walk ---------------------------------------------------------------

const adminToken = await token(OWNER);
const people = await prepare(adminToken);

const hr = await signIn(HR);
const page = hr.page;

// 1. The scanner's file.
await page.goto(BASE + '/attendance/scanner/import');
await shot(page, 'hr-01-scanner-choose');
await page.locator('input[type=file]').setInputFiles({
  name: 'Export.xls',
  mimeType: 'application/vnd.ms-excel',
  buffer: scannerFile(people),
});
await page.getByRole('button', { name: 'นำเข้าไฟล์นี้' }).waitFor();
await shot(page, 'hr-02-scanner-preview');
await page.getByRole('button', { name: 'นำเข้าไฟล์นี้' }).click();
await page.getByRole('button', { name: 'นำเข้าไฟล์อื่น' }).waitFor();
await shot(page, 'hr-03-scanner-done');
await page.goto(BASE + '/attendance/scanner');
await page.getByRole('button', { name: 'ใช้เวลาเหล่านี้' }).first().waitFor();
await shot(page, 'hr-04-scanner-review', {
  at: page.getByText('วันจากเครื่องสแกน', { exact: true }),
});
// The day with three times: the first and the last are offered as in and out.
await page
  .locator('tr', { hasText: 'EMP-0004' })
  .getByRole('button', { name: 'ใช้เวลาเหล่านี้' })
  .click();
await page.getByRole('status').filter({ hasText: 'นับเวลา' }).waitFor();
await shot(page, 'hr-05-scanner-decided');

// 2. Leave for an employee.
await page.goto(BASE + '/leave');
await shot(page, 'hr-06-leave');
await page.getByRole('button', { name: /บันทึกการลาให้พนักงาน/ }).click();
await page.getByPlaceholder(/ค้นหาชื่อ/).fill('สมศักดิ์');
await page.getByText('EMP-0001').first().click();
const panel = page.getByRole('complementary', { name: 'บันทึกการลาให้พนักงาน' });
await panel.getByLabel('ประเภทการลา').selectOption({ label: 'ลาพักร้อน' });
const leaveDates = panel.locator("input[placeholder*='เดือน']");
const leaveDay = Math.min(lastDay - 1, 27);
await typeDate(page, leaveDates.nth(0), dmy(leaveDay));
await typeDate(page, leaveDates.nth(1), dmy(leaveDay));
await shot(page, 'hr-07-leave-form');
await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
await page.locator('.toast').waitFor();
await shot(page, 'hr-08-leave-saved');

// 3. The shadow payroll: a 15-day period, then the month.
await page.goto(BASE + '/payroll');
await page.getByRole('button', { name: /สร้างงวดใหม่/ }).click();
await page.locator('select').nth(2).selectOption({ label: 'ครึ่งแรก (วันที่ 1–15)' });
await shot(page, 'hr-09-period-form');
await page.getByRole('button', { name: 'สร้างงวด', exact: true }).click();
await halfRow(page).waitFor();
await shot(page, 'hr-10-period-created');
await halfRow(page).getByRole('button', { name: 'สร้างรอบคำนวณ' }).click();
await page.getByRole('button', { name: 'คำนวณเงินเดือน' }).waitFor();
await shot(page, 'hr-11-run-draft');
await page.getByRole('button', { name: 'คำนวณเงินเดือน' }).click();
await page.getByText(/สลิปเงินเดือน \([1-9]/).waitFor();
await shot(page, 'hr-12-run-calculated');
const halfRun = page.url();

await page.goto(BASE + '/payroll');
await page.getByRole('button', { name: /สร้างงวดใหม่/ }).click();
await page.getByRole('button', { name: 'สร้างงวด', exact: true }).click();
await monthRow(page).waitFor();
await monthRow(page).getByRole('button', { name: 'สร้างรอบคำนวณ' }).click();
await page.getByRole('button', { name: 'คำนวณเงินเดือน' }).click();
await page.getByText(/สลิปเงินเดือน \([1-9]/).waitFor();
await shot(page, 'hr-13-month-calculated');
const monthRun = page.url();
await hr.context.close();

// 4. The owner approves, then HR prints.
const owner = await signIn(OWNER);
await owner.page.goto(halfRun);
await owner.page.getByRole('button', { name: 'อนุมัติรอบ' }).click();
await owner.page.getByText('อนุมัติแล้ว', { exact: true }).first().waitFor();
await owner.page.goto(monthRun);
await owner.page.getByRole('button', { name: 'อนุมัติรอบ' }).click();
await owner.page.getByText('อนุมัติแล้ว').first().waitFor();
await shot(owner.page, 'hr-14-approved');
await owner.context.close();
await browser.close();
