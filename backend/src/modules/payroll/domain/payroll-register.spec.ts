// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { strFromU8, unzipSync } from 'fflate';
import { readXlsx } from '../../../core/spreadsheet/xlsx';
import {
  ACCOUNTANT_FORMAT,
  CSV_FORMAT,
  REGISTER_FORMAT,
  reconcilePeriod,
  resolveExportFormat,
  type ExportItem,
  type ExportPayslip,
  type ExportRun,
} from './payroll-export';
import { REGISTER_COLUMNS } from './payroll-register';

const period = { code: 'PR-2026-01', year: 2026, month: 1 };

const line = (
  code: string,
  name: string,
  type: 'EARNING' | 'DEDUCTION',
  amount: string,
  quantity: string | null = null,
  rate: string | null = null,
): ExportItem => ({ code, name, type, amount, quantity, rate });

/** A monthly employee: salary, overtime, two other earnings, tax, social security, a loan repayment. */
function monthly(overrides: Partial<ExportPayslip> = {}): ExportPayslip {
  return {
    employeeCode: 'EMP001',
    firstNameTh: 'สมชาย',
    lastNameTh: 'ใจดี',
    departmentName: 'บัญชี',
    currency: 'THB',
    grossEarnings: '34000.00',
    totalDeductions: '2250.00',
    taxableIncome: '34000.00',
    withholdingTax: '1000.00',
    ssoEmployee: '750.00',
    ssoEmployer: '750.00',
    netPay: '31750.00',
    taxId: '1234567890123',
    items: [
      line('BASE', 'เงินเดือน', 'EARNING', '30000.00'),
      line('OT_NORMAL', 'ค่าล่วงเวลา (1.5x)', 'EARNING', '1000.00', '5', '200.00'),
      line('RENT', 'ค่าที่พัก', 'EARNING', '1000.00'),
      line('BONUS', 'โบนัส', 'EARNING', '2000.00'),
      line('SSO', 'ประกันสังคม', 'DEDUCTION', '750.00'),
      line('WHT', 'ภาษีหัก ณ ที่จ่าย', 'DEDUCTION', '1000.00'),
      line('LOAN', 'เงินยืม', 'DEDUCTION', '500.00'),
    ],
    ...overrides,
  };
}

/** A daily-wage employee: twenty days at 400, no tax. */
function daily(overrides: Partial<ExportPayslip> = {}): ExportPayslip {
  return {
    employeeCode: 'EMP002',
    firstNameTh: 'สมหญิง',
    lastNameTh: 'รักงาน',
    departmentName: 'คลัง',
    currency: 'THB',
    grossEarnings: '8000.00',
    totalDeductions: '400.00',
    taxableIncome: '8000.00',
    withholdingTax: '0.00',
    ssoEmployee: '400.00',
    ssoEmployer: '400.00',
    netPay: '7600.00',
    items: [
      line('BASE', 'ค่าจ้างรายวัน', 'EARNING', '8000.00', '20', '400.00'),
      line('SSO', 'ประกันสังคม', 'DEDUCTION', '400.00'),
    ],
    ...overrides,
  };
}

function run(payslips: ExportPayslip[], overrides: Partial<ExportRun> = {}): ExportRun {
  const total = (field: 'grossEarnings' | 'totalDeductions' | 'netPay') =>
    payslips.reduce((acc, s) => acc + Number(s[field]), 0).toFixed(2);
  return {
    runNo: 'RUN-2026-01-01',
    status: 'APPROVED',
    employeeCount: payslips.length,
    totalGross: total('grossEarnings'),
    totalDeduction: total('totalDeductions'),
    totalNet: total('netPay'),
    payslips,
    ...overrides,
  };
}

const reconciled = (payslips = [monthly(), daily()]) => reconcilePeriod(period, [run(payslips)]);
const register = (payslips?: ExportPayslip[]) =>
  readXlsx(REGISTER_FORMAT.build(reconciled(payslips)) as Uint8Array).rows;

// Rows 0-3 are the title and the headings; people follow; the last row is the total.
const HEADINGS = 4;

