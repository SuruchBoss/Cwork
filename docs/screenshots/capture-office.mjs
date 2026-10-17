// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Takes the office-side screenshots and the two short clips for the READMEs
 * and the landing page: the fingerprint-scanner import, the check against
 * filings, the cash-preparation sheet and the expiring-documents list.
 *
 * Same idea as capture.mjs and docs/demo/record.mjs: it drives the real console,
 * signed in as a seeded account with a real second factor, against the company
 * `npm run db:seed` builds, so a picture cannot show a screen the product does
 * not have. Everything it shows is synthetic: the seed's people and payslips,
 * plus a scanner file and a few document dates this script makes up. Nothing is
 * read from a real company.
 *
 * It changes the database it runs against (it registers scanner numbers, sets
 * document dates and imports three scanner files), so run it on a database that
 * was seeded for it and throw that database away afterwards.
 *
 *   cd backend && SEED_PASSWORD=… npm run db:seed && npm run start:dev
 *   cd web && npm run dev
 *   SEED_PASSWORD=… node docs/screenshots/capture-office.mjs [all|stills|clips]
 *
 * Needs Playwright, ffmpeg with libwebp, and pdftoppm (poppler) for the cash
 * sheet, which is a PDF. None is a project dependency. Run it from the 14th of a
 * month on: the scanner files cover the first twelve weekdays of the month
 * (SCAN_MONTH=2026-10 picks another month), and that month must not have been
 * paid, or the days are locked and the review page has nothing to decide.
 *
 * Three files are made, and every one is imported once, because a day that is
 * already in Cwork shows as "already as it is" and not as new:
 *
 *   A  the Thai clip       B  the English clip       C  the preview stills
 *
 * What it writes (Thai at the top of docs/screenshots, English in en/):
 *
 *   24-scanner-days.png            the review page, days waiting for HR with the raw times
 *   25-scanner-preview.png         a file checked, before it is imported
 *   26-check-filings.png           the totals filed, one of them different
 *   27-parallel-run.png            HR's own figures, the people and columns that differ
 *   28-cash-sheet.png              page one of the cash-preparation sheet (Thai only)
 *   29-documents-expiring.png      passports and work permits by how soon they end
 *
 *   landing/assets/shots/<key>.<lang>.webp       the same, 1280×800 at 2×
 *   docs/demo/office.<lang>.webp                 the clip, animated, for the landing page
 *   landing/assets/office.<lang>.webp            the same file, where the landing page reads it
 *   docs/demo/office.<lang>.gif                  the clip, for the README
 *
 * The cash sheet is one document with no English edition, so there is one
 * picture and it is written to both folders. The clip is the journey as the
 * console has it: choose the file, read the preview, import, then decide a day
 * on the review page (a day exists to decide only once it is imported).
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { totp } from "../demo/totp.mjs";
import { followApiClock } from "./clock.mjs";

const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword) {
  console.error(
    "Set SEED_PASSWORD to the password `npm run db:seed` was given.",
  );
  process.exit(1);
}
const MODE = process.argv[2] ?? "all";
if (!["all", "stills", "clips"].includes(MODE)) {
  console.error(
    "Usage: node docs/screenshots/capture-office.mjs [all|stills|clips]",
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const API = process.env.API_URL ?? "http://localhost:3000/api/v1";
const SECRET = "CWORKDEMOMFASECRET234567";
const ACCOUNT = "ceo@cwork.example";
const DESKTOP = { width: 1280, height: 800 };
const LANDING = join(repo, "landing", "assets", "shots");
const DEMO = join(repo, "docs", "demo");
const scratch = join(tmpdir(), "cwork-capture-office");

rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
mkdirSync(LANDING, { recursive: true });

/** The console's words for what the script clicks, by language. */
const UI = {
  chooseFile: { th: "เลือกไฟล์", en: "Choose a file" },
  importFile: { th: "นำเข้าไฟล์นี้", en: "Import this file" },
  reviewDays: { th: "ตรวจวันที่สแกน", en: "Review scanner days" },
  useTimes: { th: "ใช้เวลาเหล่านี้", en: "Use these times" },
  compare: { th: "เทียบ", en: "Compare" },
  tax: {
    th: "ภาษีหัก ณ ที่จ่ายที่ยื่น (บาท)",
    en: "Withholding tax filed (baht)",
  },
  sso: { th: "ประกันสังคมที่ยื่น (บาท)", en: "Social security filed (baht)" },
};
const ui = (language, key) => UI[key][language];

// ---------------------------------------------------------------------- API

/** A session on the API, for the set-up the pictures need. */
async function signIn() {
  const post = (path, body) =>
    fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, body: await res.json() }));
  const offset = await apiOffset();
  const first = await post("/auth/login", {
    email: ACCOUNT,
    password: seedPassword,
  });
  if (first.status !== 200)
    throw new Error(`sign-in refused (${first.status})`);
  const second = await post("/auth/mfa/verify", {
    challengeToken: first.body.challengeToken,
    code: totp(SECRET, Date.now() + offset),
  });
  if (second.status !== 200)
    throw new Error(`second factor refused (${second.status})`);
  return second.body.accessToken;
}

