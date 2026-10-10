// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards CW-058 at the source: a Thai screen shows years in the Buddhist era,
 * and that only holds while every date and year goes through lib/format and
 * every date field is a DateInput. Screen tests catch a Gregorian year on what
 * they render (expectBuddhistEraYears); this catches the screens no test
 * renders yet, by refusing the ways a year has reached the screen before.
 */

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === '__tests__' || name === 'test' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  text: readFileSync(path, 'utf8'),
}));

/** Lines of the source matching a pattern, as "file:line: code", for a readable failure. */
function offending(pattern: RegExp, allowed: string[] = []): string[] {
  return files
    .filter((file) => !allowed.includes(file.path))
    .flatMap((file) =>
      file.text
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => pattern.test(line))
        .map(({ line, i }) => `${file.path}:${i + 1}: ${line.trim()}`),
    );
}

describe('Buddhist-era years stay on Thai screens (CW-058)', () => {
  it('has no browser date input outside DateInput', () => {
    expect(offending(/type=["']date["']/, ['components/ui/DateInput.tsx'])).toEqual([]);
  });

  it('formats dates only through lib/format', () => {
    expect(
      offending(
        /toLocaleDateString|toLocaleString\(|Intl\.DateTimeFormat\((?!\)\.resolvedOptions)/,
        ['lib/format.ts'],
      ),
    ).toEqual([]);
    // date-fns' own format writes the Gregorian year; date arithmetic from it is fine.
    expect(
      offending(/import \{[^}]*\bformat\b[^}]*\} from 'date-fns'/, [
        'lib/format.ts',
        'components/ui/DateInput.tsx',
      ]),
    ).toEqual([]);
  });

  it('shows a pay period as its month, not its code', () => {
    expect(
      offending(/\bperiod\??\.code\b/).filter((line) => !line.includes('formatPeriod(')),
    ).toEqual([]);
  });

  it('writes a year into text only through formatYear', () => {
    // A year as a bare JSX child: <option>{thisYear}</option>
    expect(offending(/>\s*\{\s*[\w.?]*[yY]ear\s*\}/)).toEqual([]);
    // A year into a message: t('… {year} …', { year: formatYear(…) })
    const unformatted = files.flatMap((file) =>
      [
        ...file.text.matchAll(
          /t\(\s*(['"])((?:(?!\1).)*\{year\}(?:(?!\1).)*)\1\s*,\s*\{([^}]*)\}/gs,
        ),
      ]
        .filter((call) => !/\byear:\s*formatYear\(/.test(call[3]))
        .map((call) => `${file.path}: ${call[2]}`),
    );
    expect(unformatted).toEqual([]);
  });
});
