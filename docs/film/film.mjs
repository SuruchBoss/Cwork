// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Records the product film on the landing page and in the READMEs.
 *
 * A marketing film, not a tour: the landing page's six problems, each told by
 * real people doing real work — a payroll officer opening September and
 * calculating it, an HR manager approving it, an employee clocking in on a
 * site with no signal, filing leave from their phone and watching the
 * weekend and a public holiday drop out of the count, their manager approving
 * it from the console. Every field is typed into and every button pressed on
 * camera, against the company `npm run db:seed` builds. Nothing is mocked:
 * if a screen breaks, the film breaks with it.
 *
 * It is recorded on stage.html — one 1920×1080 page holding the console once
 * per role (each on its own origin, so five people are signed in at once) and
 * the employee app in a phone — as a single continuous take from Chromium's
 * compositor (rig.mjs). Captions, chapter cards, the cursor and the seal are
 * drawn by the stage; the screens are the product.
 *
 * Needs the API on a fresh seed, Flutter, Playwright and ffmpeg. The film is
 * a working Monday morning, so unless it is one, pin the clock — one offset
 * for Postgres, the seed and the API alike, or their timestamps disagree on
 * screen (see docs/screenshots/clock.mjs and pin-clock.sql):
 *
 *   OFF=$(( $(date -u -d '2026-09-28 01:37' +%s) - $(date -u +%s) ))   # 08:37 in Bangkok
 *   LD_PRELOAD=…/libfaketime.so.1 FAKETIME=+${OFF}s pg_ctl … start    # the database
 *   cd backend && npx prisma migrate deploy
 *   psql -v offset=$OFF -f ../docs/film/pin-clock.sql                   # see the file
 *   DONT_FAKE_MONOTONIC=1 faketime -f "+${OFF}s" npm run db:seed
 *   CORS_ORIGINS=http://app.localhost:7001 DONT_FAKE_MONOTONIC=1 \
 *     faketime -f "+${OFF}s" node dist/main.js
 *   SEED_PASSWORD=… FILM_LANG=th node docs/film/film.mjs   # landing/, README.th.md
 *   SEED_PASSWORD=… FILM_LANG=en node docs/film/film.mjs   # landing/en/, README.md
 *
 * A take changes the data it films (a run is calculated, leave is approved),
 * so seed again before the second language. RECORD=0 rehearses without
 * recording. Writes landing/assets/film.<lang>.mp4 and its poster beside it:
 * the title card with a play button, which the landing page shows until the
 * film is played and the READMEs link to it with, since GitHub will not play
 * a video from the repository inline. POSTER_ONLY=1 makes just the poster.
 *
 * The one piece of preparation done off camera is giving the demo staff
 * national ID numbers, which the seed leaves empty: the PDPA chapter is about
 * who may see them. They are generated, valid in form, and belong to no one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { thMessages } from '../../web/src/lib/i18n/messages.th.ts';
import { totp } from '../demo/totp.mjs';
import { followApiClock } from '../screenshots/clock.mjs';
import { COPY, keys } from './copy.mjs';
import { buildApp, buildConsole, director, encode, record, routeGoogle, serve } from './rig.mjs';

const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword) {
  console.error('Set SEED_PASSWORD to the password `npm run db:seed` was given.');
  process.exit(1);
}
const LANG = process.env.FILM_LANG === 'en' ? 'en' : 'th';
const RECORD = process.env.RECORD !== '0';

const drift = keys(COPY.th)
  .filter((k) => !keys(COPY.en).includes(k))
  .concat(keys(COPY.en).filter((k) => !keys(COPY.th).includes(k)));
if (drift.length > 0) {
  console.error(`copy.mjs: keys missing a language: ${drift.join(', ')}`);
  process.exit(1);
}
const C = COPY[LANG];

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const PORT = 7001;
const origin = (host) => `http://${host}.localhost:${PORT}`;
const SECRET = 'CWORKDEMOMFASECRET234567';
const OUT = join(repo, 'landing', 'assets', `film.${LANG}.mp4`);
/** A few metres from the seeded head office on Sathorn, inside its geofence. */
const AT_THE_OFFICE = { latitude: 13.72118, longitude: 100.52856 };