async function apiOffset() {
  const res = await fetch(`${API}/config`);
  const date = res.headers.get("date");
  return date ? new Date(date).getTime() - Date.now() : 0;
}

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const money = (value) => Number(value).toFixed(2);

// -------------------------------------------------------------- the scenario

/** The first twelve weekdays of the month, as `[d, m, y]`, in three runs of four. */
function scanDays() {
  const month = process.env.SCAN_MONTH ?? new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split("-").map(Number);
  const days = [];
  for (let d = 1; d <= 31 && days.length < 12; d += 1) {
    const date = new Date(Date.UTC(year, mon - 1, d));
    if (date.getUTCMonth() !== mon - 1) break;
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6)
      days.push([d, mon, year]);
  }
  if (days.length < 12)
    throw new Error(`${month} has fewer than twelve weekdays to use`);
  return [days.slice(0, 4), days.slice(4, 8), days.slice(8, 12)];
}

/**
 * One scanner file: UTF-16LE with a byte-order mark, tab-separated, no header,
 * every field closed with a comma (docs/qa/pilot-a-2026-10.md). Mostly two
 * times a day; a few days have one time or three, which wait for HR; one
 * number belongs to nobody yet.
 */
function scannerFile(people, days, variant) {
  const pad = (n) => String(n).padStart(2, "0");
  const lines = [];
  days.forEach(([d, m, y], dayIndex) => {
    people.forEach((person, personIndex) => {
      const minute = (personIndex * 7 + dayIndex * 3) % 20;
      const clockIn = `08:${pad(minute)}`;
      const clockOut = `17:${pad((minute * 2) % 40)}`;
      let times = `${clockIn} ${clockOut}`;
      // The days HR has to look at: one time, three, four, one (the clock-out only).
      if (personIndex === 1 && dayIndex === variant % 4) times = clockIn;
      if (personIndex === 3 && dayIndex === (variant + 2) % 4)
        times = `${clockIn} 12:03 ${clockOut}`;
      if (personIndex === 4 && dayIndex === (variant + 1) % 4) {
        times = `${clockIn} 12:03 13:01 ${clockOut}`;
      }
      if (personIndex === 2 && dayIndex === (variant + 3) % 4) times = clockOut;
      lines.push(
        [
          `${person.name} ,`,
          `${person.number} ,`,
          `${pad(d)}/${pad(m)}/${y} ,`,
          `${times} ,`,
          "",
        ].join("\t"),
      );
    });
    if (dayIndex < 2) {
      lines.push(
        [
          "ชั่วคราว ,",
          "777 ,",
          `${pad(d)}/${pad(m)}/${y} ,`,
          "08:30 17:30 ,",
          "",
        ].join("\t"),
      );
    }
  });
  const text = lines.join("\r\n") + "\r\n";
  return Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(text, "utf16le"),
  ]);
}

/** Registers a scanner number on five seeded people; they are the ones in the files. */
async function prepare(token) {
  const list = await call(token, "GET", "/employees?limit=20");
  const chosen = list.data.filter((e) => e.status === "ACTIVE").slice(0, 5);
  if (chosen.length < 5)
    throw new Error("the seed has fewer than five active employees");
  const people = [];
  for (const [index, employee] of chosen.entries()) {
    const number = String(101 + index);
    await call(token, "PATCH", `/employees/${employee.id}`, {
      scannerId: number,
    });
    people.push({ id: employee.id, number, name: employee.firstNameTh });
  }

  // Passports and work permits that end soon, relative to today, so the page
  // always shows every band and one that is already over.
  const inDays = (n) =>
    new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const documents = [
    [{ passportExpiresOn: inDays(-6) }],
    [{ workPermitExpiresOn: inDays(12) }],
    [{ passportExpiresOn: inDays(27) }, { workPermitExpiresOn: inDays(41) }],
    [{ workPermitExpiresOn: inDays(58) }],
    [{ passportExpiresOn: inDays(83) }],
    [{ passportExpiresOn: inDays(380) }],
  ];
  const everyone = list.data.filter((e) => e.status === "ACTIVE");
  for (const [index, patches] of documents.entries()) {
    const employee = everyone[index + 1] ?? everyone[index];
    for (const patch of patches)
      await call(token, "PATCH", `/employees/${employee.id}`, patch);
  }
  return people;
}

