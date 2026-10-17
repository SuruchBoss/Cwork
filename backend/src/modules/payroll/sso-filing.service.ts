// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AuditAction, PayFrequency, PayrollRunStatus } from '@prisma/client';
import { BusinessRuleError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/security/crypto.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { writeXlsx } from '../../core/spreadsheet/xlsx';
import { AuditService } from '../audit/audit.service';
import { SsoFilingRenderer } from '../documents/sso-filing-renderer';
import {
  filingSheet,
  type FilingPerson,
  type FilingProblem,
  type FilingSheet,
} from './domain/sso-filing';
import { taxRulesFor } from './domain/thai-tax';
import { ssoSlips } from './sso-slips';

/** Runs whose figures are settled: what the month's contributions are filed from. */
const SETTLED: PayrollRunStatus[] = [PayrollRunStatus.APPROVED, PayrollRunStatus.PAID];
const VOID: PayrollRunStatus[] = [PayrollRunStatus.CANCELLED, PayrollRunStatus.FAILED];

export type FilingFormat = 'csv' | 'xlsx' | 'pdf';

export interface FilingFile {
  filename: string;
  contentType: string;
  content: Buffer;
  rowCount: number;
}

const HEADERS = [
  'ลำดับที่',
  'เลขประจำตัวประชาชน (คนต่างด้าว: เลขที่บัตรประกันสังคม)',
  'ชื่อ-สกุล',
  'ค่าจ้างที่จ่ายจริง',
  'เงินสมทบผู้ประกันตน',
  'เงินสมทบนายจ้าง',
  'รหัสพนักงาน',
  'ค่าจ้างที่ใช้คำนวณ',
  'หักจากสลิป (ลูกจ้าง)',
  'หักจากสลิป (นายจ้าง)',
  'ต่างจากสลิป',
];

/**
 * The month's social security filing, สปส.1-10 (CW-048).
 *
 * It reads the payslips of runs that are approved or paid, adds each person's
 * halves into one month and works the form out with the rules the form states
 * (see `domain/sso-filing.ts`). It will not file a month that is not finished,
 * and it will not export while anyone cannot be identified on the form: a
 * missing number is named, never left blank. The data holds national ID
 * numbers and pay, so every read of it is audited.
 *
 * What is produced is the form's data. The file the Social Security Office's
 * e-Services accepts for upload has a layout that is only handed out inside
 * e-Services, and is not guessed here.
 */
@Injectable()
export class SsoFilingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly renderer: SsoFilingRenderer,
  ) {}

  async sheet(organizationId: string, year: number, month: number): Promise<FilingSheet> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BusinessRuleError('INVALID_YEAR', 'Give a calendar year, such as 2026.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BusinessRuleError('INVALID_MONTH', 'Give a month from 1 to 12.');
    }

    await this.assertMonthIsFinished(organizationId, year, month);

    const { slips } = await ssoSlips(this.prisma, organizationId, {
      status: { in: SETTLED },
      period: { year, month },
    });

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: [...new Set(slips.map((slip) => slip.employeeId))] }, organizationId },
      select: {
        id: true,
        employeeCode: true,
        firstNameTh: true,
        lastNameTh: true,
        nationalIdEnc: true,
        socialSecurityNoEnc: true,
        passportNoEnc: true,
        workPermitNoEnc: true,
      },
    });
    const people: FilingPerson[] = employees.map((e) => ({
      employeeId: e.id,
      employeeCode: e.employeeCode,
      firstName: e.firstNameTh,
      lastName: e.lastNameTh,
      foreign: Boolean(e.passportNoEnc || e.workPermitNoEnc),
      nationalId: this.crypto.decrypt(e.nationalIdEnc),
      socialSecurityNo: this.crypto.decrypt(e.socialSecurityNoEnc),
    }));

    return filingSheet(year, month, slips, people, taxRulesFor(year));
  }

  /** The month's form as data, for HR to read and check. Audited: it holds ID numbers. */
  async read(user: AuthenticatedUser, year: number, month: number): Promise<FilingSheet> {
    const sheet = await this.sheet(user.organizationId, year, month);
    await this.record(user, 'read', sheet);
    return sheet;
  }

  /** The month's form as a file. Refused while anyone cannot be put on the form. */
  async exportFile(
    user: AuthenticatedUser,
    year: number,
    month: number,
    format: FilingFormat,
  ): Promise<FilingFile> {
    const sheet = await this.sheet(user.organizationId, year, month);
    if (sheet.problems.length > 0) {
      throw new BusinessRuleError(
        'SSO_FILING_HAS_PROBLEMS',
        `${sheet.problems.length} insured person(s) cannot be put on the form: ` +
          sheet.problems.map((p) => `${p.employeeCode} ${p.name} (${p.code})`).join('; '),
        { problems: sheet.problems satisfies FilingProblem[] },
      );
    }
    const stem = `sso-1-10-${year}-${String(month).padStart(2, '0')}`;
    const table = this.table(sheet);
    await this.record(user, format, sheet);
    if (format === 'pdf') {
      const organization = await this.prisma.organization.findUniqueOrThrow({
        where: { id: user.organizationId },
        select: { name: true, legalName: true, taxId: true },
      });
      // The form's name column starts with the title; HR may not have recorded one.
      const people = await this.prisma.employee.findMany({
        where: {
          id: { in: sheet.rows.map((row) => row.employeeId) },
          organizationId: user.organizationId,
        },
        select: { id: true, titleTh: true },
      });
      const titles: Record<string, string> = {};
      for (const person of people) if (person.titleTh) titles[person.id] = person.titleTh;
      const content = await this.renderer.render({
        organizationName: organization.legalName || organization.name,
        taxId: organization.taxId,
        sheet,
        titles,
      });
      return {
        filename: `${stem}.pdf`,
        contentType: 'application/pdf',
        content,
        rowCount: sheet.rows.length,
      };
    }
    if (format === 'xlsx') {
      const content = Buffer.from(
        writeXlsx([
          {
            name: `${year}-${String(month).padStart(2, '0')}`,
            rows: table.rows,
            header: true,
            widths: [8, 30, 30, 16, 16, 16, 14, 16, 18, 18, 12],
            amountColumns: [3, 4, 5, 7, 8, 9],
          },
        ]),
      );
      return {
        filename: `${stem}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content,
        rowCount: sheet.rows.length,
      };
    }
    const csv = table.rows.map((cells) => cells.map(csvField).join(',')).join('\r\n');
    // A UTF-8 BOM so Thai names open correctly in Excel.
    return {
      filename: `${stem}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: Buffer.from(`\uFEFF${csv}\r\n`, 'utf8'),
      rowCount: sheet.rows.length,
    };
  }

  /** The rows of the file: the form's part 2, then the part 1 totals. */
  private table(sheet: FilingSheet): { rows: (string | number)[][] } {
    const rows: (string | number)[][] = [HEADERS];
    for (const row of sheet.rows) {
      rows.push([
        String(row.sequence),
        row.identifier,
        row.name,
        row.wage,
        row.employee,
        row.employer,
        row.employeeCode,
        row.contributoryWage,
        row.deductedEmployee,
        row.deductedEmployer,
        row.differsFromPayslips ? 'ต่าง' : '',
      ]);
    }
    const t = sheet.totals;
    rows.push([
      'รวม',
      `จำนวนผู้ประกันตน ${t.insured} คน`,
      '',
      t.wage,
      t.employee,
      t.employer,
      '',
      '',
      t.deductedEmployee,
      t.deductedEmployer,
      '',
    ]);
    rows.push(['', 'รวมเงินสมทบที่นำส่งทั้งสิ้น', '', '', t.total, '', '', '', '', '', '']);
    return { rows };
  }

  /**
   * A month is filed once, from all of it: every period of the month has a
   * run that is approved or paid, and a half-month month has both halves.
   * Anything less would file part of the month's wages as the whole.
   */
  private async assertMonthIsFinished(organizationId: string, year: number, month: number) {
    const periods = await this.prisma.payrollPeriod.findMany({
      where: { organizationId, year, month },
      select: {
        code: true,
        payFrequency: true,
        half: true,
        runs: { select: { status: true } },
      },
      orderBy: [{ half: 'asc' }, { code: 'asc' }],
    });
    if (periods.length === 0) {
      throw new BusinessRuleError(
        'NO_PAYROLL_FOR_MONTH',
        `There is no payroll period for ${year}-${String(month).padStart(2, '0')}`,
      );
    }
    const unfinished = periods
      .filter(
        (p) => !p.runs.some((run) => SETTLED.includes(run.status) && !VOID.includes(run.status)),
      )
      .map((p) => p.code);
    const halves = new Set(
      periods.filter((p) => p.payFrequency === PayFrequency.SEMI_MONTHLY).map((p) => p.half),
    );
    const missingHalves =
      halves.size > 0 ? [1, 2].filter((half) => !halves.has(half)) : ([] as number[]);
    if (unfinished.length > 0 || missingHalves.length > 0) {
      const reasons = [
        unfinished.length > 0 ? `no approved or paid run for ${unfinished.join(', ')}` : null,
        missingHalves.length > 0
          ? `no period for the ${missingHalves.map((h) => (h === 1 ? 'first' : 'second')).join(' and ')} half`
          : null,
      ].filter(Boolean);
      throw new BusinessRuleError(
        'SSO_MONTH_NOT_FINISHED',
        `${year}-${String(month).padStart(2, '0')} cannot be filed yet: ${reasons.join('; ')}`,
        { unfinished, missingHalves },
      );
    }
  }

  private async record(
    user: AuthenticatedUser,
    how: 'read' | FilingFormat,
    sheet: FilingSheet,
  ): Promise<void> {
    const month = `${sheet.year}-${String(sheet.month).padStart(2, '0')}`;
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.EXPORT,
      entityType: 'SsoFiling',
      entityId: null,
      summary: `${how === 'read' ? 'Read' : `Exported (${how})`} the social security filing for ${month}`,
      changes: {
        how,
        month,
        insured: sheet.totals.insured,
        employee: sheet.totals.employee,
        employer: sheet.totals.employer,
        problems: sheet.problems.length,
      },
    });
  }
}

/** RFC 4180 field; a cell a spreadsheet would read as a formula is shown as text. */
function csvField(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
