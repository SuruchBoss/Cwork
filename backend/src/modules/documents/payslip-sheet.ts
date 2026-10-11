// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { PayComponentType } from '@prisma/client';
import { Decimal } from '../../core/utils/money.util';
import { formatThaiDocumentDate } from '../../core/utils/date.util';

/**
 * What a printed payslip and a wage receipt say (CW-071), kept pure so the
 * wording, the figures and the rule that a slip must add up are tested without
 * drawing a PDF. The renderers only place what these functions return.
 *
 * A printed slip is the payslip record itself: every earning and deduction
 * line it holds, and its three totals, with nothing recalculated here.
 */

/** The payslip as the payroll service reads it, trimmed to what is printed. */
export interface PrintablePayslip {
  id: string;
  currency: string;
  grossEarnings: Decimal | string | number;
  totalDeductions: Decimal | string | number;
  netPay: Decimal | string | number;
  workedDays: Decimal | string | number;
  overtimeHours: Decimal | string | number;
  /** What HR was told about the slip; only the notes that explain pay are printed. */
  warnings?: unknown;
  items: Array<{
    code: string;
    name: string;
    type: PayComponentType;
    quantity: Decimal | string | number | null;
    rate: Decimal | string | number | null;
    amount: Decimal | string | number;
    orderIndex: number;
  }>;
  employee: {
    employeeCode: string;
    firstNameTh: string;
    lastNameTh: string;
    position: { title: string } | null;
    department: { name: string } | null;
  };
}

export interface PrintableRun {
  runNo: string;
  period: {
    code: string;
    periodStart: Date;
    periodEnd: Date;
    payDate: Date;
  };
  organization: { name: string; legalName: string | null; taxId: string | null };
}

export interface SheetLine {
  code: string;
  label: string;
  /** "10 × 500.00" for a line priced by quantity; null for a flat amount. */
  detail: string | null;
  amount: string;
}

export interface PayslipSheet {
  organizationName: string;
  taxId: string | null;
  runNo: string;
  periodLabel: string;
  payDateLabel: string;
  currency: string;
  employee: { code: string; name: string; role: string | null };
  earnings: SheetLine[];
  deductions: SheetLine[];
  /** Facts about the period that are not money: days worked, overtime hours. */
  facts: Array<{ label: string; value: string }>;
  /** Plain statements about how the pay came about, in the employee's words. */
  notes: string[];
  totals: { gross: string; deductions: string; net: string };
}

