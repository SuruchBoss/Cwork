// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

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
 *   cd backend && SEED_PASSWORD=… npm run db:seed && npm run start:dev
 *   cd web && npm run dev
 *
 * Run this with the same SEED_PASSWORD the seed was given: the demo password is
 * not fixed, so the recording signs in with whatever you chose.
 *
 *   npm i playwright && npx playwright install chromium
 *   RECORD=1 OUT=video LANG_=en node docs/demo/record.mjs   # README + landing/en
 *   RECORD=1 OUT=video LANG_=th node docs/demo/record.mjs   # landing/ (Thai)
 *   ffmpeg -i video/*.webm -vf "fps=12,scale=900:-1:flags=lanczos,\
 *     split[a][b];[a]palettegen=stats_mode=diff:max_colors=96[p];\
 *     [b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
 *     -loop 0 docs/demo/walkthrough.gif
 *
 * 96 colours, not 128: the opaque caption bar and the real webfont give the
 * palette more to do, and 128 pushed the GIF to 4.3MB for no visible gain on
 * flat interface colour. The README autoplays it on every view.
 *
 * The MP4s, and where each of the four outputs belongs:
 *
 *   ffmpeg -i video/*.webm -c:v libx264 -preset slow -crf 30 \
 *     -pix_fmt yuv420p -movflags +faststart -an out.mp4
 *
 *   docs/demo/walkthrough.gif         en   both READMEs, inline
 *   docs/demo/walkthrough.mp4         en   README.md, "higher-quality MP4"
 *   landing/assets/walkthrough.en.mp4 en   landing/en/
 *   landing/assets/walkthrough.th.mp4 th   landing/, and README.th.md's MP4 link
 *
 * Only landing/ is published to Pages, which is why the landing copies are
 * separate files rather than references into docs/.
 *
 * Run it without RECORD=1 to step through the same journey without recording,
 * which is the quickest way to find out whether it still works.
 */
import { chromium } from 'playwright';
import { totp } from './totp.mjs';

const RECORD = process.env.RECORD === '1';
const OUT = process.env.OUT ?? 'video';
/** The password the seed was run with — see the usage note above. */
const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword) {
  console.error('Set SEED_PASSWORD to the password `npm run db:seed` was given.');
  process.exit(1);
}
/**
 * Which language the burned-in captions speak.
 *
 * Not `LANG`: that is a standard POSIX variable, already set in most shells,
 * and reading it would pick up `en_US.UTF-8` and silently mean something else.
 *
 * The recording is used in three places with two audiences. README.md and the
 * English overview page are read by people who do not read Thai, and for them
 * the captions are the only way thirty seconds of a Thai interface says
 * anything. The Thai overview page is read by people who read the interface
 * fine — captioning that one in English left a Thai visitor watching a Thai
 * product narrated in a language the page is not written in, ending on a line
 * that told them, in English, that the interface is Thai.
 */
const LANG = process.env.LANG_ === 'th' ? 'th' : 'en';
const VIEWPORT = { width: 1280, height: 800 };
const SECRET = 'CWORKDEMOMFASECRET234567';
const BASE = 'http://localhost:5173';

/**
 * Every caption, in both languages, by key.
 *
 * Keyed rather than parallel arrays: a missing line is then a named failure
 * before the browser opens, not a silently blank bar two minutes into a take
 * that has already spent a TOTP code.
 *
 * These are not literal translations of each other. The closing line in
 * particular says a different thing on purpose — an English viewer needs to
 * know the interface is Thai and that a locale is on the backlog; a Thai
 * viewer can see that for themselves, and what is worth saying to them is that
 * it was built in Thai rather than translated into it afterwards.
 */
