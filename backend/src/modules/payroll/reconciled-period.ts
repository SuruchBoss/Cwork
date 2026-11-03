// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { anotherPeriodExpected, missingOrdinals } from './domain/pay-period';
import {
  PayrollReconciliationError,
  reconcilePeriod,
  type ExportItem,
  type ReconciledPeriod,
} from './domain/payroll-export';
import { thaiMonthYear } from './domain/thai-month';

export interface LoadedPeriod {
  period: { id: string; code: string; year: number; month: number };
  /** The codes of every period read: one, or the month's several when `wholeMonth` is set. */
  periodCodes: string[];
  reconciled: ReconciledPeriod;
}

export interface LoadOptions {
  /** Read the payslips' lines (CW-099). */
  withItems?: boolean;
  /**
   * Read the whole month the period belongs to (CW-099). Cwork pays a monthly
   * salary in a monthly period and a daily wage in the two halves of a
   * semi-monthly one, so a month is up to three periods, and a list of everyone
   * paid that month has to read all of them.
   */
  wholeMonth?: boolean;
  /**
   * What the caller was doing, in Thai, for the refusal of a month that is not
   * all there: "ยัง{action}{month} ไม่ได้". The register says
   * "ส่งออกทะเบียนของเดือน", the comparison "เทียบยอดของเดือน".
   */
  action?: string;
}

/**
 * A period's payslips, checked against their runs (CW-044), for everything that
 * reads a whole period: the export and the check against what was filed
 * (CW-089). Refusing here, once, is what keeps every one of them from working
 * on a period that does not add up.
 *
 * `taxId` is given only by a caller that prints it: the ciphertext is read and
 * decrypted for that caller alone. `options` are set only by a caller that
 * splits a payslip into its lines or lists the whole month (CW-099): the lines
 * are read, and checked against the payslip's totals, for that caller alone.
 */
export async function loadReconciledPeriod(
  prisma: PrismaService,
  organizationId: string,
  periodId: string,
  taxId?: (employee: { taxIdEnc: string | null; nationalIdEnc: string | null }) => string | null,
  options: LoadOptions = {},
): Promise<LoadedPeriod> {
  const withItems = options.withItems === true;
  const anchor = await prisma.payrollPeriod.findFirst({
    where: { id: periodId, organizationId },
    select: { id: true, code: true, year: true, month: true },
  });
  if (!anchor) throw new NotFoundError('PayrollPeriod', periodId);

  const periods = await prisma.payrollPeriod.findMany({
    where: options.wholeMonth
      ? { organizationId, year: anchor.year, month: anchor.month }
      : { id: anchor.id },
    orderBy: [{ half: 'asc' }, { code: 'asc' }],
    include: {
      runs: {
        orderBy: { runNo: 'asc' },
        include: {
          payslips: {
            orderBy: { employee: { employeeCode: 'asc' } },
            include: {
              ...(withItems ? { items: { orderBy: { orderIndex: 'asc' as const } } } : {}),
              employee: {
                select: {
                  employeeCode: true,
                  firstNameTh: true,
                  lastNameTh: true,
                  department: { select: { name: true } },
                  ...(taxId ? { taxIdEnc: true, nationalIdEnc: true } : {}),
                },
              },
            },
          },
        },
      },
    },
  });

  try {
    if (options.wholeMonth) assertMonthIsComplete(periods, anchor, options.action);
    const reconciled = reconcilePeriod(
      options.wholeMonth
        ? { code: monthCode(anchor), year: anchor.year, month: anchor.month }
        : { code: anchor.code, year: anchor.year, month: anchor.month },
      periods
        .flatMap((period) => period.runs)
        .map((run) => ({
          runNo: run.runNo,
          status: run.status,
          employeeCount: run.employeeCount,
          totalGross: run.totalGross,
          totalDeduction: run.totalDeduction,
          totalNet: run.totalNet,
          payslips: run.payslips.map((slip) => ({
            employeeCode: slip.employee.employeeCode,
            firstNameTh: slip.employee.firstNameTh,
            lastNameTh: slip.employee.lastNameTh,
            departmentName: slip.employee.department?.name ?? null,
            currency: slip.currency,
            grossEarnings: slip.grossEarnings,
            totalDeductions: slip.totalDeductions,
            taxableIncome: slip.taxableIncome,
            withholdingTax: slip.withholdingTax,
            ssoEmployee: slip.ssoEmployee,
            ssoEmployer: slip.ssoEmployer,
            netPay: slip.netPay,
            ...(withItems && 'items' in slip
              ? {
                  items: (slip.items as ExportItem[]).map((item) => ({
                    code: item.code,
                    name: item.name,
                    type: item.type,
                    quantity: item.quantity,
                    rate: item.rate,
                    amount: item.amount,
                  })),
                }
              : {}),
            ...(taxId
              ? {
                  taxId: taxId(
                    slip.employee as { taxIdEnc: string | null; nationalIdEnc: string | null },
                  ),
                }
              : {}),
          })),
        })),
    );
    return {
      period: { id: anchor.id, code: anchor.code, year: anchor.year, month: anchor.month },
      periodCodes: periods.map((period) => period.code),
      reconciled,
    };
  } catch (error) {
    // Refusal is a client error, not a server fault: name the reason (422).
    if (error instanceof PayrollReconciliationError) {
      throw new BusinessRuleError(error.code, error.message);
    }
    throw error;
  }
}