/**
 * The comparison inputs, worked out from the latest paid month's real figures:
 * the tax total matches what Cwork worked out, the social-security total is
 * fifty satang off, and HR's own file differs for two people.
 */
async function comparisonInputs(token) {
  const periods = await call(token, "GET", "/payroll/periods");
  const period = periods.find((p) => p.status === "CLOSED") ?? periods[0];
  const probe = await call(
    token,
    "POST",
    `/payroll/periods/${period.id}/compare`,
    {
      taxFiled: "0",
      ssoFiled: "0",
    },
  );
  const filedTax = money(probe.tax.cwork);
  const filedSso = money(Number(probe.sso.cwork) + 0.5);

  const runs = await call(token, "GET", "/payroll/runs");
  const run = runs.find((r) => r.periodId === period.id) ?? runs[0];
  const detail = await call(token, "GET", `/payroll/runs/${run.id}`);
  const employees = await call(token, "GET", "/employees?limit=20");
  const codeOf = new Map(employees.data.map((e) => [e.id, e.employeeCode]));
  const rows = detail.payslips.map((p, index) => {
    let tax = Number(p.withholdingTax);
    let sso = Number(p.ssoEmployee);
    let net = Number(p.netPay);
    // HR's sheet disagrees with the system for two people.
    if (index === 2) {
      tax += 12;
      net -= 12;
    }
    if (index === 5) {
      sso += 0.5;
      net -= 0.5;
    }
    return [
      codeOf.get(p.employeeId),
      money(p.grossEarnings),
      money(tax),
      money(sso),
      money(net),
    ];
  });
  const csv = [
    "Employee code,Gross,Tax,Social security,Net",
    ...rows.map((r) => r.join(",")),
  ].join("\n");
  return { periodId: period.id, run, filedTax, filedSso, csv };
}

// ----------------------------------------------------------------- the browser

const browser = await chromium.launch({
  // The English console uses the browser's own date field, which follows the
  // browser's language (the environment's, on Linux), not the page's locale:
  // without this it reads 10/07/2026 for 7 October.
  args: ["--lang=en-GB"],
  env: {
    ...process.env,
    LANGUAGE: "en_GB",
    LC_ALL: "en_GB.UTF-8",
    LANG: "en_GB.UTF-8",
  },
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});

function uiState(language, theme = "light") {
  return JSON.stringify({
    state: { theme, language, languageExplicit: true },
    version: 0,
  });
}

