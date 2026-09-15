/**
 * Records the walkthrough in README.md.
 *
 * The point of doing it this way is that the demo cannot drift from the
 * product: it drives the real console, signed in as a real seeded account,
 * against a database built by `npm run db:seed` — including the second factor,
 * which is generated here rather than mocked away. If a screen breaks, the
 * recording breaks with it.
 *
 * Needs a running stack, Playwright and ffmpeg. Neither is a dependency of the
 * project itself; this is a tool for whoever refreshes the asset.
 *
 *   cd backend && npm run db:seed && npm run start:dev
 *   cd web && npm run dev
 *
 *   npm i playwright && npx playwright install chromium
 *   RECORD=1 OUT=video node docs/demo/record.mjs
 *   ffmpeg -i video/*.webm -vf "fps=12,scale=900:-1:flags=lanczos,\
 *     split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];\
 *     [b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
 *     -loop 0 docs/demo/walkthrough.gif
 *
 * Run it without RECORD=1 to step through the same journey without recording,
 * which is the quickest way to find out whether it still works.
 */
import { chromium } from 'playwright';
import { totp } from './totp.mjs';

const RECORD = process.env.RECORD === '1';
const OUT = process.env.OUT ?? 'video';
const VIEWPORT = { width: 1280, height: 800 };
const SECRET = 'CWORKDEMOMFASECRET234567';
const BASE = 'http://localhost:5173';

// A TOTP code cannot be spent twice even inside its own window, so wait for a
// fresh 30-second step before the recorder starts — otherwise a retake burns a
// code the previous take already used, and the wait ends up inside the video.
const into = Date.now() % 30000;
if (into > 3000) {
  const pause = 30000 - into + 400;
  console.log(`(waiting ${Math.round(pause / 1000)}s for a fresh TOTP step)`);
  await new Promise((resolve) => setTimeout(resolve, pause));
}

const browser = await chromium.launch(
  // Set CHROMIUM_PATH when Playwright's own download is not where it expects.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  ...(RECORD ? { recordVideo: { dir: OUT, size: VIEWPORT } } : {}),
});
const page = await context.newPage();

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text());
});

/** Holds a screen long enough for a viewer to read it. */
const beat = (ms = 1600) => page.waitForTimeout(ms);

async function step(label, fn) {
  const started = Date.now();
  await fn();
  console.log(`  ${label} — ${Date.now() - started}ms`);
}

async function show(href) {
  await page.locator(`a.nav-link[href="${href}"]`).click();
  await page.waitForSelector('.page', { timeout: 15000 });
  await page.waitForTimeout(600);
}

console.log('walkthrough:');

await step('open sign-in', async () => {
  await page.goto(BASE + '/login');
  await page.waitForSelector('.auth__card');
  await beat(1200);
});

await step('type credentials', async () => {
  await page.getByPlaceholder('you@company.com').type('ceo@cwork.example', { delay: 45 });
  await page.locator('input[type=password]').type('Cwork2026!', { delay: 60 });
  await beat(600);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
});

await step('second factor', async () => {
  // An HR administrator can read national IDs and run payroll, so a password
  // alone is not a session. This is the product behaving, not a screenshot.
  //
  // A TOTP code cannot be spent twice even inside its own window, so the run
  // waits for a fresh 30-second step rather than re-using one an earlier take
  // already burned. That is the replay protection working, not a flake.
  await page.waitForSelector('.auth__card input', { timeout: 15000 });
  await beat(1300);
  const field = page.locator('.auth__card input').first();
  await field.type(totp(SECRET), { delay: 110 });
  await beat(500);
  await page.getByRole('button', { name: 'ยืนยัน' }).click();
  await page.waitForSelector('.sidebar__nav', { timeout: 20000 });
  await beat(2200);
});

const tour = [
  ['/approvals', 'รออนุมัติ'],
  ['/employees', 'ทะเบียนพนักงาน'],
  ['/leave', 'การลา'],
  ['/attendance', 'ลงเวลาทำงาน'],
  ['/payroll', 'เงินเดือน'],
  ['/recruitment', 'ผู้สมัครงาน'],
  ['/performance', 'ประเมินผล / KPI'],
  ['/audit', 'บันทึกการใช้งาน'],
];

for (const [href, label] of tour) {
  await step(label, async () => {
    await show(href);
    await beat(1700);

    // The payroll run is the one screen worth opening: the payslips behind it
    // are computed by the real Thai tax and social-security code.
    if (href === '/payroll') {
      const open = page.locator('a.btn', { hasText: 'เปิดดู' }).first();
      if (await open.count()) {
        await open.click();
        await page.waitForSelector('.page', { timeout: 15000 });
        await beat(2600);
      }
    }
  });
}

await step('dark mode', async () => {
  await page.getByTitle('สลับธีมสว่าง/มืด').click();
  await beat(2400);
});

console.log(problems.length ? `console errors: ${problems.length}` : 'no console errors');
for (const p of problems.slice(0, 5)) console.log('   ', p.slice(0, 140));

await page.close();
await context.close();
await browser.close();
