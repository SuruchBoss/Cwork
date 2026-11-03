// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { writeXlsx } from '../../../core/spreadsheet/xlsx';
import { Decimal, round2 } from '../../../core/utils/money.util';
import type { ReconciledItem, ReconciledPeriod, ReconciledRow } from './payroll-export';
import { MONTHS_TH } from './thai-month';

/**
 * The payroll register (ทะเบียนเงินเดือน) HR sends the outside accounting firm
 * each month (CW-099): one sheet, a row per person, the month's pay split into
 * salary, daily wage, overtime and the rest, then what was taken off.
 *
 * It is a formatter over the reconciled period like every other export. It
 * adds up nothing the payslips do not already say: each column is read from the
 * payslip's own lines, and the lines were checked against the payslip's totals
 * before this runs, so a row's parts always add up to its whole.
 *
 * What the register leaves out is as deliberate as what it holds: no ID number,
 * no bank account and no employer contribution on the first sheet. The
 * employer's social security share is on a second sheet, with the month's
 * totals, so the person who needs it finds it and the register stays the one
 * HR already sends.
 */

/** The columns of the register, in the order of the form. */
export const REGISTER_COLUMNS = [
  'ลำดับที่',
  'ชื่อ-สกุล',
  'เงินเดือน',
  'วันละ',
  'จำนวนวันทำงาน',
  'จำนวนเงิน',
  'โอที',
  'อื่นๆ (ระบุ)',
  'รวมเงินได้',
  'ภาษี',
  'ประกันสังคม',
  'อื่นๆ (ระบุ)',
  'รวมหัก',
  'รวมเงินได้สุทธิ',
  // Not on the paper form: what the two "อื่นๆ (ระบุ)" columns are made of.
  'รายละเอียดอื่นๆ',
] as const;

const ZERO = new Decimal(0);

interface Person {
  code: string;
  name: string;
  salary: Decimal;
  hasSalary: boolean;
  dailyDays: Decimal;
  dailyAmount: Decimal;
  dailyRates: Set<string>;
  overtime: Decimal;
  otherEarnings: Map<string, Decimal>;
  gross: Decimal;
  tax: Decimal;
  sso: Decimal;
  deductions: Decimal;
  otherDeductions: Map<string, Decimal>;
  net: Decimal;
}

const isOvertime = (item: ReconciledItem) => item.code === 'OT' || item.code.startsWith('OT_');
const isDailyWage = (item: ReconciledItem) => item.code === 'BASE' && item.quantity !== null;
const isStatutory = (item: ReconciledItem) => item.code === 'WHT' || item.code === 'SSO';

function add(map: Map<string, Decimal>, name: string, amount: Decimal): void {
  map.set(name, (map.get(name) ?? ZERO).plus(amount));
}

/**
 * One person is one row, whatever number of payslips they have in the period (a
 * month paid in two halves, a second run for a correction): their figures are
 * added, so the sheet's totals are still the period's.
 */
function peopleOf(rows: ReconciledRow[]): Person[] {
  const byCode = new Map<string, Person>();
  for (const row of rows) {
    let person = byCode.get(row.employeeCode);
    if (!person) {
      person = {
        code: row.employeeCode,
        name: row.fullNameTh,
        salary: ZERO,
        hasSalary: false,
        dailyDays: ZERO,
        dailyAmount: ZERO,
        dailyRates: new Set(),
        overtime: ZERO,
        otherEarnings: new Map(),
        gross: ZERO,
        tax: ZERO,
        sso: ZERO,
        deductions: ZERO,
        otherDeductions: new Map(),
        net: ZERO,
      };
      byCode.set(row.employeeCode, person);
    }

    for (const item of row.items) {
      if (item.type === 'EARNING') {
        if (isDailyWage(item)) {
          person.dailyDays = person.dailyDays.plus(item.quantity ?? ZERO);
          person.dailyAmount = person.dailyAmount.plus(item.amount);
          person.dailyRates.add((item.rate ?? ZERO).toFixed(2));
        } else if (item.code === 'BASE') {
          person.salary = person.salary.plus(item.amount);
          person.hasSalary = true;
        } else if (isOvertime(item)) {
          person.overtime = person.overtime.plus(item.amount);
        } else {
          add(person.otherEarnings, item.name, item.amount);
        }
      } else if (item.type === 'DEDUCTION' && !isStatutory(item)) {
        add(person.otherDeductions, item.name, item.amount);
      }
    }

    person.gross = person.gross.plus(row.grossEarnings);
    person.tax = person.tax.plus(row.withholdingTax);
    person.sso = person.sso.plus(row.ssoEmployee);
    person.deductions = person.deductions.plus(row.totalDeductions);
    person.net = person.net.plus(row.netPay);
  }
  return [...byCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code, 'en', { numeric: true, sensitivity: 'base' }),
  );
}

const sumOf = (map: Map<string, Decimal>) =>
  [...map.values()].reduce((acc, value) => acc.plus(value), ZERO);

