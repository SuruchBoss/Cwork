// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  importProblem,
  MAX_PROBLEMS,
  type ImportProblem,
} from '../../../core/spreadsheet/problems';

/**
 * Reading a fingerprint scanner's export, and deciding what each day of it is
 * (CW-061). Pure, so the layout and the rules are tested without a database.
 *
 * The pilot's scanner (a TA-001EX) writes a file named `.xls` that is really
 * UTF-16LE text with a byte-order mark: tab-separated, no header, one line for
 * each scanner user number and day, four fields and an empty fifth, each field
 * with trailing spaces and a comma. What it is, is read from the mark, never
 * from the name.
 *
 * Nothing here guesses. A day with one time or three or more is not counted
 * until a person decides it; a number nobody has registered is not counted at
 * all; a file with anything in it that is not name, number, date and times is
 * refused, so there is no place a fingerprint template could be kept.
 */

/** One line of the export, read. */
export interface ScannerLine {
  /** The line's number in the file, from 1, counting blank lines. */
  row: number;
  /** As the scanner wrote it; may be empty. */
  name: string;
  /** Digits, exactly as written ("007" is not "7"). */
  scannerNumber: string;
  /** `yyyy-mm-dd`. */
  workDate: string;
  /** Every time of the day, HH:mm, earliest first, each once. */
  times: string[];
}

export const MAX_SCANNER_LINES = 20_000;
const MAX_NAME = 200;
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

// ---------------------------------------------------------------- decoding

/**
 * The file's text, found from its byte-order mark. UTF-16 either way round and
 * UTF-8 with a mark are read; a file with no mark is not guessed at.
 */
export function decodeScannerExport(
  bytes: Buffer,
): { text: string; problem?: undefined } | { text?: undefined; problem: ImportProblem } {
  if (bytes.length === 0) return { problem: importProblem('EMPTY', { row: 0 }) };

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: bytes.subarray(2).toString('utf16le') };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    // UTF-16BE: swap each pair of bytes, then it is UTF-16LE.
    const body = Buffer.from(bytes.subarray(2, 2 + ((bytes.length - 2) & ~1)));
    return { text: body.swap16().toString('utf16le') };
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: bytes.subarray(3).toString('utf8') };
  }
  return { problem: importProblem('UNSUPPORTED_ENCODING', { row: 0 }) };
}

// ----------------------------------------------------------------- parsing

/** Trailing spaces, then the comma the scanner ends every field with, then spaces again. */
function tidy(field: string): string {
  return field.replace(/[,\s]+$/, '').trim();
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function readDate(text: string): { iso: string; year: number } | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    iso: `${match[3]}-${match[2]}-${match[1]}`,
    year,
  };
}

/** The lines of a scanner export, and every problem with them. Problems do not stop the reading. */
export function parseScannerExport(text: string): {
  lines: ScannerLine[];
  problems: ImportProblem[];
} {
  const problems: ImportProblem[] = [];
  const problem = (p: ImportProblem) => {
    if (problems.length < MAX_PROBLEMS) problems.push(p);
  };
  const lines: ScannerLine[] = [];
  const seen = new Map<string, number>();

  const physical = text.split(/\r\n|\n|\r/);
  const nonBlank = physical.filter((l) => l.trim() !== '').length;
  if (nonBlank === 0) {
    return { lines, problems: [importProblem('EMPTY', { row: 0 })] };
  }
  if (nonBlank > MAX_SCANNER_LINES) {
    return {
      lines,
      problems: [
        importProblem('TOO_MANY_ROWS', { row: 0 }, { rows: nonBlank, max: MAX_SCANNER_LINES }),
      ],
    };
  }

  physical.forEach((raw, index) => {
    if (raw.trim() === '') return;
    const row = index + 1;

    const fields = raw.split('\t');
    // The scanner ends each line with a tab, which leaves one empty field.
    while (fields.length > 4 && tidy(fields[fields.length - 1]!) === '') fields.pop();
    if (fields.length !== 4) {
      problem(importProblem('WRONG_FIELD_COUNT', { row }, { found: fields.length }));
      return;
    }
    const [nameField, numberField, dateField, timesField] = fields.map(tidy) as [
      string,
      string,
      string,
      string,
    ];
    let ok = true;

    if (nameField.length > MAX_NAME) {
      problem(importProblem('TOO_LONG', { row, column: 'A' }, { max: MAX_NAME }));
      ok = false;
    }

    if (!/^\d{1,12}$/.test(numberField)) {
      problem(
        importProblem(
          'INVALID_SCANNER_NUMBER',
          { row, column: 'B' },
          { value: numberField.slice(0, 40) },
        ),
      );
      ok = false;
    }

    const date = readDate(dateField);
    if (!date) {
      problem(
        importProblem('INVALID_DATE', { row, column: 'C' }, { value: dateField.slice(0, 40) }),
      );
      ok = false;
    } else if (date.year < MIN_YEAR || date.year > MAX_YEAR) {
      problem(importProblem('YEAR_OUT_OF_RANGE', { row, column: 'C' }, { year: date.year }));
      ok = false;
    }

    const times = new Set<string>();
    if (timesField !== '') {
      for (const token of timesField.split(/\s+/)) {
        const match = TIME.exec(token);
        if (!match) {
          problem(
            importProblem('INVALID_TIME', { row, column: 'D' }, { value: token.slice(0, 40) }),
          );
          ok = false;
        } else {
          times.add(`${match[1]!.padStart(2, '0')}:${match[2]}`);
        }
      }
    }
    if (!ok || !date) return;

    const key = `${numberField}|${date.iso}`;
    const other = seen.get(key);
    if (other !== undefined) {
      problem(
        importProblem(
          'DUPLICATE_IN_FILE',
          { row, column: 'C' },
          { value: `${numberField} ${dateField}`, other },
        ),
      );
      return;
    }
    seen.set(key, row);

    lines.push({
      row,
      name: nameField,
      scannerNumber: numberField,
      workDate: date.iso,
      times: [...times].sort(),
    });
  });

  return { lines, problems };
}