const LINES = {
  en: {
    intro: 'Cwork — open-source HR for Thai labour practice. Signing in as an administrator.',
    mfa: 'A password alone is not a session: this account can read national IDs and run payroll, so it owes a second factor.',
    dashboard: 'Dashboard — two requests waiting, eight staff, last month\'s payroll closed at ฿640,978.',
    approvals: 'Approvals — routed by policy to the line manager, or to a role, per request type.',
    employees: 'Employee register — national IDs and bank accounts are encrypted at rest.',
    leave: 'Leave — entitlement by years of service, holidays excluded from the count.',
    attendance: 'Attendance — location is recorded only at the moment of a punch, never continuously.',
    payroll: 'Payroll — one run per period; whoever prepared it may not approve it.',
    payslip: 'Every payslip here was computed by the Thai tax, social-security and provident-fund code.',
    recruitment: 'Hiring — applications arrive from a public careers page, with PDPA consent.',
    performance: 'Performance — KPI weights must total 100, and HR calibrates the grade.',
    audit: 'Audit trail — append-only in the database; a trigger blocks UPDATE and DELETE.',
    close: 'The interface is Thai. An English locale is CW-016 on the backlog.',
  },
  th: {
    intro: 'Cwork — ระบบ HR โอเพนซอร์สที่ทำตามกฎหมายแรงงานไทย กำลังเข้าสู่ระบบด้วยบัญชีผู้ดูแล',
    mfa: 'รหัสผ่านอย่างเดียวยังไม่นับว่าเข้าระบบ บัญชีนี้อ่านเลขบัตรประชาชนและทำเงินเดือนได้ จึงต้องยืนยันตัวตนอีกขั้น',
    dashboard: 'แดชบอร์ด — รออนุมัติ 2 รายการ พนักงาน 8 คน รอบเงินเดือนล่าสุดปิดที่ ฿640,978',
    approvals: 'การอนุมัติ — ระบบส่งต่อตามนโยบาย ไปที่หัวหน้าสายงานหรือตามบทบาท แล้วแต่ประเภทคำขอ',
    employees: 'ทะเบียนพนักงาน — เลขบัตรประชาชนและเลขบัญชีธนาคารถูกเข้ารหัสไว้ในฐานข้อมูล',
    leave: 'การลา — สิทธิวันลาคิดตามอายุงาน และไม่นับวันหยุดนักขัตฤกษ์รวมเข้าไปด้วย',
    attendance: 'ลงเวลาทำงาน — บันทึกพิกัดเฉพาะตอนกดลงเวลาเท่านั้น ไม่มีการตามตำแหน่งระหว่างวัน',
    payroll: 'เงินเดือน — หนึ่งงวดหนึ่งรอบ และคนที่เตรียมรอบจะอนุมัติรอบของตัวเองไม่ได้',
    payslip: 'สลิปทุกใบในนี้คำนวณด้วยโค้ดภาษีไทย ประกันสังคม และกองทุนสำรองเลี้ยงชีพ',
    recruitment: 'สรรหา — ใบสมัครเข้ามาจากหน้าประกาศงานสาธารณะ พร้อมการขอความยินยอมตาม PDPA',
    performance: 'ประเมินผล — น้ำหนัก KPI ต้องรวมกันได้ 100 และ HR เป็นคนปรับเทียบเกรด',
    audit: 'บันทึกการใช้งาน — เขียนเพิ่มได้อย่างเดียว มี trigger ในฐานข้อมูลกัน UPDATE และ DELETE ไว้',
    close: 'ธีมมืดมีมาให้ในตัว — และทั้งระบบเป็นภาษาไทยมาตั้งแต่ต้น ไม่ใช่ของแปลทับทีหลัง',
  },
};

// Both languages must carry the same keys, or one of them is a blank bar.
const missing = Object.keys(LINES.en)
  .filter((k) => !LINES.th[k])
  .concat(Object.keys(LINES.th).filter((k) => !LINES.en[k]));
if (missing.length > 0) {
  console.error(`captions missing a language: ${[...new Set(missing)].join(', ')}`);
  process.exit(1);
}

