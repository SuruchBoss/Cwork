// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Gender } from '@prisma/client';
import type { Cell, Table } from '../../../core/spreadsheet/table';
import { parseDays, readPriorLeave, type PriorLeaveContext } from './prior-leave-import';

const ANNUAL = {
  id: 'lt-annual',
  code: 'ANNUAL',
  name: 'ลาพักร้อน',
  nameEn: 'Annual leave',
  allowHalfDay: true,
  allowHourly: false,
  allowNegativeBalance: false,
  genderRestriction: null,
};
const SICK = { ...ANNUAL, id: 'lt-sick', code: 'SICK', name: 'ลาป่วย', nameEn: 'Sick leave' };
const ORDINATION = {
  ...ANNUAL,
  id: 'lt-ordain',
  code: 'ORDINATION',
  name: 'ลาบวช',
  nameEn: 'Ordination leave',
  allowHalfDay: false,
  genderRestriction: Gender.MALE,
};
const PERSONAL = {
  ...ANNUAL,
  id: 'lt-personal',
  code: 'PERSONAL',
  name: 'ลากิจ',
  nameEn: 'Personal leave',
  // By the hour but not by the half day: hours decide, not halves.
  allowHalfDay: false,
  allowHourly: true,
};
const UNPAID = {
  ...ANNUAL,
  id: 'lt-unpaid',
  code: 'UNPAID',
  name: 'ลาไม่รับค่าจ้าง',
  nameEn: 'Unpaid leave',
  allowNegativeBalance: true,
};

/** Entitlement before the import: 10 days annual, 30 sick, 15 ordination, 3 personal, 0 unpaid. */
const ENTITLED: Record<string, number> = {
  'lt-annual': 10,
  'lt-sick': 30,
  'lt-ordain': 15,
  'lt-personal': 3,
  'lt-unpaid': 0,
};

function context(): PriorLeaveContext {
  return {
    employees: new Map([
      ['E001', { id: 'emp-1', code: 'E001', name: 'สมชาย ใจดี', gender: Gender.MALE }],
      ['E002', { id: 'emp-2', code: 'E002', name: 'สมศรี มีสุข', gender: Gender.FEMALE }],
    ]),
    leaveTypes: [ANNUAL, SICK, ORDINATION, PERSONAL, UNPAID],
    availableBefore: (_employee, leaveType) => ENTITLED[leaveType],
  };
}

function table(
  rows: Cell[][],
  header: Cell[] = ['รหัสพนักงาน', 'ชื่อ', 'ลาพักร้อน', 'ลาป่วย'],
): Table {
  return { rows: [header, ...rows], dateSystem: 1900 };
}