const monthCode = (month: { year: number; month: number }) =>
  `${month.year}-${String(month.month).padStart(2, '0')}`;

/** What a run's status says to HR, in the words the run page uses. */
const RUN_STATUS_TH: Record<string, string> = {
  DRAFT: 'ร่าง',
  CALCULATING: 'กำลังคำนวณ',
  CALCULATED: 'คำนวณแล้ว รออนุมัติ',
  PENDING_APPROVAL: 'รออนุมัติ',
  FAILED: 'คำนวณไม่สำเร็จ',
  CANCELLED: 'ยกเลิกแล้ว',
};

/** Which period of the month, as a person says it: the whole month, a half, or the nth 14 days. */
function periodName(period: { code: string; payFrequency: string; half: number }): string {
  if (period.payFrequency === 'SEMI_MONTHLY') {
    return `${period.half === 1 ? 'ครึ่งแรก' : 'ครึ่งหลัง'} (${period.code})`;
  }
  if (period.payFrequency === 'BIWEEKLY') return `งวด 14 วันที่ ${period.half} (${period.code})`;
  return `งวดรายเดือน (${period.code})`;
}

/**
 * A month is only listed when all of it is there. A register missing the second
 * half of the daily wages would look finished and be short, so a period without
 * a run, a run not yet approved, or a month missing a half is refused by name,
 * in Thai, with what to do next (CW-105).
 */
function assertMonthIsComplete(
  periods: Array<{
    code: string;
    payFrequency: string;
    half: number;
    payDate: Date;
    runs: Array<{ runNo: string; status: string }>;
  }>,
  month: { year: number; month: number },
  action = 'ส่งออกทะเบียนของเดือน',
): void {
  const monthName = thaiMonthYear(month.year, month.month);
  const refuse = (what: string, next: string) =>
    new PayrollReconciliationError(`ยัง${action}${monthName} ไม่ได้ เพราะ${what} ${next}`);

  for (const period of periods) {
    if (period.runs.length === 0) {
      throw refuse(
        `${periodName(period)} ยังไม่มีรอบเงินเดือน`,
        'สร้างรอบ คำนวณ และอนุมัติให้ครบทุกงวดของเดือน แล้วลองอีกครั้ง',
      );
    }
    const open = period.runs.find((run) => !['APPROVED', 'PAID'].includes(run.status));
    if (open) {
      throw refuse(
        `${periodName(period)} มีรอบ ${open.runNo} ที่ยัง${RUN_STATUS_TH[open.status] ?? open.status}`,
        'อนุมัติรอบนี้ (โดยคนที่ไม่ได้เป็นคนเตรียมรอบ) แล้วลองอีกครั้ง',
      );
    }
  }
  const halves = new Set(
    periods.filter((period) => period.payFrequency === 'SEMI_MONTHLY').map((period) => period.half),
  );
  for (const half of [1, 2]) {
    if (halves.size > 0 && !halves.has(half)) {
      throw refuse(
        `ยังไม่มีงวด${half === 1 ? 'ครึ่งแรก' : 'ครึ่งหลัง'}ของค่าจ้างรายวัน`,
        'สร้างงวดนั้น สร้างรอบ คำนวณ และอนุมัติ แล้วลองอีกครั้ง',
      );
    }
  }

  // A month paid every 14 days is complete when no period is missing in it and
  // the next one, fourteen days on, would belong to the following month.
  const fortnights = periods.filter((period) => period.payFrequency === 'BIWEEKLY');
  if (fortnights.length > 0) {
    const missing = missingOrdinals(fortnights.map((period) => period.half));
    const last = fortnights.reduce((a, b) => (a.half >= b.half ? a : b));
    if (missing.length > 0 || anotherPeriodExpected(last.payDate, month)) {
      throw refuse(
        'ยังมีงวด 14 วันของเดือนนี้ที่ยังไม่ได้สร้าง',
        'สร้างงวดที่เหลือ คำนวณ และอนุมัติ แล้วส่งออกอีกครั้ง',
      );
    }
  }
}