/** 1,234.5 → "1,234.50": the figure as a Thai payslip writes it, no currency sign. */
export function formatBaht(value: Decimal | string | number): string {
  const fixed = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  const [whole, fraction] = fixed.split('.');
  const negative = whole!.startsWith('-');
  const digits = negative ? whole!.slice(1) : whole!;
  return `${negative ? '-' : ''}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

/** 10.0000 → "10", 2.5 → "2.5": a quantity without padding zeros. */
function formatQuantity(value: Decimal | string | number): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
}

/**
 * "1 – 15 ธันวาคม 2569" for a period inside one month, the whole of both
 * dates for one that is not.
 */
export function periodRangeLabel(start: Date, end: Date): string {
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  if (!sameMonth) return `${formatThaiDocumentDate(start)} – ${formatThaiDocumentDate(end)}`;
  const month = formatThaiDocumentDate(end).split(' ').slice(1).join(' ');
  return `${start.getUTCDate()} – ${end.getUTCDate()} ${month}`;
}

/**
 * Why this payslip cannot be printed, or null if it can: its lines have to add
 * up to its totals, the same rule an export applies. A slip that does not is a
 * figure someone would sign for.
 */
export function payslipDiscrepancy(slip: PrintablePayslip): string | null {
  const total = (type: PayComponentType) =>
    slip.items
      .filter((item) => item.type === type)
      .reduce((acc, item) => acc.plus(item.amount), new Decimal(0));
  const gross = new Decimal(slip.grossEarnings);
  const deductions = new Decimal(slip.totalDeductions);
  const net = new Decimal(slip.netPay);

  if (!total(PayComponentType.EARNING).minus(gross).abs().lessThan(0.005)) {
    return `earnings ${total(PayComponentType.EARNING).toFixed(2)} ≠ gross ${gross.toFixed(2)}`;
  }
  if (!total(PayComponentType.DEDUCTION).minus(deductions).abs().lessThan(0.005)) {
    return `deductions ${total(PayComponentType.DEDUCTION).toFixed(2)} ≠ total ${deductions.toFixed(2)}`;
  }
  if (!gross.minus(deductions).minus(net).abs().lessThan(0.005)) {
    return `gross − deductions ${gross.minus(deductions).toFixed(2)} ≠ net ${net.toFixed(2)}`;
  }
  return null;
}

/**
 * The warnings a payslip carries are for HR to check before approval, and most
 * of them (a missing work location, a punch left open) are not for the employee
 * to read. The ones that say how the pay came about are, and these are written
 * out here: today the day a public holiday on the weekly day off was paid instead.
 */
export function payslipNotes(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return [];
  const notes: string[] = [];
  for (const warning of warnings as Array<{ code?: unknown; params?: Record<string, unknown> }>) {
    if (warning?.code !== 'SUBSTITUTE_HOLIDAY') continue;
    // "2036-11-15 → 2036-11-17, ..." : the holiday, then the working day paid for it.
    const pairs = String(warning.params?.dates ?? '')
      .split(',')
      .map((pair) => pair.split('→').map((date) => date.trim()))
      .filter((pair) => pair.length === 2 && pair.every(Boolean))
      .map(
        ([holiday, paidOn]) =>
          `${formatThaiDocumentDate(holiday!)} → ${formatThaiDocumentDate(paidOn!)}`,
      );
    if (pairs.length > 0) {
      notes.push(
        `วันหยุดนักขัตฤกษ์ที่ตรงวันหยุดประจำสัปดาห์ จ่ายค่าจ้างวันทำงานถัดไปแทน: ${pairs.join(', ')}`,
      );
    }
  }
  return notes;
}

function lineOf(item: PrintablePayslip['items'][number]): SheetLine {
  const priced =
    item.quantity !== null &&
    item.rate !== null &&
    new Decimal(item.quantity).greaterThan(0) &&
    new Decimal(item.rate).greaterThan(0);
  return {
    code: item.code,
    label: item.name,
    detail: priced ? `${formatQuantity(item.quantity!)} × ${formatBaht(item.rate!)}` : null,
    amount: formatBaht(item.amount),
  };
}

export function payslipSheet(run: PrintableRun, slip: PrintablePayslip): PayslipSheet {
  const ordered = [...slip.items].sort((a, b) => a.orderIndex - b.orderIndex);
  const lines = (type: PayComponentType) =>
    ordered.filter((item) => item.type === type).map(lineOf);

  const facts: PayslipSheet['facts'] = [];
  if (new Decimal(slip.workedDays).greaterThan(0)) {
    facts.push({ label: 'วันทำงาน', value: formatQuantity(slip.workedDays) });
  }
  if (new Decimal(slip.overtimeHours).greaterThan(0)) {
    facts.push({ label: 'ชั่วโมงล่วงเวลา', value: formatQuantity(slip.overtimeHours) });
  }

  const employee = slip.employee;
  const role = [employee.position?.title, employee.department?.name].filter(Boolean).join(' · ');
  return {
    organizationName: run.organization.legalName || run.organization.name,
    taxId: run.organization.taxId,
    runNo: run.runNo,
    periodLabel: periodRangeLabel(run.period.periodStart, run.period.periodEnd),
    payDateLabel: formatThaiDocumentDate(run.period.payDate),
    currency: slip.currency,
    employee: {
      code: employee.employeeCode,
      name: `${employee.firstNameTh} ${employee.lastNameTh}`.trim(),
      role: role || null,
    },
    earnings: lines(PayComponentType.EARNING),
    deductions: lines(PayComponentType.DEDUCTION),
    facts,
    notes: payslipNotes(slip.warnings),
    totals: {
      gross: formatBaht(slip.grossEarnings),
      deductions: formatBaht(slip.totalDeductions),
      net: formatBaht(slip.netPay),
    },
  };
}

export interface ReceiptRow {
  employeeCode: string;
  name: string;
  net: string;
}

export interface WageReceiptSheet {
  organizationName: string;
  taxId: string | null;
  runNo: string;
  periodLabel: string;
  payDateLabel: string;
  currency: string;
  rows: ReceiptRow[];
  total: string;
}

/** One row per employee with the net pay a payslip prints, and the run's total of them. */
export function wageReceiptSheet(run: PrintableRun, slips: PrintablePayslip[]): WageReceiptSheet {
  const currency = slips[0]?.currency ?? 'THB';
  const total = slips.reduce((acc, slip) => acc.plus(slip.netPay), new Decimal(0));
  return {
    organizationName: run.organization.legalName || run.organization.name,
    taxId: run.organization.taxId,
    runNo: run.runNo,
    periodLabel: periodRangeLabel(run.period.periodStart, run.period.periodEnd),
    payDateLabel: formatThaiDocumentDate(run.period.payDate),
    currency,
    rows: slips.map((slip) => ({
      employeeCode: slip.employee.employeeCode,
      name: `${slip.employee.firstNameTh} ${slip.employee.lastNameTh}`.trim(),
      net: formatBaht(slip.netPay),
    })),
    total: formatBaht(total),
  };
}