describe('readPriorLeave', () => {
  it('reads days taken per employee and leave type, and says what each balance becomes', () => {
    const { rows, problems } = readPriorLeave(
      table([
        ['E001', 'สมชาย ใจดี', 4, '2.5'],
        ['E002', 'สมศรี มีสุข', null, 0],
      ]),
      context(),
    );

    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        row: 2,
        employeeId: 'emp-1',
        employeeCode: 'E001',
        name: 'สมชาย ใจดี',
        taken: [
          { leaveTypeId: 'lt-annual', days: 4, availableAfter: 6 },
          { leaveTypeId: 'lt-sick', days: 2.5, availableAfter: 27.5 },
        ],
      },
      // A blank cell changes nothing; 0 is a figure, and sets it to nothing taken.
      {
        row: 3,
        employeeId: 'emp-2',
        employeeCode: 'E002',
        name: 'สมศรี มีสุข',
        taken: [{ leaveTypeId: 'lt-sick', days: 0, availableAfter: 30 }],
      },
    ]);
  });

  it('knows a leave type by its code, its Thai name or its English name', () => {
    const { rows, problems } = readPriorLeave(
      table([['E001', 1, 2, 3]], ['Employee code', 'ANNUAL', 'Sick leave', 'ลาไม่รับค่าจ้าง']),
      context(),
    );
    expect(problems).toEqual([]);
    expect(rows[0].taken.map((t) => t.leaveTypeId)).toEqual(['lt-annual', 'lt-sick', 'lt-unpaid']);
  });

  it('refuses a column that is not a leave type, and a file with no leave type at all', () => {
    // Both are said: the misspelt column, and that no leave type is left.
    expect(
      readPriorLeave(table([], ['รหัสพนักงาน', 'ลาพักร้อ']), context()).problems.map((p) => [
        p.code,
        p.column,
      ]),
    ).toEqual([
      ['UNKNOWN_COLUMN', 'B'],
      ['MISSING_COLUMN', undefined],
    ]);
    expect(
      readPriorLeave(table([['E001']], ['รหัสพนักงาน', 'ชื่อ']), context()).problems.map(
        (p) => p.code,
      ),
    ).toEqual(['MISSING_COLUMN']);
  });

  it('writes nothing when one cell is wrong, and names the row, column and reason', () => {
    const { rows, problems } = readPriorLeave(
      table([
        ['E001', 'สมชาย ใจดี', 4, 2],
        ['E002', 'สมศรี มีสุข', 'สองวัน', -1],
        ['E999', 'ใครก็ไม่รู้', 1, 1],
        ['E001', 'สมชาย ใจดี', 1, 1],
      ]),
      context(),
    );

    expect(rows).toEqual([]);
    expect(problems.map((p) => [p.row, p.column, p.code, p.message])).toEqual([
      [3, 'C', 'INVALID_DAYS', '"สองวัน" is not a number of days from 0 to 366'],
      [3, 'D', 'INVALID_DAYS', '"-1" is not a number of days from 0 to 366'],
      [4, 'A', 'NOT_FOUND', 'No employee "E999"'],
      [5, 'A', 'DUPLICATE_IN_FILE', '"E001" is also on row 2'],
    ]);
  });

  it('refuses more than the employee is entitled to, unless the leave type allows it', () => {
    const { problems } = readPriorLeave(
      table([['E001', 11, 5]], ['รหัสพนักงาน', 'ลาพักร้อน', 'ลาไม่รับค่าจ้าง']),
      context(),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'OVER_ENTITLEMENT',
        message: 'สมชาย ใจดี is entitled to 10 days of ลาพักร้อน this year, not 11',
      }),
    ]);
  });

  it('refuses half days where the leave type is whole days only', () => {
    const { problems } = readPriorLeave(
      table([['E001', 1.5]], ['รหัสพนักงาน', 'ลาบวช']),
      context(),
    );
    expect(problems[0]).toMatchObject({ code: 'WHOLE_DAYS_ONLY' });
  });

  describe('a figure Cwork could have recorded for the leave type (#59)', () => {
    const read = (header: string, value: Cell) =>
      readPriorLeave(table([['E001', value]], ['รหัสพนักงาน', header]), context());

    it('takes any two decimals for leave taken by the hour', () => {
      // One hour of an eight-hour day is recorded as 0.13.
      for (const value of [0.13, 0.3, 1.25]) {
        const { problems, rows } = read('ลากิจ', value);
        expect(problems).toEqual([]);
        expect(rows[0].taken[0].days).toBe(value);
      }
    });

    it('takes half days, and refuses 0.3, where the type is taken in half days', () => {
      expect(read('ลาพักร้อน', 1.5).problems).toEqual([]);
      expect(read('ลาพักร้อน', 0.5).problems).toEqual([]);
      expect(read('ลาพักร้อน', 0.3).problems).toEqual([
        expect.objectContaining({
          code: 'HALF_DAYS_ONLY',
          params: expect.objectContaining({ leaveType: 'ลาพักร้อน', value: '0.3' }),
        }),
      ]);
    });

    it('takes whole days only, refusing half a day, where the type is neither', () => {
      expect(read('ลาบวช', 2).problems).toEqual([]);
      expect(read('ลาบวช', 0.5).problems).toEqual([
        expect.objectContaining({ code: 'WHOLE_DAYS_ONLY' }),
      ]);
    });
  });

  it('refuses leave a person could not have taken, but not a zero', () => {
    const { problems } = readPriorLeave(
      table(
        [
          ['E002', 3],
          ['E002', 0],
        ],
        ['รหัสพนักงาน', 'ลาบวช'],
      ),
      context(),
    );
    expect(problems.map((p) => [p.row, p.code])).toEqual([
      [2, 'NOT_ELIGIBLE'],
      [3, 'DUPLICATE_IN_FILE'],
    ]);
    expect(problems[0].message).toBe('ลาบวช does not apply to สมศรี มีสุข');
  });

  it('refuses a file with no one in it', () => {
    expect(readPriorLeave(table([]), context()).problems[0].code).toBe('NO_ROWS');
  });
});

describe('parseDays', () => {
  it('takes whole and half days, as numbers or as text', () => {
    expect([0, 1, 2.5, '3', '0.5', 366].map(parseDays)).toEqual([0, 1, 2.5, 3, 0.5, 366]);
  });

  it('refuses what is not a count of days in a year', () => {
    expect([-1, 367, '1,5', 'สองวัน', '1.234', 0.001, '', '2 วัน'].map(parseDays)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
