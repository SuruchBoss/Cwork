// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  checkDecision,
  classifyDay,
  decodeScannerExport,
  parseScannerExport,
  sameTimes,
  scannerPunchKey,
} from './scanner-export';

/** A synthetic export, written the way the scanner writes one: UTF-16LE, a mark, tabs, commas. */
export function scannerFile(lines: string[], encoding: 'utf16le' | 'utf16be' | 'utf8' = 'utf16le') {
  const text = lines.join('\r\n') + '\r\n';
  if (encoding === 'utf16le')
    return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  if (encoding === 'utf16be') {
    return Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]);
  }
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
}

/** One line: every field padded and closed with a comma, four fields and an empty fifth. */
export const scannerLine = (name: string, number: string, date: string, times: string) =>
  [`${name} ,`, `${number} ,`, `${date} ,`, `${times} ,`, ''].join('\t');

describe('decodeScannerExport', () => {
  const sample = [scannerLine('สมชาย ใจดี', '12', '03/12/2026', '08:01 17:05')];

  it('reads UTF-16LE with a byte-order mark, whatever the file is called', () => {
    const decoded = decodeScannerExport(scannerFile(sample));
    expect(decoded.text).toContain('สมชาย ใจดี');
    expect(decoded.problem).toBeUndefined();
  });

  it('reads UTF-16BE and UTF-8 with a mark the same way', () => {
    expect(decodeScannerExport(scannerFile(sample, 'utf16be')).text).toContain('สมชาย ใจดี');
    expect(decodeScannerExport(scannerFile(sample, 'utf8')).text).toContain('สมชาย ใจดี');
  });

  it('refuses a file with no mark rather than guess its encoding', () => {
    const bare = Buffer.from(sample.join('\r\n'), 'utf16le');
    expect(decodeScannerExport(bare).problem?.code).toBe('UNSUPPORTED_ENCODING');
    // A real Excel workbook starts with neither mark.
    expect(decodeScannerExport(Buffer.from('PK\u0003\u0004 xlsx')).problem?.code).toBe(
      'UNSUPPORTED_ENCODING',
    );
  });

  it('says an empty file is empty', () => {
    expect(decodeScannerExport(Buffer.alloc(0)).problem?.code).toBe('EMPTY');
  });
});

describe('parseScannerExport', () => {
  const parse = (...lines: string[]) => parseScannerExport(lines.join('\r\n'));

  it('trims the spaces and the comma off every field and drops the empty fifth', () => {
    const { lines, problems } = parse(scannerLine('สมชาย ใจดี', '12', '03/12/2026', '08:01 17:05'));
    expect(problems).toEqual([]);
    expect(lines).toEqual([
      {
        row: 1,
        name: 'สมชาย ใจดี',
        scannerNumber: '12',
        workDate: '2026-12-03',
        times: ['08:01', '17:05'],
      },
    ]);
  });

  it('reads a day with no time, one time, two, and three', () => {
    const { lines, problems } = parse(
      scannerLine('A', '1', '01/12/2026', ''),
      scannerLine('A', '1', '02/12/2026', '08:00'),
      scannerLine('A', '1', '03/12/2026', '08:00 17:00'),
      scannerLine('A', '1', '04/12/2026', '08:00 12:00 17:00'),
    );
    expect(problems).toEqual([]);
    expect(lines.map((l) => l.times)).toEqual([
      [],
      ['08:00'],
      ['08:00', '17:00'],
      ['08:00', '12:00', '17:00'],
    ]);
  });

  it('keeps the number exactly as written and pads a one-digit hour', () => {
    const { lines } = parse(scannerLine('A', '007', '05/12/2026', '8:05 17:00'));
    expect(lines[0]).toMatchObject({ scannerNumber: '007', times: ['08:05', '17:00'] });
  });

  it('sorts the times and keeps each once', () => {
    const { lines } = parse(scannerLine('A', '1', '05/12/2026', '17:00 08:00 08:00'));
    expect(lines[0]!.times).toEqual(['08:00', '17:00']);
  });

  it('counts blank lines in the row numbers and skips them', () => {
    const { lines } = parse(
      scannerLine('A', '1', '05/12/2026', ''),
      '',
      scannerLine('A', '1', '06/12/2026', ''),
    );
    expect(lines.map((l) => l.row)).toEqual([1, 3]);
  });

  it('refuses anything more than name, number, date and times: nowhere to keep a template', () => {
    const template = [
      `A ,`,
      `1 ,`,
      `05/12/2026 ,`,
      `08:00 ,`,
      'Tm9wZSBhIGZpbmdlcnByaW50IHRlbXBsYXRl',
    ].join('\t');
    const { lines, problems } = parse(template);
    expect(lines).toEqual([]);
    expect(problems).toMatchObject([{ row: 1, code: 'WRONG_FIELD_COUNT', params: { found: 5 } }]);
    expect(parse('only,\tthree,\tfields,').problems[0]).toMatchObject({
      code: 'WRONG_FIELD_COUNT',
    });
  });

  it('names the row and column of each bad value, and carries on', () => {
    const { lines, problems } = parse(
      scannerLine('A', 'x1', '05/12/2026', '08:00'),
      scannerLine('A', '1', '31/02/2026', '08:00'),
      scannerLine('A', '1', '05/12/2026', '8-00'),
      scannerLine('A', '1', '05/12/2026', '25:00'),
      scannerLine('A', '1', '06/12/2026', '08:00'),
    );
    expect(problems.map((p) => [p.row, p.column, p.code])).toEqual([
      [1, 'B', 'INVALID_SCANNER_NUMBER'],
      [2, 'C', 'INVALID_DATE'],
      [3, 'D', 'INVALID_TIME'],
      [4, 'D', 'INVALID_TIME'],
    ]);
    expect(lines.map((l) => l.row)).toEqual([5]);
  });

  it('refuses a Buddhist-era year instead of reading it as the Gregorian one', () => {
    const { problems } = parse(scannerLine('A', '1', '05/12/2569', '08:00'));
    expect(problems).toMatchObject([{ code: 'YEAR_OUT_OF_RANGE', params: { year: 2569 } }]);
  });

  it('flags a number and day that appear twice', () => {
    const { problems } = parse(
      scannerLine('A', '1', '05/12/2026', '08:00'),
      scannerLine('A', '1', '05/12/2026', '09:00'),
    );
    expect(problems).toMatchObject([{ row: 2, code: 'DUPLICATE_IN_FILE', params: { other: 1 } }]);
  });

  it('says a file of blank lines is empty', () => {
    expect(parse('', '   ').problems).toMatchObject([{ row: 0, code: 'EMPTY' }]);
  });
});