/** See serveWebfonts in capture.mjs: Node fetches the fonts the browser cannot. */
async function serveWebfonts(context) {
  const UA =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
  await context.route(
    /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
    async (route) => {
      try {
        const res = await fetch(route.request().url(), {
          headers: { "user-agent": UA },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await route.fulfill({
          status: 200,
          contentType:
            res.headers.get("content-type") ?? "application/octet-stream",
          body: Buffer.from(await res.arrayBuffer()),
        });
      } catch {
        await route.continue();
      }
    },
  );
}

async function freshStep(offset) {
  const into = (Date.now() + offset) % 30000;
  if (into > 3000)
    await new Promise((resolve) => setTimeout(resolve, 30000 - into + 400));
}

async function settle(page) {
  await page.waitForSelector(".page", { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.mouse.move(page.viewportSize().width - 8, 20);
  await page.evaluate(() => document.fonts.ready);
  const families = await page.evaluate(() =>
    [...document.fonts].map((f) => f.family).join(","),
  );
  if (!families.includes("IBM Plex Sans Thai")) {
    throw new Error(
      "IBM Plex Sans Thai never loaded — refusing to capture a fallback face",
    );
  }
  await page.waitForTimeout(500);
}

/**
 * A context for one language, signed in. `record` makes it record a video.
 * Signing in happens in a throw-away context so that no clip starts with a
 * login, and the session is carried over in `storageState`.
 */
async function openContext(language, { record = false } = {}) {
  const options = {
    viewport: DESKTOP,
    deviceScaleFactor: record ? 1 : 2,
    locale: language === "th" ? "th-TH" : "en-GB",
    timezoneId: "Asia/Bangkok",
  };
  const login = await browser.newContext(options);
  await serveWebfonts(login);
  const offset = await followApiClock(login, `${API}/config`);
  await login.addInitScript((state) => {
    if (!sessionStorage.getItem("capture-ui-set")) {
      localStorage.setItem("cwork.ui", state);
      sessionStorage.setItem("capture-ui-set", "1");
    }
  }, uiState(language));
  const page = await login.newPage();
  await freshStep(offset);
  await page.goto(BASE + "/login");
  await page.waitForSelector(".auth__card");
  await page.locator("input[type=email]").fill(ACCOUNT);
  await page.locator("input[type=password]").fill(seedPassword);
  await page.locator(".auth__card button[type=submit]").click();
  const code = page.locator(".auth__card input[autocomplete=one-time-code]");
  await code.waitFor({ timeout: 15000 });
  await code.fill(totp(SECRET, Date.now() + offset));
  await page.locator(".auth__card button[type=submit]").click();
  await page.waitForSelector(".sidebar__nav", { timeout: 20000 });
  const storageState = await login.storageState();
  await login.close();

  const context = await browser.newContext({
    ...options,
    storageState,
    ...(record
      ? {
          recordVideo: {
            dir: join(scratch, `video-${language}`),
            size: DESKTOP,
          },
        }
      : {}),
  });
  await serveWebfonts(context);
  await followApiClock(context, `${API}/config`);
  await context.addInitScript((state) => {
    localStorage.setItem("cwork.ui", state);
  }, uiState(language));
  return context;
}

function docsDir(language) {
  return language === "th"
    ? join(repo, "docs", "screenshots")
    : join(repo, "docs", "screenshots", "en");
}

async function webp(png, out) {
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    png,
    "-quality",
    "82",
    out,
  ]);
}

/** Writes a screenshot of the page where the README and the landing page expect it. */
async function shoot(page, language, key, docsName) {
  const png = join(scratch, `${key}.${language}.png`);
  await page.screenshot({ path: png });
  await webp(png, join(LANDING, `${key}.${language}.webp`));
  await page.screenshot({
    path: join(docsDir(language), `${docsName}.png`),
    scale: "css",
  });
  console.log(`  ${language} ${key}`);
}

/** Scrolls the card that holds the page's last table to the top of the view. */
const scrollToDays = (page) =>
  page.evaluate(() => {
    const tables = document.querySelectorAll("table.table");
    tables[tables.length - 1]
      ?.closest(".card")
      ?.scrollIntoView({ block: "start" });
  });

const upload = async (page, language, name, buffer) => {
  await page
    .locator("input[type=file]")
    .setInputFiles({ name, mimeType: "application/octet-stream", buffer });
};

// -------------------------------------------------------------------- the run

const token = await signIn();
const people = await prepare(token);
const [runA, runB, runC] = scanDays();
const fileA = scannerFile(people, runA, 0);
const fileB = scannerFile(people, runB, 1);
const fileC = scannerFile(people, runC, 2);
const inputs = await comparisonInputs(token);
console.log("prepared: scanner numbers, document dates, comparison figures");

// -------------------------------------------------------------------- clips

/** A caption burned into the recording, as in docs/demo/record.mjs. */
async function caption(page, text) {
  await page.evaluate((line) => {
    let bar = document.getElementById("cwork-demo-caption");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "cwork-demo-caption";
      Object.assign(bar.style, {
        position: "fixed",
        left: "0",
        right: "0",
        bottom: "0",
        zIndex: "2147483647",
        pointerEvents: "none",
        padding: "14px 22px",
        background: "rgb(15,17,26)",
        color: "#fff",
        font: '500 17px/1.62 "IBM Plex Sans Thai", system-ui, -apple-system, "Segoe UI", sans-serif',
        letterSpacing: "0.2px",
      });
      document.body.appendChild(bar);
    }
    bar.textContent = line;
    bar.style.opacity = line ? "1" : "0";
  }, text);
}

const CAPTIONS = {
  th: {
    choose: "ไฟล์ที่เครื่องสแกนนิ้วส่งออก เลือกเข้ามาได้เลย",
    preview:
      "ตรวจก่อนนำเข้า: วันไหนใหม่ วันไหนรอ HR ตัดสิน ยังไม่เขียนอะไรลงข้อมูล",
    imported: "นำเข้าแล้ว เพิ่มเฉพาะเวลาที่นับได้เข้าไปในการลงเวลา",
    review: "วันที่มีเวลาเดียวหรือสามเวลา รอ HR ตัดสิน และไม่นับจนกว่าจะตัดสิน",
    decided:
      "HR เลือกเวลาเข้า-ออกจากเวลาที่เครื่องบันทึกไว้เท่านั้น ไม่มีการเดา",
  },
  en: {
    choose: "The fingerprint scanner's own export: just choose the file.",
    preview:
      "Checked before it is imported: what is new, what waits for HR. Nothing is written yet.",
    imported: "Imported: only the times that count are added to attendance.",
    review:
      "A day with one time, or three, waits for HR and is not counted until decided.",
    decided:
      "HR picks the clock-in and clock-out from the times the scanner recorded. Nothing is guessed.",
  },
};

async function recordClip(language, file, fileName) {
  const context = await openContext(language, { record: true });
  const page = await context.newPage();
  const startedAt = Date.now();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const text = CAPTIONS[language];
  const hold = (ms) => page.waitForTimeout(ms);

  await page.goto(BASE + "/attendance/scanner/import");
  await settle(page);
  // The clip starts on the loaded page, not on the loading of it.
  const trim = ((Date.now() - startedAt) / 1000).toFixed(2);
  await caption(page, text.choose);
  await hold(1600);

  await upload(page, language, fileName, file);
  await page
    .getByRole("button", { name: ui(language, "importFile") })
    .waitFor({ timeout: 15000 });
  await caption(page, text.preview);
  await hold(3400);

  await page.getByRole("button", { name: ui(language, "importFile") }).click();
  await page
    .getByRole("link", { name: ui(language, "reviewDays") })
    .first()
    .waitFor();
  await caption(page, text.imported);
  await hold(2600);

  await page
    .getByRole("link", { name: ui(language, "reviewDays") })
    .first()
    .click();
  await page
    .getByRole("button", { name: ui(language, "useTimes") })
    .first()
    .waitFor();
  await page.mouse.move(DESKTOP.width - 8, 20);
  await scrollToDays(page);
  await caption(page, text.review);
  await hold(3600);

  // Number 104's day has three times: HR keeps the first and the last.
  const row = page.locator("tr", {
    has: page.locator("td.mono", { hasText: /^104$/ }),
  });
  await row
    .getByRole("button", { name: ui(language, "useTimes") })
    .first()
    .click({ timeout: 8000 })
    .catch(async (error) => {
      await page.screenshot({
        path: process.env.DEBUG_SHOT ?? join(scratch, "failed.png"),
      });
      throw error;
    });
  await page.mouse.move(DESKTOP.width - 8, 20);
  await caption(page, text.decided);
  await hold(3400);

  if (pageErrors.length > 0)
    throw new Error(`the console threw: ${pageErrors.join(" | ")}`);
  const video = page.video();
  await context.close();
  const webm = await video.path();

  // 900 px wide at 10 fps: an interface mostly holds still (see record.mjs).
  const scale = "fps=10,scale=900:-1:flags=lanczos";
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    trim,
    "-i",
    webm,
    "-vf",
    scale,
    "-loop",
    "0",
    "-quality",
    "70",
    "-compression_level",
    "6",
    join(DEMO, `office.${language}.webp`),
  ]);
  // Only landing/ is published to Pages, so the clip is copied there as well.
  execFileSync("cp", [
    join(DEMO, `office.${language}.webp`),
    join(repo, "landing", "assets", `office.${language}.webp`),
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    trim,
    "-i",
    webm,
    "-vf",
    `${scale},split[a][b];[a]palettegen=stats_mode=diff:max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
    "-loop",
    "0",
    join(DEMO, `office.${language}.gif`),
  ]);
  const seconds = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    webm,
  ])
    .toString()
    .trim();
  console.log(
    `  clip ${language}: ${(Number(seconds) - Number(trim)).toFixed(1)}s`,
  );
}

if (MODE !== "stills") {
  mkdirSync(DEMO, { recursive: true });
  await recordClip("th", fileA, "Export-A.xls");
  await recordClip("en", fileB, "Export-B.xls");
}

// ------------------------------------------------------------------- stills

if (MODE !== "clips") {
  const cashPng = join(scratch, "cash-sheet-crop.png");
  const cash = await fetch(`${API}/payroll/runs/${inputs.run.id}/print/cash`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!cash.ok) throw new Error(`cash sheet → ${cash.status}`);
  const pdf = join(scratch, "cash.pdf");
  writeFileSync(pdf, Buffer.from(await cash.arrayBuffer()));
  // 1280 px wide at 2×, like the screens; the sheet is A4 landscape.
  execFileSync("pdftoppm", [
    "-r",
    "218",
    "-f",
    "1",
    "-l",
    "1",
    "-png",
    "-singlefile",
    pdf,
    join(scratch, "cash-sheet"),
  ]);

  // 25: a file checked and not yet imported, so everything in it is new. Both
  // languages are taken before the file is imported, or the second one would
  // show every day as already in Cwork.
  // The sheet is A4 landscape with the table in its upper two thirds: crop the
  // empty bottom and the page number, and make a README copy 1280 px wide.
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    join(scratch, "cash-sheet.png"),
    "-vf",
    "crop=iw:ih*0.68:0:0",
    cashPng,
  ]);
  const cashDocsPng = join(scratch, "cash-sheet-docs.png");
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    cashPng,
    "-vf",
    "scale=1280:-1:flags=lanczos",
    cashDocsPng,
  ]);

  for (const language of ["th", "en"]) {
    mkdirSync(docsDir(language), { recursive: true });
    const context = await openContext(language);
    const page = await context.newPage();
    await page.goto(BASE + "/attendance/scanner/import");
    await settle(page);
    await upload(page, language, "Export-C.xls", fileC);
    await page
      .getByRole("button", { name: ui(language, "importFile") })
      .waitFor();
    await settle(page);
    await shoot(page, language, "scanner-preview", "25-scanner-preview");
    await context.close();
  }

  const form = new FormData();
  form.append("file", new Blob([fileC]), "Export-C.xls");
  const imported = await fetch(`${API}/attendance/scanner/import`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!imported.ok) throw new Error(`import of file C → ${imported.status}`);

  for (const language of ["th", "en"]) {
    const context = await openContext(language);
    const page = await context.newPage();

    // 24: the days waiting for HR, with the times as the scanner wrote them.
    await page.goto(BASE + "/attendance/scanner");
    await page
      .getByRole("button", { name: ui(language, "useTimes") })
      .first()
      .waitFor();
    await settle(page);
    await scrollToDays(page);
    await page.waitForTimeout(300);
    await shoot(page, language, "scanner-days", "24-scanner-days");

    // 26: the totals filed, tax the same and social security fifty satang off.
    await page.goto(BASE + "/payroll/compare");
    await settle(page);
    await page.getByLabel(ui(language, "tax")).fill(inputs.filedTax);
    await page.getByLabel(ui(language, "sso")).fill(inputs.filedSso);
    await page
      .getByRole("button", { name: ui(language, "compare"), exact: true })
      .click();
    await page.locator("table.table").first().waitFor();
    await settle(page);
    await shoot(page, language, "check-filings", "26-check-filings");

    // 27: HR's own figures, person by person, with who and what differ.
    await page.locator("input[type=file]").setInputFiles({
      name: "HR-figures.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(inputs.csv),
    });
    await page.locator(".grid--4").first().waitFor();
    await settle(page);
    // The four counts and the people who differ.
    await page
      .locator(".grid--4")
      .first()
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(400);
    await shoot(page, language, "parallel-run", "27-parallel-run");

    // 29: passports and work permits, by how soon they end.
    await page.goto(BASE + "/employees/documents-expiring");
    await settle(page);
    await shoot(page, language, "documents-expiring", "29-documents-expiring");

    await context.close();

    // 28: page one of the cash sheet, which has one edition only.
    await webp(cashPng, join(LANDING, `cash-sheet.${language}.webp`));
    execFileSync("cp", [
      cashDocsPng,
      join(docsDir(language), "28-cash-sheet.png"),
    ]);
    console.log(`  ${language} cash-sheet`);
  }
}

await browser.close();
if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
for (const file of [
  "office.th.webp",
  "office.en.webp",
  "office.th.gif",
  "office.en.gif",
]) {
  const path = join(DEMO, file);
  if (existsSync(path))
    console.log(`${file}: ${(statSync(path).size / 1e6).toFixed(2)} MB`);
}
console.log("done");