// ------------------------------------------------------------ interface text
/** The console's label for an English key, in this take's language. */
const ui = (key) => (LANG === 'th' ? (thMessages[key] ?? key) : key);
/** The same for the employee app, whose Thai catalogue is Dart. */
const dartTh = Object.fromEntries(
  [
    ...readFileSync(join(repo, 'mobile/lib/core/i18n/messages_th.dart'), 'utf8').matchAll(
      /'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g,
    ),
  ].map((m) => [m[1], m[2]]),
);
const app = (key) => (LANG === 'th' ? (dartTh[key] ?? key) : key);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = (s) => ({ name: s, exact: true });
const starts = (s) => ({ name: new RegExp(`^${esc(s)}`) });
const has = (s) => ({ name: new RegExp(esc(s)) });

/** Who is signed in where. The CEO signs in on camera, in chapter five. */
const ROLES = {
  hr: { email: 'hr.manager@cwork.example', mfa: true },
  pay: { email: 'payroll@cwork.example', mfa: true },
  mgr: { email: 'eng.manager@cwork.example' },
  ofc: { email: 'hr.officer@cwork.example' },
  ceo: { email: 'ceo@cwork.example', mfa: true, onCamera: true },
};

// -------------------------------------------------------------------- stage
const consoleDir = buildConsole(repo);
const appDir = buildApp(repo, API);
const server = await serve({
  port: PORT,
  stageDir: here,
  consoleDir,
  appDir,
  api: new URL(API).origin,
});
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: LANG === 'th' ? 'th-TH' : 'en-GB',
  timezoneId: 'Asia/Bangkok',
  geolocation: AT_THE_OFFICE,
  permissions: ['geolocation'],
});
const fonts = new Set();
await routeGoogle(context, appDir, fonts);
const offset = await followApiClock(context, `${API}/config`);
await context.addInitScript((lang) => {
  try {
    if (!localStorage.getItem('cwork.ui')) {
      localStorage.setItem(
        'cwork.ui',
        JSON.stringify({
          state: { theme: 'light', language: lang, languageExplicit: true },
          version: 0,
        }),
      );
    }
    localStorage.setItem('flutter.cwork.language', JSON.stringify(lang));
  } catch {
    // Storage can be unavailable on about:blank; nothing there needs it.
  }
}, LANG);

const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(origin('stage'));
const film = (method, ...args) => page.evaluate(([m, a]) => window.film[m](...a), [method, args]);
const d = director(page);
const pause = d.pause;

await film('title', C.title.h2, C.title.sub);

// The poster: the title card with a play button. POSTER_ONLY=1 stops here,
// for when only the still needs redoing.
await pause(2500);
await film('poster', ...C.poster);
const poster = OUT.replace(/\.mp4$/, '.webp');
const still = join(tmpdir(), `cwork-poster-${LANG}.png`);
await page.screenshot({ path: still });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', still, '-quality', '84', poster]);
await film('poster');
if (process.env.POSTER_ONLY === '1') {
  console.log(`wrote ${poster}`);
  await browser.close();
  server.close();
  process.exit(0);
}

for (const role of Object.keys(ROLES))
  await film('mount', `c-${role}`, 'desk', `${origin(role)}/login`);
await film('mount', 'p-emp', 'phone', origin('app'));
// Under the title card, so everything can be clicked while it is covered.
await film('layout', 'both');

const c = (role) => page.frameLocator(`#c-${role}`);
const phone = page.frameLocator('#p-emp');
const frameOf = (host) => page.frames().find((f) => f.url().startsWith(origin(host)));