/** The caption for `key`, in the language this run is recording. */
function line(key) {
  const text = LINES[LANG][key];
  if (!text) {
    console.error(`no caption for "${key}"`);
    process.exit(1);
  }
  return text;
}

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

/**
 * Serves the console's webfonts to the browser, fetched by Node.
 *
 * The console asks Google Fonts for IBM Plex Sans Thai. When the browser
 * cannot fetch it — an offline machine, or a network that re-terminates TLS
 * with a CA the bundled Chromium does not carry — the request fails, nothing
 * throws, and the page quietly falls back to whatever Thai face the container
 * happens to have. That is how the English walkthrough came out set in Loma
 * while the screenshots beside it on the same page are in IBM Plex Sans Thai:
 * a recording of the product in a typeface the product does not use.
 *
 * Node fetches instead and Playwright fulfils the page's request from what it
 * got, because Node honours NODE_EXTRA_CA_CERTS and the proxy variables that
 * the browser's own stack does not read. If Node cannot reach it either the
 * request is let through untouched, and `assertFontsLoaded` below is what
 * refuses to record rather than shipping the wrong letters.
 */
async function serveWebfonts(context) {
  // Google serves woff2 only to a UA it believes supports it.
  const UA =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const url = route.request().url();
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await route.fulfill({
        status: 200,
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        body: Buffer.from(await res.arrayBuffer()),
      });
    } catch (error) {
      console.log(`  (font passthrough: ${error.message} — ${url.slice(0, 60)})`);
      await route.continue();
    }
  });
}

/**
 * Refuses to record in the wrong typeface.
 *
 * `document.fonts.check()` is no good here: it answers true when *something*
 * can render the string, which is exactly the fallback this guards against.
 * The honest question is whether any face actually arrived.
 */
async function assertFontsLoaded() {
  const families = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...new Set([...document.fonts].map((f) => f.family))];
  });
  if (!families.some((f) => f.includes('IBM Plex Sans Thai'))) {
    console.error(
      'IBM Plex Sans Thai never loaded — the recording would be in a fallback face.\n' +
        `  faces present: ${families.join(', ') || '(none)'}`,
    );
    await browser.close();
    process.exit(1);
  }
  console.log(`  fonts: ${families.join(', ')}`);
}

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text());
});


/**
 * A caption burned into the recording, in this run's language.
 *
 * The caption says what the screen is; it does not pretend the interface is
 * anything other than Thai.
 *
 * Re-injected after every navigation, because each one is a new document.
 */
async function caption(text) {
  await page.evaluate((line) => {
    let bar = document.getElementById('cwork-demo-caption');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cwork-demo-caption';
      Object.assign(bar.style, {
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        zIndex: '2147483647',
        // Never intercept a click: the walkthrough still has to drive the app.
        pointerEvents: 'none',
        padding: '14px 22px',
        // Opaque. At 92% the table rows behind it ghosted through the
        // caption, which reads as a rendering fault rather than a caption.
        background: 'rgb(15,17,26)',
        color: '#fff',
        // The console already loads IBM Plex Sans Thai, so naming it here
        // costs nothing and keeps a Thai caption from falling back to whatever
        // the container happens to have. Thai stacks vowel and tone marks
        // above the line, so the leading is looser than English would need.
        font: '500 17px/1.62 "IBM Plex Sans Thai", system-ui, -apple-system, "Segoe UI", sans-serif',
        letterSpacing: '0.2px',
        transition: 'opacity 180ms ease',
      });
      document.body.appendChild(bar);
    }
    bar.textContent = line;
    bar.style.opacity = line ? '1' : '0';
  }, text);
}

/** Holds a screen long enough for a viewer to read it. */
const beat = (ms = 1600) => page.waitForTimeout(ms);

async function step(label, fn) {
  const started = Date.now();
  await fn();
  console.log(`  ${label} — ${Date.now() - started}ms`);
}

