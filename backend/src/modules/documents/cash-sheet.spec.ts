// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Decimal } from '../../core/utils/money.util';
import {
  DENOMINATIONS,
  cashSheet,
  splitCash,
  type CashCounts,
  type Denomination,
} from './cash-sheet';
import type { PrintableRun } from './payslip-sheet';
import { slip } from './payslip-sheet.spec';

const run: PrintableRun = {
  runNo: 'RUN-2026-12-H1',
  period: {
    code: '2026-12-H1',
    periodStart: new Date('2026-12-01T00:00:00Z'),
    periodEnd: new Date('2026-12-15T00:00:00Z'),
    payDate: new Date('2026-12-15T00:00:00Z'),
  },
  organization: { name: 'ทดสอบ', legalName: 'บริษัท ทดสอบ จำกัด', taxId: '0105500000001' },
};

/** Only the denominations that are used, so a worked example reads at a glance. */
const used = (counts: CashCounts): Partial<Record<Denomination, number>> =>
  Object.fromEntries(
    DENOMINATIONS.filter((d) => counts[d] > 0).map((d) => [d, counts[d]]),
  ) as Partial<Record<Denomination, number>>;

const value = (counts: CashCounts) =>
  DENOMINATIONS.reduce((acc, d) => acc.plus(new Decimal(counts[d]).times(d)), new Decimal(0));

describe('splitCash', () => {
  // Worked by hand: 12,345.67 = 12 × 1,000 + 3 × 100 + 2 × 20 + 5 + 0.50, and 0.17 left over.
  it('splits into notes and coins largest first and keeps what is under 25 satang', () => {
    const split = splitCash('12345.67');
    expect(used(split.counts)).toEqual({ 1000: 12, 100: 3, 20: 2, 5: 1, 0.5: 1 });
    expect(split.paid.toString()).toBe('12345.5');
    expect(split.remainder.toString()).toBe('0.17');
  });

  // 1,999.99: 1,000 + 500 + 4 × 100 + 50 + 2 × 20 + 5 + 2 × 2 = 1,999, then 0.50 + 0.25; 0.24 left.
  it('uses every denomination when the figure needs them', () => {
    const split = splitCash('1999.99');
    expect(used(split.counts)).toEqual({
      1000: 1,
      500: 1,
      100: 4,
      50: 1,
      20: 2,
      5: 1,
      2: 2,
      0.5: 1,
      0.25: 1,
    });
    expect(split.paid.toString()).toBe('1999.75');
    expect(split.remainder.toString()).toBe('0.24');
  });

  it('leaves no remainder when the pay splits exactly', () => {
    expect(used(splitCash('6000.00').counts)).toEqual({ 1000: 6 });
    expect(splitCash('6000.00').remainder.toString()).toBe('0');
    // 2,780.50 = 2 × 1,000 + 500 + 2 × 100 + 50 + 20 + 10 + 0.50
    const split = splitCash('2780.50');
    expect(used(split.counts)).toEqual({ 1000: 2, 500: 1, 100: 2, 50: 1, 20: 1, 10: 1, 0.5: 1 });
    expect(split.remainder.toString()).toBe('0');
  });

  // 17 = 10 + 5 + 2.
  it('hands out baht coins for what is under twenty baht', () => {
    expect(used(splitCash('17.00').counts)).toEqual({ 10: 1, 5: 1, 2: 1 });
    expect(used(splitCash('1.00').counts)).toEqual({ 1: 1 });
  });

  it('hands out the satang coins: 0.75 is a half and a quarter, 20.25 a note and a quarter', () => {
    expect(used(splitCash('0.75').counts)).toEqual({ 0.5: 1, 0.25: 1 });
    expect(used(splitCash('0.50').counts)).toEqual({ 0.5: 1 });
    expect(used(splitCash('0.25').counts)).toEqual({ 0.25: 1 });
    expect(used(splitCash('20.25').counts)).toEqual({ 20: 1, 0.25: 1 });
  });

  it('keeps a pay under 25 satang as the remainder and hands out nothing', () => {
    const split = splitCash('0.24');
    expect(used(split.counts)).toEqual({});
    expect(split.paid.toString()).toBe('0');
    expect(split.remainder.toString()).toBe('0.24');
  });

  it('hands out nothing for a pay of nothing', () => {
    const split = splitCash('0.00');
    expect(used(split.counts)).toEqual({});
    expect(split.paid.toString()).toBe('0');
    expect(split.remainder.toString()).toBe('0');
  });

  it('adds up for every satang from 0.00 to 300.00 and for sampled larger pays', () => {
    const nets: Decimal[] = [];
    for (let satang = 0; satang <= 30_000; satang += 1) nets.push(new Decimal(satang).div(100));
    for (let baht = 301; baht <= 99_999; baht += 997) {
      for (const cents of [0, 1, 24, 25, 49, 50, 74, 75, 99]) {
        nets.push(new Decimal(baht).plus(new Decimal(cents).div(100)));
      }
    }
    for (const net of nets) {
      const split = splitCash(net);
      expect(value(split.counts).equals(split.paid)).toBe(true);
      expect(split.paid.plus(split.remainder).equals(net)).toBe(true);
      expect(split.remainder.greaterThanOrEqualTo(0)).toBe(true);
      expect(split.remainder.lessThan(0.25)).toBe(true);
    }
  });
});