// ---------------------------------------------------------- what a day is

export type ScannerDayStatus =
  /** The scanner recorded nothing; a day off, leave or absence comes from the calendar and leave records. */
  | 'NO_PUNCH'
  /** The scanner number belongs to nobody in the register; not counted. */
  | 'UNMAPPED'
  /** Two times: in is the first, out is the last. */
  | 'COUNTED'
  /** One time, or three or more: not counted until HR decides. */
  | 'WAITING'
  /** HR decided to use these times. */
  | 'DECIDED_USE'
  /** HR decided the day is not counted. */
  | 'DECIDED_IGNORE';

export type WaitingReason = 'ONE_TIME' | 'MANY_TIMES';

/** What HR decided about a day, as far as it is still in force. */
export interface DayDecision {
  action: 'USE' | 'IGNORE';
  clockIn: string | null;
  clockOut: string | null;
}

export interface DayPunch {
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  time: string;
}

export interface DayVerdict {
  status: ScannerDayStatus;
  reason: WaitingReason | null;
  /** The punches that count for this day, in order; empty when none do. */
  punches: DayPunch[];
}

/** What a day is, and which punches it puts into attendance. */
export function classifyDay(input: {
  times: string[];
  mapped: boolean;
  decision: DayDecision | null;
}): DayVerdict {
  const { times, mapped, decision } = input;
  if (!mapped) return { status: 'UNMAPPED', reason: null, punches: [] };
  if (times.length === 0) return { status: 'NO_PUNCH', reason: null, punches: [] };

  if (decision) {
    if (decision.action === 'IGNORE') {
      return { status: 'DECIDED_IGNORE', reason: null, punches: [] };
    }
    const punches: DayPunch[] = [];
    if (decision.clockIn) punches.push({ type: 'CLOCK_IN', time: decision.clockIn });
    if (decision.clockOut) punches.push({ type: 'CLOCK_OUT', time: decision.clockOut });
    return { status: 'DECIDED_USE', reason: null, punches };
  }

  if (times.length === 2) {
    return {
      status: 'COUNTED',
      reason: null,
      punches: [
        { type: 'CLOCK_IN', time: times[0]! },
        { type: 'CLOCK_OUT', time: times[1]! },
      ],
    };
  }
  return {
    status: 'WAITING',
    reason: times.length === 1 ? 'ONE_TIME' : 'MANY_TIMES',
    punches: [],
  };
}

/** The same times, in the same order. A decision about one list is no decision about another. */
export function sameTimes(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((time, i) => time === b[i]);
}

export type DecisionProblem =
  'NOTHING_TO_USE' | 'TIME_NOT_ON_DAY' | 'OUT_NOT_AFTER_IN' | 'IGNORE_TAKES_NO_TIMES';

/**
 * Whether a decision makes sense for a day's times. HR picks among the times
 * the scanner recorded; a time the scanner never recorded is not available to
 * enter here, since that would be a time nobody scanned.
 */
export function checkDecision(
  times: string[],
  decision: { action: 'USE' | 'IGNORE'; clockIn?: string | null; clockOut?: string | null },
): DecisionProblem | null {
  const { clockIn = null, clockOut = null } = decision;
  if (decision.action === 'IGNORE') {
    return clockIn || clockOut ? 'IGNORE_TAKES_NO_TIMES' : null;
  }
  if (!clockIn && !clockOut) return 'NOTHING_TO_USE';
  if ((clockIn && !times.includes(clockIn)) || (clockOut && !times.includes(clockOut))) {
    return 'TIME_NOT_ON_DAY';
  }
  if (clockIn && clockOut && clockOut <= clockIn) return 'OUT_NOT_AFTER_IN';
  return null;
}

/** The key that makes a scanner punch the same punch however often a file is imported. */
export function scannerPunchKey(
  scannerNumber: string,
  workDate: string,
  time: string,
  type: DayPunch['type'],
): string {
  return `scan:${scannerNumber}:${workDate}:${time}:${type === 'CLOCK_IN' ? 'IN' : 'OUT'}`;
}