/**
 * Moves to a screen, then captions it — in that order, and never the other way.
 *
 * The console is a single-page app: routing swaps the view without reloading
 * the document, so the caption bar survives the navigation. Setting the new
 * line after a fixed settle left the *previous* screen's caption sitting over
 * the new one for the length of that settle — about 600ms a move, ten moves,
 * a sixth of the recording describing the wrong screen. It is not subtle
 * either: it reads as the payroll page claiming to be about attendance.
 *
 * So the old line is dropped before the click and the new one goes up only
 * once the topbar agrees we have arrived. Waiting on the title rather than on
 * a timer is also the assertion: rename a screen and the recording fails
 * instead of quietly captioning whatever happened to load.
 */
async function show(href, label, key) {
  await caption('');
  await page.locator(`a.nav-link[href="${href}"]`).click();
  await page.waitForFunction(
    (want) => document.querySelector('.topbar__title')?.textContent?.trim() === want,
    label,
    { timeout: 15000 },
  );
  await page.waitForSelector('.page', { timeout: 15000 });
  await caption(line(key));
  await page.waitForTimeout(600);
}

console.log(`walkthrough (captions: ${LANG}):`);

await serveWebfonts(context);

await step('open sign-in', async () => {
  await page.goto(BASE + '/login');
  await page.waitForSelector('.auth__card');
  await assertFontsLoaded();
  await caption(line('intro'));
  await beat(1400);
});

await step('type credentials', async () => {
  await page.getByPlaceholder('you@company.com').type('ceo@cwork.example', { delay: 45 });
  await page.locator('input[type=password]').type(seedPassword, { delay: 60 });
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
  await caption(line('mfa'));
  await beat(1500);
  const field = page.locator('.auth__card input').first();
  await field.type(totp(SECRET), { delay: 110 });
  await beat(500);
  await caption('');
  await page.getByRole('button', { name: 'ยืนยัน' }).click();
  await page.waitForSelector('.sidebar__nav', { timeout: 20000 });
  await caption(line('dashboard'));
  await beat(2400);
});

// [route, the console's own label for the log, caption key]
const tour = [
  ['/approvals', 'รออนุมัติ', 'approvals'],
  ['/employees', 'ทะเบียนพนักงาน', 'employees'],
  ['/leave', 'การลา', 'leave'],
  ['/attendance', 'ลงเวลาทำงาน', 'attendance'],
  ['/payroll', 'เงินเดือน', 'payroll'],
  ['/recruitment', 'ผู้สมัครงาน', 'recruitment'],
  ['/performance', 'ประเมินผล / KPI', 'performance'],
  ['/audit', 'บันทึกการใช้งาน', 'audit'],
];

for (const [href, label, key] of tour) {
  await step(label, async () => {
    await show(href, label, key);
    await beat(1900);

    // The payroll run is the one screen worth opening: the payslips behind it
    // are computed by the real Thai tax and social-security code.
    if (href === '/payroll') {
      const open = page.locator('a.btn', { hasText: 'เปิดดู' }).first();
      if (await open.count()) {
        // Opening a run keeps the topbar title, so there is no arrival to wait
        // for. Clearing still means the worst case is a moment with no caption
        // rather than a moment with the wrong one.
        await caption('');
        await open.click();
        await page.waitForSelector('.page', { timeout: 15000 });
        await page.waitForTimeout(400);
        await caption(line('payslip'));
        await beat(2800);
      }
    }
  });
}

await step('dark mode', async () => {
  await caption('');
  await page.getByTitle('สลับธีมสว่าง/มืด').click();
  await caption(line('close'));
  await beat(2800);
});

console.log(problems.length ? `console errors: ${problems.length}` : 'no console errors');
for (const p of problems.slice(0, 5)) console.log('   ', p.slice(0, 140));

await page.close();
await context.close();
await browser.close();