describe('cashSheet', () => {
  const slips = [
    slip({ id: 'a', netPay: '12345.67' }),
    slip({
      id: 'b',
      netPay: '1999.99',
      employee: {
        employeeCode: 'EMP-0043',
        firstNameTh: 'สมหญิง',
        lastNameTh: 'ใจดี',
        position: null,
        department: null,
      },
    }),
    slip({
      id: 'c',
      netPay: '6000.00',
      employee: {
        employeeCode: 'EMP-0044',
        firstNameTh: 'วีระ',
        lastNameTh: 'มั่นคง',
        position: null,
        department: null,
      },
    }),
  ];

  it('prints each net pay exactly, its cash and what is left over', () => {
    const sheet = cashSheet(run, slips);
    expect(sheet.rows.map((r) => [r.net, r.cash, r.remainder])).toEqual([
      ['12,345.67', '12,345.50', '0.17'],
      ['1,999.99', '1,999.75', '0.24'],
      ['6,000.00', '6,000.00', '0.00'],
    ]);
  });

  // Net 12,345.67 + 1,999.99 + 6,000.00 = 20,345.66; remainders 0.17 + 0.24 = 0.41;
  // cash 20,345.66 − 0.41 = 20,345.25.
  it('totals the run: every note and coin, the cash to withdraw, the remainders', () => {
    const sheet = cashSheet(run, slips);
    expect(sheet.totals.net).toBe('20,345.66');
    expect(sheet.totals.remainder).toBe('0.41');
    expect(sheet.totals.withdraw).toBe('20,345.25');
    // 12 + 1 + 6 thousands, 1 × 500, 3 + 4 hundreds, 1 fifty, 2 + 2 twenties, 1 + 1 fives,
    // 2 twos, and two halves and one quarter.
    expect(used(sheet.totals.counts)).toEqual({
      1000: 19,
      500: 1,
      100: 7,
      50: 1,
      20: 4,
      5: 2,
      2: 2,
      0.5: 2,
      0.25: 1,
    });
  });

  it('keeps the acceptance sums: rows add up to net less remainder, totals to the rows', () => {
    const sheet = cashSheet(run, slips);
    const plain = (text: string) => new Decimal(text.replace(/,/g, ''));
    let cash = new Decimal(0);
    for (const [i, row] of sheet.rows.entries()) {
      const net = new Decimal(slips[i]!.netPay as string);
      expect(value(row.counts).equals(net.minus(plain(row.remainder)))).toBe(true);
      expect(plain(row.cash).equals(value(row.counts))).toBe(true);
      cash = cash.plus(value(row.counts));
    }
    for (const d of DENOMINATIONS) {
      expect(sheet.totals.counts[d]).toBe(sheet.rows.reduce((n, r) => n + r.counts[d], 0));
    }
    const totalNet = slips.reduce((acc, s) => acc.plus(s.netPay as string), new Decimal(0));
    const totalRemainder = sheet.rows.reduce(
      (acc, r) => acc.plus(plain(r.remainder)),
      new Decimal(0),
    );
    expect(plain(sheet.totals.withdraw).equals(cash)).toBe(true);
    expect(cash.equals(totalNet.minus(totalRemainder))).toBe(true);
    expect(plain(sheet.totals.remainder).equals(totalRemainder)).toBe(true);
  });

  it('draws a column for every note and coin, largest first', () => {
    expect(cashSheet(run, slips).columns).toEqual([1000, 500, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25]);
  });

  it('names the run', () => {
    const sheet = cashSheet(run, slips);
    expect(sheet.organizationName).toBe('บริษัท ทดสอบ จำกัด');
    expect(sheet.runNo).toBe('RUN-2026-12-H1');
  });
});
