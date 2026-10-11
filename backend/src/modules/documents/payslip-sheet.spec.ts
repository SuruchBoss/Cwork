// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { PayComponentType } from '@prisma/client';
import {
  formatBaht,
  payslipDiscrepancy,
  payslipNotes,
  payslipSheet,
  periodRangeLabel,
  wageReceiptSheet,
  type PrintablePayslip,
  type PrintableRun,
} from './payslip-sheet';

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

const item = (
  code: string,
  name: string,
  type: PayComponentType,
  amount: string,
  orderIndex: number,
  quantity: string | null = null,
  rate: string | null = null,
) => ({ code, name, type, amount, orderIndex, quantity, rate });

export const slip = (over: Partial<PrintablePayslip> = {}): PrintablePayslip => ({
  id: 'slip-1',
  currency: 'THB',
  grossEarnings: '7500.00',
  totalDeductions: '1500.00',
  netPay: '6000.00',
  workedDays: '12',
  overtimeHours: '0',
  items: [
    item('CASH_ADVANCE', 'หักเงินเบิกล่วงหน้า', PayComponentType.DEDUCTION, '1500.00', 6),
    item('SUBSTITUTE_HOLIDAY', 'วันหยุดชดเชย', PayComponentType.EARNING, '500.00', 2, '1', '500'),
    item('DAILY_WAGE', 'ค่าจ้างรายวัน', PayComponentType.EARNING, '7000.00', 1, '14', '500'),
    item('SSO_ER', 'ประกันสังคม (นายจ้าง)', PayComponentType.EMPLOYER_CONTRIBUTION, '375.00', 9),
    item('UNPAID_LEAVE', 'ลาไม่รับค่าจ้าง', PayComponentType.INFORMATIONAL, '0.00', 10),
  ],
  employee: {
    employeeCode: 'EMP-0042',
    firstNameTh: 'Nguyen',
    lastNameTh: 'Van An',
    position: { title: 'ช่างเทคนิค' },
    department: { name: 'ซ่อมบำรุง' },
  },
  ...over,
});

describe('formatBaht', () => {
  it.each([
    ['1234.5', '1,234.50'],
    [0, '0.00'],
    ['1000000', '1,000,000.00'],
    ['-1500.005', '-1,500.01'],
    ['999.994', '999.99'],
  ])('writes %s as %s', (value, text) => {
    expect(formatBaht(value)).toBe(text);
  });
});

describe('periodRangeLabel', () => {
  it('collapses a period inside one month and writes years in the Buddhist era', () => {
    expect(
      periodRangeLabel(new Date('2026-12-01T00:00:00Z'), new Date('2026-12-15T00:00:00Z')),
    ).toBe('1 – 15 ธันวาคม 2569');
  });
  it('writes both dates when the period crosses a month or a year', () => {
    expect(
      periodRangeLabel(new Date('2026-12-16T00:00:00Z'), new Date('2027-01-15T00:00:00Z')),
    ).toBe('16 ธันวาคม 2569 – 15 มกราคม 2570');
  });
});

describe('payslipDiscrepancy', () => {
  it('accepts a slip whose lines add up', () => {
    expect(payslipDiscrepancy(slip())).toBeNull();
  });
  it('refuses a slip whose earnings differ from its gross', () => {
    expect(payslipDiscrepancy(slip({ grossEarnings: '7600.00', netPay: '6100.00' }))).toMatch(
      /earnings/,
    );
  });
  it('refuses a slip whose deductions differ from its total', () => {
    expect(payslipDiscrepancy(slip({ totalDeductions: '1400.00', netPay: '6100.00' }))).toMatch(
      /deductions/,
    );
  });
  it('refuses a slip whose net is not gross less deductions', () => {
    expect(payslipDiscrepancy(slip({ netPay: '6001.00' }))).toMatch(/net/);
  });
});