describe('payroll register (CW-099)', () => {
  it('has the title and the columns of the form, in order', () => {
    const rows = register();
    expect(rows[0]![0]).toBe('ทะเบียนเงินเดือนประจำเดือน มกราคม ปี 2569');
    expect(rows[1]!.slice(2, 3)).toEqual(['รายการเงินได้']);
    expect(rows[1]![9]).toBe('รายการหัก');
    expect(rows[2]![3]).toBe('ค่าแรงรายวัน');
    expect(rows[3]).toEqual([...REGISTER_COLUMNS]);
    expect(REGISTER_COLUMNS.slice(0, 14)).toEqual([
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
    ]);
  });

  it('splits a monthly employee into salary, overtime and the rest, and says what the rest is', () => {
    const [
      ,
      ,
      salary,
      rate,
      days,
      dailyAmount,
      overtime,
      other,
      gross,
      tax,
      sso,
      otherDed,
      ded,
      net,
      note,
    ] = register()[HEADINGS]!;
    expect([salary, rate, days, dailyAmount]).toEqual([30000, null, null, null]);
    expect(overtime).toBe(1000);
    expect(other).toBe(3000);
    expect(gross).toBe(34000);
    expect([tax, sso, otherDed, ded, net]).toEqual([1000, 750, 500, 2250, 31750]);
    expect(note).toBe(
      'เงินได้อื่นๆ: ค่าที่พัก 1,000.00; โบนัส 2,000.00 | หักอื่นๆ: เงินยืม 500.00',
    );
  });

  it('puts a daily wage in its three columns that multiply out, and leaves salary empty', () => {
    const row = register()[HEADINGS + 1]!;
    const [, name, salary, rate, days, amount] = row;
    expect(name).toBe('สมหญิง รักงาน');
    expect(salary).toBeNull();
    expect([rate, days, amount]).toEqual([400, 20, 8000]);
    expect(Number(rate) * Number(days)).toBe(amount);
    expect([row[8], row[9], row[10], row[12], row[13]]).toEqual([8000, 0, 400, 400, 7600]);
  });

  it('numbers the people and totals every money column to the period totals', () => {
    const data = reconciled();
    const rows = readXlsx(REGISTER_FORMAT.build(data) as Uint8Array).rows;
    expect(rows[HEADINGS]![0]).toBe(1);
    expect(rows[HEADINGS + 1]![0]).toBe(2);

    const totals = rows[rows.length - 1]!;
    expect(totals[1]).toBe('รวม');
    expect(totals[8]).toBe(data.totals.gross.toNumber());
    expect(totals[12]).toBe(data.totals.deduction.toNumber());
    expect(totals[13]).toBe(data.totals.net.toNumber());
    // The parts add up to the whole, column by column.
    expect(Number(totals[2]) + Number(totals[5]) + Number(totals[6]) + Number(totals[7])).toBe(
      totals[8],
    );
    expect(Number(totals[9]) + Number(totals[10]) + Number(totals[11])).toBe(totals[12]);
    expect(Number(totals[8]) - Number(totals[12])).toBe(totals[13]);
  });

  it('prints no tax ID, no employer share and no bank number on the register sheet', () => {
    const bytes = REGISTER_FORMAT.build(reconciled()) as Uint8Array;
    const parts = unzipSync(bytes);
    const first = strFromU8(parts['xl/worksheets/sheet1.xml']!);
    const second = strFromU8(parts['xl/worksheets/sheet2.xml']!);

    expect(first).not.toContain('1234567890123');
    expect(first).not.toMatch(/นายจ้าง|Employer|บัญชีธนาคาร|เลขบัตร/);
    expect(REGISTER_COLUMNS.join(' ')).not.toMatch(/นายจ้าง/);
    // The employer's share (750 + 400) is on the summary sheet, as a period total.
    expect(second).toContain('ประกันสังคม (ส่วนนายจ้าง)');
    expect(second).toContain('<v>1150</v>');
    expect(REGISTER_FORMAT.needsTaxIds).toBeUndefined();
  });

  it('adds up one person’s payslips from several runs into one row', () => {
    const half = (code: string, amount: string): ExportPayslip =>
      daily({
        employeeCode: code,
        grossEarnings: amount,
        totalDeductions: '0.00',
        netPay: amount,
        ssoEmployee: '0.00',
        items: [line('BASE', 'ค่าจ้างรายวัน', 'EARNING', amount, '10', '400.00')],
      });
    const result = reconcilePeriod(period, [
      run([half('EMP002', '4000.00')], { runNo: 'RUN-A' }),
      run([half('EMP002', '4000.00')], { runNo: 'RUN-B' }),
    ]);
    const rows = readXlsx(REGISTER_FORMAT.build(result) as Uint8Array).rows;

    expect(rows).toHaveLength(HEADINGS + 2); // one person, one total row
    expect([rows[HEADINGS]![3], rows[HEADINGS]![4], rows[HEADINGS]![5]]).toEqual([400, 20, 8000]);
  });

  it('leaves the day rate empty when the days were paid at different rates', () => {
    const slips = [
      daily({
        items: [
          line('BASE', 'ค่าจ้างรายวัน', 'EARNING', '4000.00', '10', '400.00'),
          line('BASE', 'ค่าจ้างรายวัน', 'EARNING', '4500.00', '10', '450.00'),
          line('SSO', 'ประกันสังคม', 'DEDUCTION', '400.00'),
        ],
        grossEarnings: '8500.00',
        netPay: '8100.00',
      }),
    ];
    const row = register(slips)[HEADINGS]!;
    expect([row[3], row[4], row[5]]).toEqual([null, 20, 8500]);
  });

  it('refuses a payslip whose lines do not add up to its gross, naming the difference', () => {
    expect(() =>
      reconcilePeriod(period, [run([monthly({ grossEarnings: '34100.00', netPay: '31850.00' })])]),
    ).toThrow(/EMP001 in run RUN-2026-01-01 does not reconcile: its earnings lines.*difference/);
  });

  it('refuses a payslip whose tax line is not the tax the payslip records', () => {
    expect(() =>
      reconcilePeriod(period, [
        run([monthly({ withholdingTax: '900.00', ssoEmployee: '850.00' })]),
      ]),
    ).toThrow(/its withholding tax lines total/);
  });

  it('is found by its id, and the other formats are as they were', () => {
    expect(resolveExportFormat('register')).toBe(REGISTER_FORMAT);
    expect(REGISTER_FORMAT.extension).toBe('xlsx');
    expect(REGISTER_FORMAT.needsItems).toBe(true);
    expect(CSV_FORMAT.needsItems).toBeUndefined();
    expect(ACCOUNTANT_FORMAT.needsItems).toBeUndefined();
  });
});