/** "1,000.00": the way an amount reads inside a sentence. */
const plain = (value: Decimal) =>
  Number(round2(value).toFixed(2)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const listed = (map: Map<string, Decimal>) =>
  [...map.entries()].map(([name, amount]) => `${name} ${plain(amount)}`).join('; ');

/** A figure for a cell: a number when there is one, an empty cell when there is nothing to show. */
const figure = (value: Decimal): number | '' => (value.isZero() ? '' : round2(value).toNumber());

export function buildPayrollRegister(reconciled: ReconciledPeriod): Uint8Array {
  const { period } = reconciled;
  const people = peopleOf(reconciled.rows);

  const title = `ทะเบียนเงินเดือนประจำเดือน ${MONTHS_TH[period.month - 1] ?? period.month} ปี ${period.year + 543}`;
  const blanks = (count: number): string[] => Array.from({ length: count }, () => '');

  const rows: (string | number)[][] = [
    [title, ...blanks(REGISTER_COLUMNS.length - 1)],
    // The two groups of the form, over the columns they hold.
    [...blanks(2), 'รายการเงินได้', ...blanks(6), 'รายการหัก', ...blanks(5)],
    // The daily wage is three columns under one heading.
    [...blanks(3), 'ค่าแรงรายวัน', ...blanks(11)],
    [...REGISTER_COLUMNS],
  ];

  const total = {
    salary: ZERO,
    daily: ZERO,
    overtime: ZERO,
    other: ZERO,
    gross: ZERO,
    tax: ZERO,
    sso: ZERO,
    otherDeduction: ZERO,
    deductions: ZERO,
    net: ZERO,
  };

  people.forEach((person, index) => {
    const otherEarnings = sumOf(person.otherEarnings);
    // What is left of the deductions once tax and social security are taken out;
    // the lines were checked, so this is exactly the other deduction lines.
    const otherDeductions = person.deductions.minus(person.tax).minus(person.sso);
    const rate = person.dailyRates.size === 1 ? [...person.dailyRates][0]! : '';
    const hasDaily = person.dailyRates.size > 0;

    const notes = [
      person.otherEarnings.size > 0 ? `เงินได้อื่นๆ: ${listed(person.otherEarnings)}` : '',
      person.otherDeductions.size > 0 ? `หักอื่นๆ: ${listed(person.otherDeductions)}` : '',
    ].filter(Boolean);

    rows.push([
      index + 1,
      person.name,
      person.hasSalary ? round2(person.salary).toNumber() : '',
      rate === '' ? '' : Number(rate),
      hasDaily ? person.dailyDays.toNumber() : '',
      hasDaily ? round2(person.dailyAmount).toNumber() : '',
      figure(person.overtime),
      figure(otherEarnings),
      round2(person.gross).toNumber(),
      round2(person.tax).toNumber(),
      round2(person.sso).toNumber(),
      figure(otherDeductions),
      round2(person.deductions).toNumber(),
      round2(person.net).toNumber(),
      notes.join(' | '),
    ]);

    total.salary = total.salary.plus(person.salary);
    total.daily = total.daily.plus(person.dailyAmount);
    total.overtime = total.overtime.plus(person.overtime);
    total.other = total.other.plus(otherEarnings);
    total.gross = total.gross.plus(person.gross);
    total.tax = total.tax.plus(person.tax);
    total.sso = total.sso.plus(person.sso);
    total.otherDeduction = total.otherDeduction.plus(otherDeductions);
    total.deductions = total.deductions.plus(person.deductions);
    total.net = total.net.plus(person.net);
  });

  const n = (value: Decimal) => round2(value).toNumber();
  rows.push([
    '',
    'รวม',
    n(total.salary),
    '',
    '',
    n(total.daily),
    n(total.overtime),
    n(total.other),
    n(total.gross),
    n(total.tax),
    n(total.sso),
    n(total.otherDeduction),
    n(total.deductions),
    n(total.net),
    '',
  ]);

  const employer = reconciled.rows.reduce((acc, row) => acc.plus(row.ssoEmployer), ZERO);
  const summary: (string | number)[][] = [
    [
      `สรุปยอดประจำเดือน ${MONTHS_TH[period.month - 1] ?? period.month} ปี ${period.year + 543}`,
      '',
    ],
    ['รายการ', 'จำนวนเงิน'],
    ['รวมเงินได้', n(total.gross)],
    ['ภาษีหัก ณ ที่จ่าย', n(total.tax)],
    ['ประกันสังคม (ส่วนลูกจ้าง)', n(total.sso)],
    // Everything else taken off (a provident fund, a loan, a cash advance), so
    // that earnings less the three deductions above is the net pay below.
    ['หักอื่นๆ', n(total.otherDeduction)],
    ['รวมเงินได้สุทธิ', n(total.net)],
    ['', ''],
    // The employer's share is not taken from anyone's pay, so it sits apart.
    ['ประกันสังคม (ส่วนนายจ้าง)', n(employer)],
    ['ประกันสังคมรวม (ลูกจ้าง + นายจ้าง)', n(total.sso.plus(employer))],
  ];

  return writeXlsx([
    {
      name: 'ทะเบียนเงินเดือน',
      rows,
      headerRows: 4,
      merges: ['A1:O1', 'C2:I2', 'J2:M2', 'D3:F3'],
      widths: [8, 28, 14, 12, 14, 14, 12, 14, 15, 12, 14, 14, 14, 16, 48],
      amountColumns: [2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      print: true,
      grid: true,
    },
    {
      name: 'สรุปยอด',
      rows: summary,
      headerRows: 2,
      merges: ['A1:B1'],
      widths: [34, 18],
      amountColumns: [1],
      print: true,
      grid: true,
    },
  ]);
}