describe('payslipSheet', () => {
  const sheet = payslipSheet(run, slip());

  it('prints every earning and deduction line, in the slip order, with its amount', () => {
    expect(sheet.earnings.map((l) => [l.code, l.amount])).toEqual([
      ['DAILY_WAGE', '7,000.00'],
      ['SUBSTITUTE_HOLIDAY', '500.00'],
    ]);
    expect(sheet.deductions.map((l) => [l.code, l.label, l.amount])).toEqual([
      ['CASH_ADVANCE', 'หักเงินเบิกล่วงหน้า', '1,500.00'],
    ]);
  });

  it('shows how a priced line was worked out', () => {
    expect(sheet.earnings[0]!.detail).toBe('14 × 500.00');
  });

  it('leaves out what the employer pays and what is only information', () => {
    const codes = [...sheet.earnings, ...sheet.deductions].map((l) => l.code);
    expect(codes).not.toContain('SSO_ER');
    expect(codes).not.toContain('UNPAID_LEAVE');
  });

  it('carries the totals the record holds, unchanged', () => {
    expect(sheet.totals).toEqual({ gross: '7,500.00', deductions: '1,500.00', net: '6,000.00' });
  });

  it("shows a foreign worker's name as HR entered it", () => {
    expect(sheet.employee.name).toBe('Nguyen Van An');
    expect(sheet.employee.role).toBe('ช่างเทคนิค · ซ่อมบำรุง');
  });

  it('writes the period and pay date in the Buddhist era', () => {
    expect(sheet.periodLabel).toBe('1 – 15 ธันวาคม 2569');
    expect(sheet.payDateLabel).toBe('15 ธันวาคม 2569');
  });

  it('lists days worked and overtime only when there are some', () => {
    expect(sheet.facts).toEqual([{ label: 'วันทำงาน', value: '12' }]);
    const withOt = payslipSheet(run, slip({ overtimeHours: '3.5' }));
    expect(withOt.facts.map((f) => f.label)).toEqual(['วันทำงาน', 'ชั่วโมงล่วงเวลา']);
  });
});

describe('payslipNotes', () => {
  const substitute = {
    code: 'SUBSTITUTE_HOLIDAY',
    params: { days: 2, dates: '2036-11-15 → 2036-11-17, 2036-12-06 → 2036-12-08' },
  };

  it('writes the day a holiday on the weekly day off was paid instead, in the Buddhist era', () => {
    expect(payslipNotes([substitute])).toEqual([
      'วันหยุดนักขัตฤกษ์ที่ตรงวันหยุดประจำสัปดาห์ จ่ายค่าจ้างวันทำงานถัดไปแทน: ' +
        '15 พฤศจิกายน 2579 → 17 พฤศจิกายน 2579, 6 ธันวาคม 2579 → 8 ธันวาคม 2579',
    ]);
  });

  it('leaves out the warnings that are for HR to check, not for the employee to read', () => {
    expect(
      payslipNotes([
        { code: 'NO_WORK_LOCATION' },
        { code: 'INCOMPLETE_PUNCH_COUNTED', params: { days: 1, dates: '2036-11-05' } },
        { code: 'ADVANCE_CARRIED_OVER', params: { amount: 100 } },
      ]),
    ).toEqual([]);
  });

  it.each([[null], [undefined], ['x'], [{}], [[{ code: 'SUBSTITUTE_HOLIDAY' }]]])(
    'prints nothing for a warnings value it cannot read (%j)',
    (warnings) => {
      expect(payslipNotes(warnings)).toEqual([]);
    },
  );

  it('puts the notes on the sheet', () => {
    expect(payslipSheet(run, slip({ warnings: [substitute] })).notes).toHaveLength(1);
    expect(payslipSheet(run, slip()).notes).toEqual([]);
  });
});

describe('wageReceiptSheet', () => {
  it('has one row per slip with the net pay its payslip prints, and their total', () => {
    const other = slip({
      id: 'slip-2',
      netPay: '4000.50',
      employee: {
        employeeCode: 'EMP-0043',
        firstNameTh: 'สมชาย',
        lastNameTh: 'ใจดี',
        position: null,
        department: null,
      },
    });
    const receipt = wageReceiptSheet(run, [slip(), other]);
    expect(receipt.rows).toEqual([
      { employeeCode: 'EMP-0042', name: 'Nguyen Van An', net: '6,000.00' },
      { employeeCode: 'EMP-0043', name: 'สมชาย ใจดี', net: '4,000.50' },
    ]);
    expect(receipt.total).toBe('10,000.50');
  });
});
