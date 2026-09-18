/**
 * Checks every test count the documentation states against the suites.
 *
 * This exists because two different claims drifted into each other and nobody
 * noticed for weeks. "271 backend tests with no database, no framework and no
 * I/O" is a claim about the domain layer; "271 backend unit tests, 29 web, 35
 * mobile" is a claim about the whole suite. They are different numbers — 240
 * and 279 — and both were being written as 271, in two languages, across six
 * files, while a third pair of documents still said 126. Nothing checked them,
 * because a number in prose is not something a compiler or a test runner has
 * any reason to look at.
 *
 *     npm run verify:docs
 *
 * Two numbers are measured here by running the suites. The other three are
 * measured by their own CI jobs — there is no vitest config and no Flutter
 * toolchain in this package — so they are declared once, below, and every
 * document is checked against that one declaration. The point is not that the
 * script can run everything; it is that no number has two homes.
 *
 * A claim that stops matching its pattern fails the build too. If someone
 * rewords a sentence, this asks them to look at it rather than silently
 * checking nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = join(__dirname, '..', '..');

/** Counts this package can measure, by running the suites. */
function measure(label: string, args: string[]): number {
  const raw = execFileSync('npx', ['jest', '--silent', '--json', ...args], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // A clean clone has no .env; these suites must not need one, and
    // verify:clone-boot is what pins that. Keep the environment as found.
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const report = JSON.parse(raw) as { numTotalTests: number; numFailedTests: number };
  if (report.numFailedTests > 0) {
    throw new Error(`${label}: the suite is failing — fix that before counting it`);
  }
  return report.numTotalTests;
}

const counts: Record<string, number> = {
  backendDomain: measure('domain', ['--testPathPatterns', 'domain/.*\\.spec\\.ts$']),
  backendUnit: measure('backend unit', []),

  // Measured by the `web`, `mobile` and `backend` jobs in ci.yml respectively.
  // Update here, not in the prose: that is the whole point of this file.
  web: 29,
  mobile: 35,
  e2e: 181,
};

/**
 * Every place a count is written down.
 *
 * The pattern must match exactly once in its file and capture the number. A
 * pattern that matches nothing is a failure, not a pass: it means the sentence
 * was reworded and this stopped watching it.
 */
const CLAIMS: { file: string; pattern: RegExp; count: keyof typeof counts }[] = [
  { file: 'README.md', pattern: /That is why (\d+) domain tests run in under ten/, count: 'backendDomain' },
  { file: 'README.md', pattern: /sign-in through payroll\. (\d+) backend unit/, count: 'backendUnit' },
  { file: 'README.md', pattern: /\ntests, (\d+) web, \d+ mobile, plus a \d+-check/, count: 'web' },
  { file: 'README.md', pattern: /\ntests, \d+ web, (\d+) mobile, plus a \d+-check/, count: 'mobile' },
  { file: 'README.md', pattern: /\ntests, \d+ web, \d+ mobile, plus a (\d+)-check/, count: 'e2e' },
  { file: 'README.md', pattern: /on every push — (\d+) backend unit tests/, count: 'backendUnit' },
  { file: 'README.md', pattern: /backend unit tests, (\d+) web,\n/, count: 'web' },
  { file: 'README.md', pattern: /\n {2}(\d+) mobile, \d+ end-to-end checks/, count: 'mobile' },
  { file: 'README.md', pattern: /\n {2}\d+ mobile, (\d+) end-to-end checks/, count: 'e2e' },

  { file: 'README.th.md', pattern: /ในชั้น domain (\d+) ตัว/, count: 'backendDomain' },
  { file: 'README.th.md', pattern: /ฝั่ง backend (\d+) ตัว เว็บ/, count: 'backendUnit' },
  { file: 'README.th.md', pattern: /ฝั่ง backend \d+ ตัว เว็บ (\d+) ตัว/, count: 'web' },
  { file: 'README.th.md', pattern: /ฝั่ง backend \d+ ตัว เว็บ \d+ ตัว มือถือ (\d+) ตัว/, count: 'mobile' },
  { file: 'README.th.md', pattern: /อีก (\d+) จุดตรวจที่ยิงผ่าน HTTP จริงใน CI/, count: 'e2e' },
  { file: 'README.th.md', pattern: /push — backend (\d+) ตัว/, count: 'backendUnit' },
  { file: 'README.th.md', pattern: /push — backend \d+ ตัว เว็บ (\d+) ตัว/, count: 'web' },
  { file: 'README.th.md', pattern: /\n {2}มือถือ (\d+) ตัว และ end-to-end/, count: 'mobile' },
  { file: 'README.th.md', pattern: /end-to-end อีก (\d+) จุดตรวจที่ยิงผ่าน HTTP จริง\n/, count: 'e2e' },

  { file: 'backend/README.md', pattern: /^(\d+) unit tests over the domain layer:/m, count: 'backendDomain' },
  { file: 'docs/architecture.md', pattern: /there are (\d+) domain tests that run in/, count: 'backendDomain' },
  { file: 'docs/adr/0002-pure-domain-logic.md', pattern: /\*\*Good\.\*\* (\d+) domain tests run in/, count: 'backendDomain' },

  { file: 'docs/spec.md', pattern: /unit-tested: (\d+) backend, \d+ web, \d+ mobile/, count: 'backendUnit' },
  { file: 'docs/spec.md', pattern: /unit-tested: \d+ backend, (\d+) web, \d+ mobile/, count: 'web' },
  { file: 'docs/spec.md', pattern: /unit-tested: \d+ backend, \d+ web, (\d+) mobile/, count: 'mobile' },
  { file: 'docs/spec.md', pattern: /A (\d+)-check e2e suite drives the real API/, count: 'e2e' },
];

const sources = new Map<string, string>();
const problems: string[] = [];

for (const claim of CLAIMS) {
  let text = sources.get(claim.file);
  if (text === undefined) {
    text = readFileSync(join(repo, claim.file), 'utf8');
    sources.set(claim.file, text);
  }

  const all = [...text.matchAll(new RegExp(claim.pattern, claim.pattern.flags.replace('g', '') + 'g'))];
  if (all.length === 0) {
    problems.push(
      `${claim.file}: no longer says anything matching ${claim.pattern} — ` +
        'reworded? Update the pattern so this keeps watching it.',
    );
    continue;
  }
  if (all.length > 1) {
    problems.push(`${claim.file}: ${claim.pattern} matches ${all.length} times; it must be unique`);
    continue;
  }

  const stated = Number(all[0][1]);
  const actual = counts[claim.count];
  if (stated !== actual) {
    problems.push(`${claim.file}: says ${stated} for ${claim.count}, but it is ${actual}`);
  }
}

console.log(
  `  measured  ${counts.backendDomain} domain · ${counts.backendUnit} backend unit` +
    `   declared  ${counts.web} web · ${counts.mobile} mobile · ${counts.e2e} e2e`,
);

if (problems.length > 0) {
  console.error(`\n${problems.length} documented count is wrong:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nThe numbers are the ones above. Fix the prose, or fix the declaration.');
  process.exit(1);
}
console.log(`  ok        ${CLAIMS.length} claims across ${sources.size} documents agree`);
