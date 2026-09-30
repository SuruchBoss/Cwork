// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { Cell, Table } from '../../../core/spreadsheet/table';
import {
  parseAmount,
  readOpeningBalances,
  socialSecurityLimit,
  type OpeningBalanceContext,
} from './opening-balance-import';

const HEADER: Cell[] = [
  'รหัสพนักงาน',
  'ชื่อ',
  'เงินได้ที่ต้องเสียภาษี',
  'ภาษีหัก ณ ที่จ่าย',
  'ประกันสังคม (ส่วนลูกจ้าง)',
];

function context(overrides: Partial<OpeningBalanceContext> = {}): OpeningBalanceContext {
  return {
    year: 2026,
    throughMonth: 8,
    employees: new Map([
      ['E001', { id: 'emp-1', name: 'สมชาย ใจดี' }],
      ['E002', { id: 'emp-2', name: 'สมศรี มีสุข' }],
      ['E003', { id: 'emp-3', name: 'อนุชา แก้วมณี' }],
    ]),
    paidInCwork: () => undefined,
    existing: new Set(),
    ...overrides,
  };
}

const table = (rows: Cell[][], header: Cell[] = HEADER): Table => ({
  rows: [header, ...rows],
  dateSystem: 1900,
});

describe('readOpeningBalances', () => {
  it('reads each employee’s income, tax and social security, from numbers or from CSV text', () => {
    const { rows, problems } = readOpeningBalances(
      table([
        ['E001', 'สมชาย ใจดี', 496_000, 21_433.33, 6_000],
        ['E002', 'สมศรี มีสุข', '240,000.50', '1,250', '6000.00'],
        // Listed by the template, nothing typed: left as it is.
        ['E003', 'อนุชา แก้วมณี', null, null, null],
      ]),
      context({ existing: new Set(['emp-2']) }),
    );

    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        row: 2,
        employeeId: 'emp-1',
        employeeCode: 'E001',
        name: 'สมชาย ใจดี',
        taxableIncome: 496_000,
        withholdingTax: 21_433.33,
        ssoEmployee: 6_000,
        replaces: false,
      },
      {
        row: 3,
        employeeId: 'emp-2',
        employeeCode: 'E002',
        name: 'สมศรี มีสุข',
        taxableIncome: 240_000.5,
        withholdingTax: 1_250,
        ssoEmployee: 6_000,
        replaces: true,
      },
    ]);
  });

  it('takes headings in English, as column keys, and in any order', () => {
    const { rows, problems } = readOpeningBalances(
      table(
        [[6_000, 'E001', 0, 150_000]],
        ['social_security', 'Employee code', 'TAX WITHHELD', 'Taxable income *'],
      ),
      context(),
    );
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({
      taxableIncome: 150_000,
      withholdingTax: 0,
      ssoEmployee: 6_000,
    });
  });

  it('names every problem by row and column, and returns no rows when there is one', () => {
    const { rows, problems } = readOpeningBalances(
      table([
        ['E001', 'สมชาย', 100_000, null, 3_000], // tax forgotten
        ['E999', 'ใครก็ไม่รู้', 1, 0, 0], // no such employee
        ['E002', 'สมศรี', '12,34', -5, '1.005'], // not amounts
        ['E001', 'สมชาย อีกครั้ง', 1, 0, 0], // twice
        ['E003', 'อนุชา', 10_000, 12_000, 6_750], // tax over income, SSO over 8 months
        [null, 'ไม่มีรหัส', 1, 0, 0],
      ]),
      context(),
    );

    expect(rows).toEqual([]);
    expect(problems.map((p) => [p.row, p.column ?? null, p.code, p.params ?? null])).toEqual([
      [2, 'D', 'REQUIRED', null],
      [3, 'A', 'NOT_FOUND', { what: 'employee', value: 'E999' }],
      [4, 'C', 'INVALID_AMOUNT', { value: '12,34' }],
      [4, 'D', 'INVALID_AMOUNT', { value: '-5' }],
      [4, 'E', 'INVALID_AMOUNT', { value: '1.005' }],
      [5, 'A', 'DUPLICATE_IN_FILE', { value: 'E001', other: 2 }],
      [6, 'D', 'TAX_OVER_INCOME', { value: 12_000, income: 10_000 }],
      [6, 'E', 'SSO_OVER_LIMIT', { value: 6_750, max: 6_000, months: 8 }],
      [7, 'A', 'REQUIRED', null],
    ]);
    expect(problems[0].header).toBe('ภาษีหัก ณ ที่จ่าย');
  });

  it('refuses figures for an employee Cwork has already paid within the months they cover', () => {
    const { problems } = readOpeningBalances(
      table([['E001', 'สมชาย', 496_000, 21_000, 6_000]]),
      context({ paidInCwork: (id) => (id === 'emp-1' ? '2026-08' : undefined) }),
    );

    expect(problems).toEqual([
      expect.objectContaining({
        row: 2,
        column: 'A',
        code: 'PAID_IN_CWORK',
        params: { employee: 'สมชาย ใจดี', period: '2026-08' },
      }),
    ]);
  });

  it('needs the code and all three amount columns, and knows no others', () => {
    const { problems } = readOpeningBalances(
      table([['E001', 1]], ['ชื่อ', 'เงินได้ที่ต้องเสียภาษี', 'โบนัส', 'เงินได้ที่ต้องเสียภาษี']),
      context(),
    );
    expect(problems.map((p) => [p.code, p.column ?? p.params?.column])).toEqual([
      ['UNKNOWN_COLUMN', 'C'],
      ['DUPLICATE_COLUMN', 'D'],
      ['MISSING_COLUMN', 'รหัสพนักงาน / Employee code'],
      ['MISSING_COLUMN', 'ภาษีหัก ณ ที่จ่าย / Tax withheld'],
      ['MISSING_COLUMN', 'ประกันสังคม (ส่วนลูกจ้าง) / Social security (employee)'],
    ]);
  });

  it('says so when the template comes back with nothing typed in it', () => {
    const { problems } = readOpeningBalances(
      table([
        ['E001', 'สมชาย', null, null, null],
        ['E002', 'สมศรี', null, null, null],
      ]),
      context(),
    );
    expect(problems.map((p) => p.code)).toEqual(['NO_FIGURES']);
  });

  it('says so when there are no rows at all', () => {
    expect(readOpeningBalances(table([]), context()).problems.map((p) => p.code)).toEqual([
      'NO_ROWS',
    ]);
  });
});

describe('socialSecurityLimit', () => {
  it('is the largest monthly contribution for each month, up to the annual ceiling', () => {
    expect(socialSecurityLimit(1)).toBe(750);
    expect(socialSecurityLimit(8)).toBe(6_000);
    expect(socialSecurityLimit(12)).toBe(9_000);
  });
});

describe('parseAmount', () => {
  it.each([
    [0, 0],
    [360_000, 360_000],
    [21_433.33, 21_433.33],
    [0.1 + 0.2, 0.3],
    ['360000', 360_000],
    ['360,000.00', 360_000],
    ['1,234,567.8', 1_234_567.8],
  ])('reads %p as %p', (cell, expected) => {
    expect(parseAmount(cell)).toBe(expected);
  });

  it.each([['-1'], [-1], ['1.234'], [1.234], ['12,34'], ['1,2345'], ['฿100'], ['abc'], [1e12]])(
    'refuses %p',
    (cell) => {
      expect(parseAmount(cell)).toBeNull();
    },
  );
});
