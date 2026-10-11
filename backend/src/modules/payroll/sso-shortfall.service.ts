// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AuditAction, PayrollPeriodStatus, PayrollRunStatus } from '@prisma/client';
import { BusinessRuleError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { AuditService } from '../audit/audit.service';
import {
  socialSecurityShortfall,
  type PaidSlip,
  type ShortfallReport,
} from './domain/sso-shortfall';
import { taxRulesFor } from './domain/thai-tax';
import { ssoSlips } from './sso-slips';

/** Runs whose payslips never counted. */
const VOID_RUNS: PayrollRunStatus[] = [PayrollRunStatus.CANCELLED, PayrollRunStatus.FAILED];
/** Periods closed to change: their runs are what was, or will be, paid. */
const CLOSED_PERIODS: PayrollPeriodStatus[] = [
  PayrollPeriodStatus.LOCKED,
  PayrollPeriodStatus.CLOSED,
];

export interface SsoShortfallResult extends ShortfallReport {
  year: number;
  /** The ceiling the year's rules give, the figure the report compares against. */
  ceiling: number;
  /** How many payslips were looked at, so an empty report can say why. */
  payslipsChecked: number;
}

type CsvLanguage = 'th' | 'en';

const CSV_HEADERS: Record<CsvLanguage, string[]> = {
  th: [
    'รหัสพนักงาน',
    'ชื่อ',
    'เดือน',
    'ค่าจ้างที่ใช้คิดประกันสังคม',
    'หักลูกจ้างไปแล้ว',
    'สมทบนายจ้างไปแล้ว',
    'ที่ต้องหักตามเพดานใหม่',
    'ส่วนต่างลูกจ้าง',
    'ส่วนต่างนายจ้าง',
    'ค่าจ้างคำนวณจากรายการในสลิป',
  ],
  en: [
    'Employee code',
    'Name',
    'Month',
    'Social security wage',
    'Employee deducted',
    'Employer contributed',
    'Owed on the new ceiling',
    'Employee difference',
    'Employer difference',
    'Wage rebuilt from payslip lines',
  ],
};

const CSV_TOTAL: Record<CsvLanguage, { month: string; year: string; yes: string; no: string }> = {
  th: { month: 'รวมเดือน', year: 'รวมทั้งปี', yes: 'ใช่', no: '' },
  en: { month: 'Month total', year: 'Year total', yes: 'yes', no: '' },
};

/**
 * RFC 4180 field. A text cell that a spreadsheet would read as a formula is
 * prefixed so it shows as text: names and codes are typed by people.
 */
function csvField(value: string, text = false): string {
  const safe = text && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The social security that locked and paid runs deducted against what the
 * ceiling in force for their year gives (CW-075). Read only: it never writes
 * to a period, a run or a payslip. Paid and locked runs stay as they were
 * (the owner's decision); this is what HR settles with the Social Security
 * Office.
 */
@Injectable()
export class SsoShortfallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async report(organizationId: string, year: number): Promise<SsoShortfallResult> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BusinessRuleError('INVALID_YEAR', 'Give a calendar year, such as 2026.');
    }
    const rules = taxRulesFor(year);

    const { slips: rows, checked } = await ssoSlips(this.prisma, organizationId, {
      status: { notIn: VOID_RUNS },
      period: { year },
      OR: [{ status: PayrollRunStatus.PAID }, { period: { status: { in: CLOSED_PERIODS } } }],
    });
    const slips: PaidSlip[] = rows.map((slip) => ({
      employeeId: slip.employeeId,
      employeeCode: slip.employeeCode,
      name: `${slip.firstNameTh} ${slip.lastNameTh}`.trim(),
      month: slip.month,
      ssoWage: slip.ssoWage,
      wageRebuilt: slip.wageRebuilt,
      ssoEmployee: slip.ssoEmployee,
      ssoEmployer: slip.ssoEmployer,
    }));

    return {
      year,
      ceiling: rules.socialSecurity.maxMonthlyWage,
      payslipsChecked: checked,
      ...socialSecurityShortfall(slips, rules),
    };
  }

  /** The report as a CSV file. Recorded in the audit log: it holds pay figures. */
  async exportCsv(user: AuthenticatedUser, year: number, language?: string) {
    const lang: CsvLanguage = language === 'en' ? 'en' : 'th';
    const report = await this.report(user.organizationId, year);
    const words = CSV_TOTAL[lang];
    const money = (n: number) => n.toFixed(2);

    const lines: string[][] = [CSV_HEADERS[lang]];
    for (const row of report.rows) {
      lines.push([
        csvField(row.employeeCode, true),
        csvField(row.name, true),
        `${year}-${String(row.month).padStart(2, '0')}`,
        money(row.wage),
        money(row.deductedEmployee),
        money(row.deductedEmployer),
        money(row.owed),
        money(row.employeeDifference),
        money(row.employerDifference),
        row.wageRebuilt ? words.yes : words.no,
      ]);
    }
    for (const month of report.byMonth) {
      lines.push([
        words.month,
        '',
        `${year}-${String(month.month).padStart(2, '0')}`,
        '',
        '',
        '',
        '',
        money(month.employee),
        money(month.employer),
        '',
      ]);
    }
    lines.push([
      words.year,
      '',
      String(year),
      '',
      '',
      '',
      '',
      money(report.total.employee),
      money(report.total.employer),
      '',
    ]);

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.EXPORT,
      entityType: 'SsoShortfallReport',
      entityId: null,
      summary: `Exported the social security shortfall report for ${year}`,
      changes: {
        year,
        rowCount: report.rows.length,
        totalEmployee: report.total.employee,
        totalEmployer: report.total.employer,
      },
    });

    // A UTF-8 BOM so Thai names open correctly in Excel.
    return {
      filename: `sso-shortfall-${year}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: `\uFEFF${lines.map((cells) => cells.join(',')).join('\r\n')}\r\n`,
      rowCount: report.rows.length,
    };
  }
}
