// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * No spec takes "today" as a calendar day from the UTC clock.
 *
 *     npm run verify:spec-dates
 *
 * The organisation's day is Bangkok's, seven hours ahead of UTC, so a spec that turns
 * `new Date()` into a date is a day behind the server from 17:00 to midnight UTC. Specs
 * that file leave on "today plus N" also fail on the weekday when N lands on a weekend,
 * and clash with each other when a run crosses midnight. Use `calendarToday()` from
 * `test/utils/dates.ts` for the day, and `firstWorkingDay()` from
 * `test/utils/leave-days.ts` for a day leave can be filed on.
 *
 * This reads lines, so it catches the usual shapes and not every one. A line that is
 * right on purpose says so with `// utc-ok` and the reason.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const testDir = join(__dirname, '..', 'test');
const skip = new Set(['utils/dates.ts', 'utils/dates.e2e-spec.ts']);

const clock = String.raw`(?:new Date\(\)|Date\.now\(\))`;
const rules: Array<{ why: string; pattern: RegExp }> = [
  {
    why: 'the UTC clock turned into a calendar date',
    pattern: new RegExp(
      `${clock}.*(?:isoDate\\(|toISOString\\(\\)\\.slice\\(0, ?10\\)|getUTC(?:FullYear|Month|Date|Day)\\()`,
    ),
  },
  { why: 'isoDate/addDays on the UTC clock', pattern: /(?:isoDate|addDays)\(\s*new Date\(\)/ },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const found: string[] = [];
for (const path of files(testDir)) {
  const name = relative(testDir, path);
  if (skip.has(name)) continue;
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (line.includes('utc-ok') || /workDateFor\(|calendarToday\(/.test(line)) return;
      const rule = rules.find((r) => r.pattern.test(line));
      if (rule) found.push(`test/${name}:${index + 1}  ${rule.why}\n    ${line.trim()}`);
    });
}

if (found.length > 0) {
  console.error(
    `${found.length} line(s) take today from the UTC clock. Use calendarToday() ` +
      'from test/utils/dates.ts (and firstWorkingDay() for leave), or mark the line ' +
      '"// utc-ok: <why>".\n\n' +
      found.join('\n'),
  );
  process.exit(1);
}
console.log('No spec takes the calendar day from the UTC clock.');