describe('classifyDay', () => {
  const day = (times: string[], over: Partial<Parameters<typeof classifyDay>[0]> = {}) =>
    classifyDay({ times, mapped: true, decision: null, ...over });

  it('counts nothing for a day with no time: leave and absence come from elsewhere', () => {
    expect(day([])).toEqual({ status: 'NO_PUNCH', reason: null, punches: [] });
  });

  it('counts two times as in and out', () => {
    expect(day(['08:01', '17:05'])).toEqual({
      status: 'COUNTED',
      reason: null,
      punches: [
        { type: 'CLOCK_IN', time: '08:01' },
        { type: 'CLOCK_OUT', time: '17:05' },
      ],
    });
  });

  it('holds one time and three or more for HR, with the reason, and counts none of them', () => {
    expect(day(['08:01'])).toEqual({ status: 'WAITING', reason: 'ONE_TIME', punches: [] });
    expect(day(['08:01', '12:00', '17:05'])).toEqual({
      status: 'WAITING',
      reason: 'MANY_TIMES',
      punches: [],
    });
  });

  it('does not count a number nobody has registered, whatever its times', () => {
    expect(day(['08:01', '17:05'], { mapped: false })).toEqual({
      status: 'UNMAPPED',
      reason: null,
      punches: [],
    });
  });

  it('uses what HR decided over the rule, in either direction', () => {
    expect(
      day(['08:01', '12:00', '17:05'], {
        decision: { action: 'USE', clockIn: '08:01', clockOut: '17:05' },
      }),
    ).toMatchObject({
      status: 'DECIDED_USE',
      punches: [
        { type: 'CLOCK_IN', time: '08:01' },
        { type: 'CLOCK_OUT', time: '17:05' },
      ],
    });
    expect(
      day(['08:01'], { decision: { action: 'USE', clockIn: '08:01', clockOut: null } }).punches,
    ).toEqual([{ type: 'CLOCK_IN', time: '08:01' }]);
    expect(
      day(['08:01', '17:05'], { decision: { action: 'IGNORE', clockIn: null, clockOut: null } }),
    ).toEqual({
      status: 'DECIDED_IGNORE',
      reason: null,
      punches: [],
    });
  });
});

describe('checkDecision', () => {
  const times = ['08:01', '12:00', '17:05'];

  it('accepts a pick among the times the scanner recorded', () => {
    expect(checkDecision(times, { action: 'USE', clockIn: '08:01', clockOut: '17:05' })).toBeNull();
    expect(checkDecision(['08:01'], { action: 'USE', clockOut: '08:01' })).toBeNull();
    expect(checkDecision(times, { action: 'IGNORE' })).toBeNull();
  });

  it('refuses a time the scanner never recorded, an empty use, and an out that is not after the in', () => {
    expect(checkDecision(times, { action: 'USE', clockIn: '08:02' })).toBe('TIME_NOT_ON_DAY');
    expect(checkDecision(times, { action: 'USE' })).toBe('NOTHING_TO_USE');
    expect(checkDecision(times, { action: 'USE', clockIn: '17:05', clockOut: '08:01' })).toBe(
      'OUT_NOT_AFTER_IN',
    );
    expect(checkDecision(times, { action: 'IGNORE', clockIn: '08:01' })).toBe(
      'IGNORE_TAKES_NO_TIMES',
    );
  });
});

describe('small helpers', () => {
  it('compares lists of times in order', () => {
    expect(sameTimes(['08:00', '17:00'], ['08:00', '17:00'])).toBe(true);
    expect(sameTimes(['08:00'], ['08:00', '17:00'])).toBe(false);
  });

  it('gives a punch the same key every time it is read', () => {
    expect(scannerPunchKey('007', '2026-12-03', '08:01', 'CLOCK_IN')).toBe(
      'scan:007:2026-12-03:08:01:IN',
    );
    expect(scannerPunchKey('7', '2026-12-03', '17:05', 'CLOCK_OUT')).toBe(
      'scan:7:2026-12-03:17:05:OUT',
    );
  });
});
