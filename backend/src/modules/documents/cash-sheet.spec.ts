// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Decimal } from '../../core/utils/money.util';
import {
  CASH_SHEET_LAYOUT_NOTICE,
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
  // Worked by hand: 12,345.67 = 12 × 1,000 + 3 × 100 + 2 × 20 + 1 × 5, and 0.67 left over.
  it('splits into notes and coins largest first and keeps the satang as the remainder', () => {
    const split = splitCash('12345.67');
    expect(used(split.counts)).toEqual({ 1000: 12, 100: 3, 20: 2, 5: 1 });
    expect(split.paid.toString()).toBe('12345');
    expect(split.remainder.toString()).toBe('0.67');
  });

  // 1,999.99: 1,000 + 500 + 4 × 100 + 50 + 2 × 20 + 5 + 2 × 2 = 1,999; 0.99 left over.
  it('uses every denomination when the figure needs them', () => {
    const split = splitCash('1999.99');
    expect(used(split.counts)).toEqual({ 1000: 1, 500: 1, 100: 4, 50: 1, 20: 2, 5: 1, 2: 2 });
    expect(split.paid.toString()).toBe('1999');
    expect(split.remainder.toString()).toBe('0.99');
  });

  it('leaves no remainder when the pay is a whole number of baht', () => {
    const split = splitCash('6000.00');
    expect(used(split.counts)).toEqual({ 1000: 6 });
    expect(split.remainder.toString()).toBe('0');
  });

  // 17 = 10 + 5 + 2.
  it('hands out coins for what is under twenty baht', () => {
    expect(used(splitCash('17.00').counts)).toEqual({ 10: 1, 5: 1, 2: 1 });
    expect(used(splitCash('1.00').counts)).toEqual({ 1: 1 });
  });

  // 6,543.21 with nothing under 20: 6 × 1,000 + 500 + 2 × 20 = 6,540; 3.21 left over.
  it('keeps what is under the smallest unit HR chose as the remainder', () => {
    const split = splitCash('6543.21', 20);
    expect(used(split.counts)).toEqual({ 1000: 6, 500: 1, 20: 2 });
    expect(split.paid.toString()).toBe('6540');
    expect(split.remainder.toString()).toBe('3.21');
  });

  // 2,780.50 with nothing under 100: 2 × 1,000 + 500 + 2 × 100 = 2,700; 80.50 left over.
  it('can leave more than a note behind when the smallest unit is a hundred', () => {
    const split = splitCash('2780.50', 100);
    expect(used(split.counts)).toEqual({ 1000: 2, 500: 1, 100: 2 });
    expect(split.remainder.toString()).toBe('80.5');
  });

  it('hands out nothing for a pay of nothing', () => {
    const split = splitCash('0.00');
    expect(used(split.counts)).toEqual({});
    expect(split.paid.toString()).toBe('0');
    expect(split.remainder.toString()).toBe('0');
  });

  it('adds up for every baht from 1 to 2,500 at every smallest unit', () => {
    for (const unit of DENOMINATIONS) {
      for (let baht = 1; baht <= 2500; baht += 1) {
        for (const satang of ['0.00', '0.01', '0.50', '0.99']) {
          const net = new Decimal(baht).plus(satang);
          const split = splitCash(net, unit);
          expect(value(split.counts).plus(split.remainder).equals(net)).toBe(true);
          expect(split.remainder.greaterThanOrEqualTo(0)).toBe(true);
          expect(split.remainder.lessThan(unit)).toBe(true);
          for (const d of DENOMINATIONS) {
            if (d < unit) expect(split.counts[d]).toBe(0);
          }
        }
      }
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
      ['12,345.67', '12,345.00', '0.67'],
      ['1,999.99', '1,999.00', '0.99'],
      ['6,000.00', '6,000.00', '0.00'],
    ]);
  });

  // 12,345.67 + 1,999.99 + 6,000.00 = 20,345.66; remainders 0.67 + 0.99 = 1.66; cash 20,344.00.
  it('totals the run: every note and coin, the cash to withdraw, the remainders', () => {
    const sheet = cashSheet(run, slips);
    expect(sheet.totals.net).toBe('20,345.66');
    expect(sheet.totals.remainder).toBe('1.66');
    expect(sheet.totals.withdraw).toBe('20,344.00');
    // 12 + 1 + 6 thousands, 1 × 500, 3 + 4 hundreds, 1 fifty, 2 + 2 twenties, 1 + 1 fives, 2 twos.
    expect(used(sheet.totals.counts)).toEqual({
      1000: 19,
      500: 1,
      100: 7,
      50: 1,
      20: 4,
      5: 2,
      2: 2,
    });
  });

  it('keeps the acceptance sums: rows add up to net less remainder, totals to the rows', () => {
    for (const unit of DENOMINATIONS) {
      const sheet = cashSheet(run, slips, unit);
      let cash = new Decimal(0);
      for (const [i, row] of sheet.rows.entries()) {
        const net = new Decimal(slips[i]!.netPay as string);
        const remainder = new Decimal(row.remainder.replace(/,/g, ''));
        expect(value(row.counts).equals(net.minus(remainder))).toBe(true);
        expect(new Decimal(row.cash.replace(/,/g, '')).equals(value(row.counts))).toBe(true);
        cash = cash.plus(value(row.counts));
      }
      for (const d of DENOMINATIONS) {
        expect(sheet.totals.counts[d]).toBe(sheet.rows.reduce((n, r) => n + r.counts[d], 0));
      }
      const totalNet = slips.reduce((acc, s) => acc.plus(s.netPay as string), new Decimal(0));
      const totalRemainder = sheet.rows.reduce(
        (acc, r) => acc.plus(r.remainder.replace(/,/g, '')),
        new Decimal(0),
      );
      expect(new Decimal(sheet.totals.withdraw.replace(/,/g, '')).equals(cash)).toBe(true);
      expect(cash.equals(totalNet.minus(totalRemainder))).toBe(true);
    }
  });

  it('draws a column for the smallest unit and every larger one', () => {
    expect(cashSheet(run, slips).columns).toEqual([1000, 500, 100, 50, 20, 10, 5, 2, 1]);
    expect(cashSheet(run, slips, 20).columns).toEqual([1000, 500, 100, 50, 20]);
    expect(cashSheet(run, slips, 1000).columns).toEqual([1000]);
  });

  it('names the run and says the layout still awaits the pilot form', () => {
    const sheet = cashSheet(run, slips);
    expect(sheet.organizationName).toBe('บริษัท ทดสอบ จำกัด');
    expect(sheet.runNo).toBe('RUN-2026-12-H1');
    expect(sheet.layoutNotice).toBe(CASH_SHEET_LAYOUT_NOTICE);
    expect(sheet.layoutNotice).toContain('รอเทียบกับแบบฟอร์ม');
  });
});