/** Client-side navigation, the way a link would — no reload on camera. */
async function nav(role, path, ready) {
  await frameOf(role).evaluate((p) => {
    history.pushState(null, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  if (ready) await ready.waitFor({ timeout: 20000 });
  await pause(400);
}

/** Waits for the start of a TOTP step on the API's clock: codes are single-use. */
async function freshStep() {
  const into = (Date.now() + offset) % 30000;
  if (into > 25000) await pause(30000 - into + 400);
}

async function signIn(role) {
  const { email, mfa } = ROLES[role];
  const f = c(role);
  const next = mfa ? f.locator('input[autocomplete=one-time-code]') : f.locator('.sidebar__nav');
  // The form can re-mount once the app has checked for a stored session,
  // taking what was typed with it; so fill, send, and try again if nothing moved.
  for (let attempt = 0; ; attempt += 1) {
    await f.locator('input[type=password]').waitFor({ timeout: 20000 });
    await pause(600);
    await f.locator('input[type=email]').fill(email);
    await f.locator('input[type=password]').fill(seedPassword);
    await f.locator('input[type=password]').press('Enter');
    try {
      await next.waitFor({ state: 'attached', timeout: 6000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  if (mfa) {
    const code = f.locator('input[autocomplete=one-time-code]');
    await freshStep();
    await code.fill(totp(SECRET, Date.now() + offset));
    await code.press('Enter');
  }
  await f.locator('.sidebar__nav').waitFor({ state: 'attached', timeout: 20000 });
}

/** Flutter paints a canvas; its semantics tree is what can be found and pressed. */
async function appSemantics() {
  const placeholder = phone.locator('flt-semantics-placeholder');
  await placeholder.waitFor({ state: 'attached', timeout: 30000 });
  await placeholder.evaluate((el) => el.click());
  await phone.locator('flt-semantics').first().waitFor({ state: 'attached', timeout: 10000 });
}

/** A fresh start of the app, signed in: the session survives a reload, the screen stack does not. */
async function appHome() {
  await frameOf('app').goto(origin('app'));
  await appSemantics();
  await phone
    .getByRole('tab', exact(app('Profile')))
    .waitFor({ state: 'attached', timeout: 20000 });
  await pause(1500);
}

/** The field has focus and holds exactly `text`, or it is typed again. */
async function typed(frameName, text, delay) {
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.type(text, { delay });
    await pause(250);
    const value = await frameOf(frameName).evaluate(() => document.activeElement?.value);
    if (value === text || value === undefined) return;
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
  }
  throw new Error(`could not type "${text}"`);
}

/** A tap on the phone: a fingertip, not a pointer, and nothing left hovering after. */
async function tap(locator, opts) {
  await film('cursorMode', 'touch');
  const box = await d.click('p-emp', locator, opts);
  await page.mouse.move(4, 4);
  await film('cursorMode', 'touch hidden');
  return box;
}

async function tapType(locator, text) {
  await tap(locator);
  await pause(250);
  await typed('app', text, 45);
}

/** The part of the stage where the console is actually visible. */
const screenRect = () =>
  page.evaluate(() => {
    const r = document.querySelector('#desk .screen').getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  });

async function click(role, locator, opts) {
  await film('cursorMode', '');
  const b = await d.stageBox(`c-${role}`, locator);
  const s = await screenRect();
  const x = b.x + b.w / 2;
  const y = b.y + b.h / 2;
  if (x < s.l || x > s.r || y < s.t || y > s.b) {
    throw new Error(
      `a ${role} click at ${Math.round(x)},${Math.round(y)} is off the visible screen`,
    );
  }
  return d.click(`c-${role}`, locator, opts);
}

async function write(role, locator, text, delay = 34) {
  await click(role, locator);
  await typed(role, text, delay);
}

/** A date or time input: its value appears the way a picker would leave it. */
async function setValue(role, locator, value) {
  await click(role, locator, { hold: 150 });
  await locator.fill(value);
  await pause(350);
}

/** Selects an option by (part of) its visible text. */
async function choose(role, locator, text) {
  await click(role, locator, { hold: 150 });
  const value = await locator.evaluate(
    (el, t) => [...el.options].find((o) => o.textContent.includes(t))?.value,
    text,
  );
  if (value === undefined) throw new Error(`no option containing "${text}"`);
  await locator.selectOption(value);
  await pause(450);
}

/**
 * Magnifies the console onto what the viewer should read: the union of the
 * given elements, as large as `scale` but never so large that part of it —
 * the button about to be pressed, say — falls outside the window.
 */
async function zoomOn(role, targets, scale = 1.45) {
  const rects = [];
  for (const t of [targets].flat()) {
    rects.push(
      await t.evaluate((el) => {
        const b = el.getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom };
      }),
    );
  }
  const l = Math.min(...rects.map((r) => r.l));
  const t = Math.min(...rects.map((r) => r.t));
  const r = Math.max(...rects.map((x) => x.r));
  const b = Math.max(...rects.map((x) => x.b));
  const fit = Math.min(scale, (1440 * 0.92) / (r - l), (810 * 0.86) / (b - t));
  await film('zoom', (l + r) / 2, (t + b) / 2, Math.max(1, fit));
  await pause(720);
}
const unzoom = async () => {
  await film('zoom');
  await pause(680);
};

/** Rearranges the stage and waits for the move to finish: a click aimed mid-move misses. */
async function layout(name) {
  await film('layout', name);
  await pause(720);
}

/** A fresh load of a console page, off camera, so its lists are not served from cache. */
async function reload(role, path, ready) {
  await frameOf(role).goto(origin(role) + path);
  await ready.waitFor({ timeout: 20000 });
  await pause(500);
}

/**
 * A page from the console's own sidebar, starting at its top: the console
 * keeps the scroll position between pages, and the last page may have been
 * scrolled to reach something low down.
 */
async function goTo(role, href, onCamera = true) {
  const link = c(role).locator(`a[href="${href}"]`).first();
  if (onCamera) await click(role, link);
  else await link.evaluate((a) => a.click());
  await pause(500);
  await frameOf(role).evaluate(() => {
    document.scrollingElement?.scrollTo(0, 0);
    document.querySelectorAll('main, .main, .content').forEach((el) => el.scrollTo?.(0, 0));
  });
  await pause(300);
}

/**
 * Pull to refresh, with a finger: the app's lists refresh that way and no
 * other, and a mouse drag does not count as one on the web.
 */
const touch = await context.newCDPSession(page);
async function pull(locator) {
  const b = await d.stageBox('p-emp', locator);
  const x = b.x + b.w / 2;
  const y0 = b.y + b.h / 2;
  await film('cursorMode', 'touch');
  await d.glide(x, y0, 450);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 18; i += 1) {
    const y = y0 + i * 15;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await film('cursorTo', x, y, 24);
    await pause(24);
  }
  await pause(250);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await film('cursorMode', 'touch hidden');
}

async function chapter(n, key, kanji) {
  await film('chapter', { n, kanji, eyebrow: C.eyebrow(n), title: C[key].title, fix: C[key].fix });
  await film('rail', { n, kanji, title: C[key].rail, foot: C[key].foot });
}

async function roleOn(role, url) {
  await film('role', `c-${role}`, C.roles[role], `${role} · ${url}`);
}

// ------------------------------------------------------------ off camera
let stop = null;
try {
  console.log(`signing in (${LANG})`);
  for (const [role, { onCamera }] of Object.entries(ROLES)) if (!onCamera) await signIn(role);

  await appSemantics();
  {
    const email = phone.getByLabel(app('Email'), { exact: true });
    await email.click();
    await typed('app', 'dev2@cwork.example', 30);
    await phone.getByLabel(app('Password'), { exact: true }).click();
    await typed('app', seedPassword, 30);
    await phone.getByRole('button', exact(app('Sign in'))).click();
    await phone
      .getByRole('tab', exact(app('Profile')))
      .waitFor({ state: 'attached', timeout: 20000 });
  }

  // Demo national IDs (see the header): valid check digits, nobody's number.
  const EMPLOYEES = await frameOf('hr').evaluate(async () => {
    const { state } = JSON.parse(localStorage.getItem('cwork.session'));
    const headers = {
      authorization: `Bearer ${state.accessToken}`,
      'content-type': 'application/json',
    };
    const list = await (await fetch('/api/v1/employees?limit=50', { headers })).json();
    const rows = list.data;
    if (!Array.isArray(rows)) throw new Error(`employees: ${JSON.stringify(list).slice(0, 200)}`);
    const byCode = {};
    for (const [i, e] of rows.entries()) {
      const digits =
        `1103${String(70231 + i * 3917).padStart(5, '0')}${String(10 + i * 7).padStart(3, '0')}`.slice(
          0,
          12,
        );
      const sum = [...digits].reduce((s, ch, k) => s + Number(ch) * (13 - k), 0);
      const nationalId = digits + ((11 - (sum % 11)) % 10);
      await fetch(`/api/v1/employees/${e.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ nationalId }),
      });
      byCode[e.employeeCode] = e.id;
    }
    return byCode;
  });
  if (!EMPLOYEES['EMP-0007']) throw new Error('could not find the demo employees');
  const DEV2 = EMPLOYEES['EMP-0007'];

  // Everyone on the page they start from.
  await nav('hr', '/recruitment', c('hr').locator('.pipeline__card').first());
  await nav('pay', '/payroll');
  await nav('mgr', '/approvals');
  await nav('ofc', '/approvals');
  await pause(2500);
  for (const family of ['anuphan', 'ibmplexsansthai', 'notosansthai', 'roboto']) {
    if (!fonts.has(family))
      throw new Error(`${family} never loaded — refusing to record a fallback face`);
  }

  // --------------------------------------------------------------- the take
  stop = RECORD ? await record(page, join(tmpdir(), `cwork-film-${LANG}`)) : null;
  console.log(RECORD ? 'recording' : 'rehearsing');

  // Title.
  await layout('desk');
  await film('title', C.title.h2, C.title.sub);
  await pause(4300);

  // 01 費 — the bill ------------------------------------------------------
  await chapter(1, 'c1', '費');
  await pause(2900);
  await roleOn('hr', '/recruitment');
  await film('reveal');
  await pause(800);
  await film('beat', C.c1.offer);
  {
    const h = c('hr');
    const card = h.locator('.pipeline__card', { hasText: 'ณัฐวุฒิ ศรีสุข' });
    await zoomOn('hr', h.locator('.pipeline').first(), 1.3);
    await click('hr', card.getByRole('button'));
    await pause(900);
    await click('hr', card.getByRole('button'));
    await pause(600);
    await film('beat', C.c1.hired);
    await film('callout', ...C.c1.callout);
    await d.park();
    await pause(2150);
    await film('callout');
    await unzoom();
  }

  // 02 給 — payroll -------------------------------------------------------
  await chapter(2, 'c2', '給');
  await pause(2900);
  await roleOn('pay', '/payroll');
  await film('reveal');
  await pause(700);
  await film('beat', C.c2.period);
  {
    const p = c('pay');
    await click('pay', p.getByRole('button', has(ui('New pay period'))));
    await zoomOn(
      'pay',
      [
        p.getByLabel(ui('Year'), { exact: true }),
        p.getByRole('button', exact(ui('Create period'))),
      ],
      1.45,
    );
    await setValue('pay', p.getByLabel(ui('Period start'), { exact: true }), '2026-09-01');
    await setValue('pay', p.getByLabel(ui('Period end'), { exact: true }), '2026-09-30');
    await setValue('pay', p.getByLabel(ui('Pay date'), { exact: true }), '2026-09-30');
    await click('pay', p.getByRole('button', exact(ui('Create period'))));
    const period = p.getByRole('row', { name: /2026-09/ });
    await period.waitFor({ timeout: 15000 });
    await unzoom();
    await film('beat', C.c2.calc);
    await click('pay', period.getByRole('button', exact(ui('Create run'))));
    await pause(700);
    await click('pay', p.getByRole('link', exact(ui('Open'))).first());
    const calculate = p.getByRole('button', exact(ui('Calculate payroll')));
    await calculate.waitFor({ timeout: 15000 });
    await pause(500);
    await click('pay', calculate);
    const alert = p.locator('.alert--info');
    await alert.waitFor({ timeout: 30000 });
    await film('beat', C.c2.done);
    await film('callout', ...C.c2.callout);
    await d.park();
    await pause(1950);
    await film('callout');
    await film('beat', C.c2.checker);
    await zoomOn('pay', alert, 1.5);
    await pause(1550);
    await unzoom();

    // The same run, from the HR manager's chair.
    const runPath = await frameOf('pay').evaluate(() => location.pathname);
    const approve = c('hr').getByRole('button', exact(ui('Approve run')));
    await nav('hr', runPath, approve);
    await roleOn('hr', runPath);
    await film('beat', C.c2.approve);
    await pause(900);
    const box = await click('hr', approve);
    await film('stamp', box.x + box.w / 2 - 120, box.y + 140, C.c2.stamp);
    await pause(1700);
  }
  {
    // The employee's end of it.
    await layout('phone');
    await film('beat', C.c2.payslip);
    await tap(phone.getByRole('tab', exact(app('Slips'))));
    await pause(800);
    await tap(
      phone.getByRole('button', starts(app('Period {code}').replace('{code}', ''))).first(),
    );
    await pause(2450);
  }

  // 03 勤 — attendance ----------------------------------------------------
  await chapter(3, 'c3', '勤');
  await appHome();
  await pause(600);
  await film('reveal');
  await pause(800);
  await film('beat', C.c3.offline);
  await film('badge', C.c3.badgeOff);
  await context.setOffline(true);
  await pause(1050);
  await tap(phone.getByRole('button', exact(app('Clock in'))));
  await film('beat', C.c3.saved);
  await pause(2600);
  await context.setOffline(false);
  await film('badge', C.c3.badgeOn, true);
  await film('beat', C.c3.online);
  await pause(1250);
  await tap(phone.getByRole('button', exact(app('Try again'))));
  await pause(1950);
  await film('badge');
  {
    // HR's view, a moment later.
    await reload('hr', '/attendance', c('hr').getByRole('row', { name: /อนุชา/ }).first());
    await roleOn('hr', '/attendance');
    await layout('both');
    await film('beat', C.c3.hr);
    await zoomOn('hr', c('hr').getByRole('row', { name: /อนุชา/ }).first(), 1.5);
    await pause(1800);
    await unzoom();
  }
  {
    await layout('desk');
    await film('beat', C.c3.shift);
    const h = c('hr');
    await goTo('hr', '/roster');
    await click('hr', h.getByRole('button', exact(ui('Shifts'))));
    await click('hr', h.getByRole('button', has(ui('Add shift'))));
    await zoomOn(
      'hr',
      [
        h.getByLabel(ui('Shift code'), { exact: true }),
        h.getByLabel(ui('Grace (minutes)'), { exact: true }),
        h.getByRole('button', exact(ui('Save'))),
      ],
      1.45,
    );
    await write('hr', h.getByLabel(ui('Shift code'), { exact: true }), 'EARLY');
    await write('hr', h.getByLabel(ui('Shift name'), { exact: true }), C.c3.shiftName);
    await setValue('hr', h.getByLabel(ui('Start time'), { exact: true }), '07:00');
    await setValue('hr', h.getByLabel(ui('End time'), { exact: true }), '16:00');
    await click('hr', h.getByRole('button', exact(ui('Save'))));
    await unzoom();
    await h.getByRole('row', { name: /EARLY/ }).waitFor({ timeout: 15000 });
    await zoomOn('hr', h.getByRole('row', { name: /EARLY/ }), 1.4);
    await d.park();
    await pause(1300);
    await unzoom();
  }

  // 04 承 — approvals -----------------------------------------------------
  await chapter(4, 'c4', '承');
  await pause(2900);
  await layout('phone');
  await film('reveal');
  await pause(700);
  await film('beat', C.c4.file);
  await tap(phone.getByRole('tab', exact(app('Leave'))));
  await pause(900);
  await tap(phone.getByRole('button', exact(app('Request leave'))));
  await pause(800);
  await tap(phone.getByRole('button', starts(app('Leave type'))));
  await pause(500);
  await tap(phone.getByRole('menuitem', exact('ลาพักร้อน')));
  await pause(500);
  await tap(phone.getByRole('button', starts(app('Leave dates'))));
  await pause(900);
  {
    const month = LANG === 'th' ? 'ตุลาคม' : 'October';
    const day = (n) => phone.getByRole('button', { name: new RegExp(`^${n}, .*${month}`) }).first();
    await tap(day(22));
    await pause(350);
    await tap(day(26));
    await pause(600);
    await tap(phone.getByRole('button', exact(LANG === 'th' ? 'บันทึก' : 'Save')));
    await pause(700);
  }
  await tapType(phone.getByLabel(app('Reason (optional)'), { exact: true }), C.c4.reason);
  await page.mouse.move(4, 4);
  await pause(1000);
  await film('beat', C.c4.charged);
  await pause(2700);
  await tap(phone.getByRole('button', exact(app('Submit request'))));
  await pause(1000);
  {
    // The manager's inbox, refreshed off screen.
    await reload('mgr', '/approvals', c('mgr').getByRole('row', { name: /อนุชา/ }));
    await roleOn('mgr', '/approvals');
    await layout('both');
    await film('beat', C.c4.inbox);
    const row = c('mgr').getByRole('row', { name: /อนุชา/ });
    await zoomOn('mgr', c('mgr').getByRole('table'), 1.45);
    const box = await click('mgr', row.getByRole('button', exact(ui('Approve'))));
    await film('stamp', box.x - 60, box.y + 40, C.c4.stamp);
    await pause(1250);
    const expense = c('mgr').getByRole('row', { name: /สุชานาถ/ });
    if (await expense.count())
      await click('mgr', expense.getByRole('button', exact(ui('Approve'))));
    await pause(600);
    await unzoom();
    await film('beat', C.c4.known);
    await pull(phone.getByText(app('My leave requests'), { exact: true }));
    await pause(2150);
  }
  {
    await film('beat', C.c4.doc);
    await tap(phone.getByRole('tab', exact(app('Profile'))));
    await pause(800);
    await tap(phone.getByRole('button', starts(app('Request a document'))));
    await pause(800);
    await tap(phone.getByRole('button', starts(app('Document type'))));
    await pause(500);
    await tap(phone.getByRole('menuitem', exact(app('Employment certificate'))));
    await pause(500);
    await tapType(phone.getByLabel(app('Purpose'), { exact: true }), C.c4.purpose);
    await page.mouse.move(4, 4);
    await tap(phone.getByRole('button', exact(app('Submit request'))));
    await pause(1050);

    await reload('ofc', '/approvals', c('ofc').getByRole('row', { name: /อนุชา/ }));
    await roleOn('ofc', '/approvals');
    await layout('desk');
    const row = c('ofc').getByRole('row', { name: /อนุชา/ });
    await zoomOn('ofc', row, 1.4);
    const box = await click('ofc', row.getByRole('button', exact(ui('Approve'))));
    await film('stamp', box.x - 60, box.y + 40, C.c4.stamp);
    await pause(1050);
    await unzoom();
    await film('beat', C.c4.issue);
    await goTo('ofc', '/documents');
    await roleOn('ofc', '/documents');
    const issueRow = c('ofc').getByRole('row', { name: /อนุชา/ });
    await zoomOn('ofc', issueRow, 1.4);
    await click('ofc', issueRow.getByRole('button', exact(ui('Issue'))));
    await pause(700);
    await unzoom();
    await choose('ofc', c('ofc').getByLabel(ui('Status'), { exact: true }), ui('Issued'));
    await zoomOn('ofc', c('ofc').getByRole('row', { name: /อนุชา/ }), 1.4);
    await d.park();
    await pause(1500);
    await unzoom();
  }

  // 05 守 — PDPA ----------------------------------------------------------
  await chapter(5, 'c5', '守');
  await pause(2900);
  await roleOn('ceo', '/login');
  await layout('desk');
  await film('reveal');
  await pause(700);
  await film('beat', C.c5.password);
  {
    const f = c('ceo');
    await zoomOn('ceo', f.locator('.auth__card'), 1.5);
    await write('ceo', f.getByLabel(ui('Email'), { exact: true }), ROLES.ceo.email, 26);
    await write('ceo', f.getByLabel(ui('Password'), { exact: true }), seedPassword, 30);
    await click('ceo', f.getByRole('button', exact(ui('Sign in'))));
    const code = f.getByLabel(ui('Verification code'), { exact: true });
    await code.waitFor({ timeout: 15000 });
    await film('beat', C.c5.code);
    await pause(900);
    await freshStep();
    await write('ceo', code, totp(SECRET, Date.now() + offset), 90);
    await click('ceo', f.getByRole('button', exact(ui('Verify'))));
    await f.locator('.sidebar__nav').waitFor({ timeout: 20000 });
    await unzoom();
    await d.park();
    await pause(900);
  }
  {
    const id = (role) =>
      c(role)
        .getByText(/••••|\d{13}/)
        .first();
    await nav('ofc', `/employees/${DEV2}`, id('ofc'));
    await roleOn('ofc', `/employees/${DEV2}`);
    await film('beat', C.c5.masked);
    await zoomOn('ofc', id('ofc'), 1.8);
    await pause(1550);
    await unzoom();

    await nav('hr', `/employees/${DEV2}`, id('hr'));
    await roleOn('hr', `/employees/${DEV2}`);
    await film('beat', C.c5.full);
    await zoomOn('hr', id('hr'), 1.8);
    await pause(1550);
    await unzoom();

    await film('beat', C.c5.audit);
    const h = c('hr');
    await goTo('hr', '/audit');
    await roleOn('hr', '/audit');
    await choose('hr', h.getByLabel(ui('Action type'), { exact: true }), 'READ');
    await write('hr', h.getByLabel(ui('Entity type'), { exact: true }), 'Employee', 60);
    const row = h.getByRole('row', { name: /hr\.manager/ }).first();
    await row.waitFor({ timeout: 15000 });
    await d.park();
    await zoomOn('hr', row, 1.45);
    await film('callout', ...C.c5.callout);
    await pause(2450);
    await film('callout');
    await unzoom();
  }

  // 06 循 — one system ----------------------------------------------------
  await chapter(6, 'c6', '循');
  await goTo('hr', '/benefits', false);
  await roleOn('hr', '/benefits');
  await pause(2450);
  await film('reveal');
  await pause(700);
  {
    const h = c('hr');
    await film('beat', C.c6.benefit);
    await click('hr', h.getByRole('button', exact(ui('Enrol employees'))));
    await zoomOn(
      'hr',
      [
        h.getByLabel(ui('Employee'), { exact: true }),
        h.getByLabel(ui('To (blank = ongoing)'), { exact: true }),
        h.getByRole('button', exact(ui('Enrol'))),
      ],
      1.4,
    );
    await choose('hr', h.getByLabel(ui('Employee'), { exact: true }), 'EMP-0007');
    await choose('hr', h.getByLabel(ui('Benefit plan'), { exact: true }), 'ประกันสุขภาพกลุ่ม');
    await click('hr', h.getByRole('button', exact(ui('Enrol'))));
    await pause(1500);
    await unzoom();

    await film('beat', C.c6.policy);
    await goTo('hr', '/knowledge');
    await roleOn('hr', '/knowledge');
    await click('hr', h.getByRole('button', has(ui('Add document'))));
    await zoomOn(
      'hr',
      [
        h.getByLabel(ui('Document title'), { exact: true }),
        h.getByLabel(ui('Content'), { exact: true }),
        h.getByRole('button', exact(ui('Save and publish'))),
      ],
      1.35,
    );
    await write('hr', h.getByLabel(ui('Document title'), { exact: true }), C.c6.docTitle, 34);
    await write('hr', h.getByLabel(ui('Category'), { exact: true }), C.c6.docCategory, 34);
    await click('hr', h.getByLabel(ui('Content'), { exact: true }));
    await page.keyboard.type(C.c6.docBody, { delay: 12 });
    await click('hr', h.getByRole('button', exact(ui('Save and publish'))));
    await unzoom();
    await pause(1050);

    await film('beat', C.c6.kpi);
    await goTo('hr', '/performance');
    await roleOn('hr', '/performance');
    await d.park();
    await pause(1800);

    await film('beat', C.c6.lang);
    await click('hr', h.getByRole('button', exact(ui('Language'))));
    await d.park();
    await pause(1800);
    await film('beat', C.c6.theme);
    await click('hr', h.getByRole('button', { name: /dark theme|ธีมมืด/ }));
    await d.park();
    await pause(1900);
  }

  // End.
  await film('cursorMode', 'hidden');
  await film('end', C.end.h2, C.end.cmd);
  await pause(6000);
} catch (error) {
  // Lift every card and show every screen, so the picture says what went wrong.
  const shot = join(tmpdir(), 'cwork-film-failure.png');
  await page
    .evaluate(() => {
      window.film.reveal();
      window.film.layout('both');
      window.film.role('c-hr', '', '');
    })
    .catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: shot }).catch(() => {});
  console.error(`Failed; the stage is at ${shot}`);
  await browser.close();
  server.close();
  throw error;
}

if (stop) {
  const take = await stop();
  console.log(`encoding ${take.frames.length} frames`);
  encode(take, OUT, join(tmpdir(), `cwork-film-${LANG}`));
  console.log(`wrote ${OUT}`);
}
if (errors.length) console.warn(`the stage threw: ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
server.close();
