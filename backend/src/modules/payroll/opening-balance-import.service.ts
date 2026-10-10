// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AuditAction, PayrollRunStatus, Prisma } from '@prisma/client';
import { BusinessRuleError } from '../../core/errors/domain.errors';
import { taxRulesFor } from './domain/thai-tax';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { importProblem, type ImportProblem } from '../../core/spreadsheet/problems';
import { readTable, TableError, type Table } from '../../core/spreadsheet/table';
import type { UploadedTable } from '../../core/spreadsheet/upload';
import { writeXlsx } from '../../core/spreadsheet/xlsx';
import { workDateFor } from '../../core/utils/date.util';
import { AuditService } from '../audit/audit.service';
import {
  readOpeningBalances,
  socialSecurityLimit,
  type OpeningBalanceRow,
} from './domain/opening-balance-import';

/** The months a file covers: January to `throughMonth` of `year`. */
export interface OpeningPeriod {
  year: number;
  throughMonth: number;
}

export interface OpeningBalancePreview extends OpeningPeriod {
  fileName: string;
  /** Employees whose figures the file sets; empty unless `problems` is. */
  rows: OpeningBalanceRow[];
  /** The file's totals, to check against the old system's report. */
  totals: { taxableIncome: number; withholdingTax: number; ssoEmployee: number };
  /** Runs already calculated for these employees without the figures. */
  recalculate: StaleRun[];
  problems: ImportProblem[];
}

/**
 * A run calculated before the figures were in, and not yet approved. Its
 * withholding projected the year without them, so it is too low until the run
 * is calculated again.
 */
export interface StaleRun {
  runId: string;
  runNo: string;
  period: string;
}

/** Runs whose payslips count: anything not thrown away. */
const LIVE_RUNS: PayrollRunStatus[] = [
  PayrollRunStatus.DRAFT,
  PayrollRunStatus.CALCULATING,
  PayrollRunStatus.CALCULATED,
  PayrollRunStatus.PENDING_APPROVAL,
  PayrollRunStatus.APPROVED,
  PayrollRunStatus.PAID,
];

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];
const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * This year's pay before the company moved to Cwork (CW-059): taxable income,
 * tax withheld and social security per employee, from January to the last
 * month paid elsewhere.
 *
 * The template lists everyone employed in those months, with any figures
 * already imported, so HR only types numbers. `preview` checks the file and
 * totals it; `commit` checks it again and sets every figure in one
 * transaction. Setting rather than adding is what makes a second import of the
 * same file harmless.
 *
 * Only this year or last: last year for a company that starts in January and
 * files the year before from Cwork.
 */
@Injectable()
export class OpeningBalanceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async template(
    organizationId: string,
    requested: { year?: number; throughMonth: number },
    language: 'th' | 'en',
  ): Promise<{ filename: string; content: Buffer }> {
    const period = await this.period(organizationId, requested);
    const [employees, existing] = await Promise.all([
      this.employeesIn(organizationId, period),
      this.existing(organizationId, period.year),
    ]);
    const thai = language === 'th';
    const month = (thai ? THAI_MONTHS : ENGLISH_MONTHS)[period.throughMonth - 1];
    const year = thai ? period.year + 543 : period.year;
    const through =
      period.throughMonth === 1 ? month : thai ? `มกราคม–${month}` : `January–${month}`;
    const sso = socialSecurityLimit(period.throughMonth, taxRulesFor(period.year)).toLocaleString(
      'en-US',
    );

    const header = thai
      ? [
          'รหัสพนักงาน',
          'ชื่อ',
          'เงินได้ที่ต้องเสียภาษี',
          'ภาษีหัก ณ ที่จ่าย',
          'ประกันสังคม (ส่วนลูกจ้าง)',
        ]
      : ['Employee code', 'Name', 'Taxable income', 'Tax withheld', 'Social security (employee)'];
    const guide = thai
      ? [
          [`ยอดสะสมของพนักงานแต่ละคน ${through} ${year} ที่จ่ายก่อนเริ่มใช้ Cwork`],
          [
            'เงินได้ที่ต้องเสียภาษี: เงินได้ตามมาตรา 40(1) รวมทุกเดือน เช่น เงินเดือน ค่าล่วงเวลา โบนัส',
          ],
          ['ภาษีหัก ณ ที่จ่าย: ภาษีที่หักไว้แล้วรวมทุกเดือน'],
          [`ประกันสังคม: เฉพาะส่วนของลูกจ้าง ไม่รวมส่วนที่นายจ้างสมทบ (ไม่เกิน ${sso} บาท)`],
          ['ตัวเลขเหล่านี้เป็นเงินที่บริษัทนี้จ่ายเอง ไม่ใช่รายได้จากนายจ้างเดิมของพนักงาน'],
          ['กรอกทั้งสามช่อง ใส่ 0 ถ้าไม่มี  แถวที่ว่างทั้งสามช่อง = ไม่เปลี่ยนแปลง'],
          ['นำเข้าซ้ำได้ ระบบจะใช้ตัวเลขล่าสุดแทนของเดิม ไม่บวกเพิ่ม'],
          ['ลบแถวที่ไม่ใช้ได้ แต่ห้ามเปลี่ยนรหัสพนักงานหรือชื่อหัวคอลัมน์'],
        ]
      : [
          [
            `Each employee's pay for ${through} ${year}, paid before the company started using Cwork.`,
          ],
          [
            'Taxable income: employment income (section 40(1)) for all those months: salary, overtime, bonuses.',
          ],
          ['Tax withheld: the tax already withheld in those months.'],
          [
            `Social security: the employee's contributions only, not the employer's (at most ${sso} baht).`,
          ],
          [
            "These are this company's own payments, not income from an employee's previous employer.",
          ],
          ['Fill in all three, 0 where there is none. A row with all three blank changes nothing.'],
          ['Importing again replaces the figures rather than adding to them.'],
          ["Rows you do not need can be deleted; don't change codes or headings."],
        ];

    const content = writeXlsx([
      {
        name: thai ? 'ยอดยกมา' : 'Pay before Cwork',
        header: true,
        amountColumns: [2, 3, 4],
        widths: [14, 26, 22, 20, 26],
        rows: [
          header,
          ...employees.map((e) => {
            const figures = existing.get(e.id);
            return [
              e.employeeCode,
              `${e.firstNameTh} ${e.lastNameTh}`,
              ...(figures
                ? [figures.taxableIncome, figures.withholdingTax, figures.ssoEmployee]
                : []),
            ];
          }),
        ],
      },
      { name: thai ? 'คำอธิบาย' : 'Guide', widths: [110], rows: guide },
    ]);
    return {
      // ASCII on purpose: a browser saving a Blob may drop a Thai name.
      filename: `cwork-pay-before-cwork-${period.year}-${String(period.throughMonth).padStart(2, '0')}-${language}.xlsx`,
      content: Buffer.from(content),
    };
  }

  async preview(
    user: AuthenticatedUser,
    requested: { year?: number; throughMonth: number },
    file: UploadedTable,
  ): Promise<OpeningBalancePreview> {
    const { period, rows, problems } = await this.check(user.organizationId, requested, file);
    return {
      fileName: file.originalname,
      ...period,
      rows,
      totals: totals(rows),
      recalculate: await this.staleRuns(user.organizationId, period, rows),
      problems,
    };
  }

  async commit(
    user: AuthenticatedUser,
    requested: { year?: number; throughMonth: number },
    file: UploadedTable,
  ): Promise<{ employees: number; recalculate: StaleRun[] } & OpeningPeriod> {
    const { period, rows, problems } = await this.check(user.organizationId, requested, file);
    if (problems.length > 0) {
      throw new BusinessRuleError(
        'IMPORT_HAS_PROBLEMS',
        `The file has ${problems.length} problem(s); nothing was imported`,
        { problems },
      );
    }

    const amount = (value: number) => new Prisma.Decimal(value.toFixed(2));
    await this.prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          const figures = {
            throughMonth: period.throughMonth,
            taxableIncome: amount(row.taxableIncome),
            withholdingTax: amount(row.withholdingTax),
            ssoEmployee: amount(row.ssoEmployee),
          };
          await tx.payrollOpeningBalance.upsert({
            where: { employeeId_taxYear: { employeeId: row.employeeId, taxYear: period.year } },
            create: {
              organizationId: user.organizationId,
              employeeId: row.employeeId,
              taxYear: period.year,
              ...figures,
            },
            update: figures,
          });
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    const sum = totals(rows);
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.UPDATE,
      entityType: 'PayrollOpeningBalance',
      summary:
        `Imported pay before Cwork (${period.year}, January to month ${period.throughMonth}) ` +
        `for ${rows.length} employee(s) from "${file.originalname}"`,
      changes: {
        fileName: file.originalname,
        year: period.year,
        throughMonth: period.throughMonth,
        rows: rows.length,
        totals: sum,
        employees: rows.map((r) => ({
          employeeCode: r.employeeCode,
          taxableIncome: r.taxableIncome,
          withholdingTax: r.withholdingTax,
          ssoEmployee: r.ssoEmployee,
          replaced: r.replaces,
        })),
      },
    });

    return {
      employees: rows.length,
      ...period,
      recalculate: await this.staleRuns(user.organizationId, period, rows),
    };
  }

  /**
   * The months a request names, checked against today in the organisation's
   * time zone: this year up to the current month, or any month of last year.
   */
  async period(
    organizationId: string,
    requested: { year?: number; throughMonth: number },
  ): Promise<OpeningPeriod> {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const today = workDateFor(new Date(), organization.timezone);
    const thisYear = today.getUTCFullYear();
    const thisMonth = today.getUTCMonth() + 1;
    const year = requested.year ?? thisYear;
    const throughMonth = requested.throughMonth;

    if (year !== thisYear && year !== thisYear - 1) {
      throw new BusinessRuleError(
        'INVALID_OPENING_PERIOD',
        `Pay before Cwork can be imported for ${thisYear} or ${thisYear - 1}, not ${year}`,
        { year, thisYear },
      );
    }
    if (!Number.isInteger(throughMonth) || throughMonth < 1 || throughMonth > 12) {
      throw new BusinessRuleError('INVALID_OPENING_PERIOD', 'The month is from 1 to 12', {
        throughMonth,
      });
    }
    if (year === thisYear && throughMonth > thisMonth) {
      throw new BusinessRuleError(
        'INVALID_OPENING_PERIOD',
        `The figures can run to ${year}-${String(thisMonth).padStart(2, '0')} at the latest: later months have not been paid yet`,
        { year, throughMonth, thisMonth },
      );
    }
    return { year, throughMonth };
  }

  private async check(
    organizationId: string,
    requested: { year?: number; throughMonth: number },
    file: UploadedTable,
  ) {
    const period = await this.period(organizationId, requested);

    let table: Table;
    try {
      table = readTable(file.buffer);
    } catch (error) {
      if (!(error instanceof TableError)) throw error;
      return { period, rows: [], problems: [importProblem(error.problem, { row: 0 })] };
    }

    const [employees, existing, paid] = await Promise.all([
      this.prisma.employee.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true },
      }),
      this.existing(organizationId, period.year),
      this.paidInCwork(organizationId, period),
    ]);

    const result = readOpeningBalances(table, {
      ...period,
      rules: taxRulesFor(period.year),
      employees: new Map(
        employees.map((e) => [
          e.employeeCode,
          { id: e.id, name: `${e.firstNameTh} ${e.lastNameTh}` },
        ]),
      ),
      paidInCwork: (employeeId) => paid.get(employeeId),
      existing: new Set(existing.keys()),
    });
    return { period, ...result };
  }

  /**
   * The first month each employee was paid in Cwork within the months the file
   * covers, by a run that is not cancelled or failed. Figures for those months
   * would count them twice.
   */
  private async paidInCwork(
    organizationId: string,
    period: OpeningPeriod,
  ): Promise<Map<string, string>> {
    const payslips = await this.prisma.payslip.findMany({
      where: {
        run: {
          organizationId,
          status: { in: LIVE_RUNS },
          period: { year: period.year, month: { lte: period.throughMonth } },
        },
      },
      select: {
        employeeId: true,
        run: { select: { period: { select: { code: true, month: true } } } },
      },
      orderBy: { run: { period: { month: 'asc' } } },
    });
    const first = new Map<string, string>();
    for (const slip of payslips) {
      if (!first.has(slip.employeeId)) first.set(slip.employeeId, slip.run.period.code);
    }
    return first;
  }

  /**
   * Runs of the same year, after the months the file covers, that were
   * calculated for any of its employees and are not approved yet. Approved and
   * paid runs are history and stay as they were.
   */
  private async staleRuns(
    organizationId: string,
    period: OpeningPeriod,
    rows: OpeningBalanceRow[],
  ): Promise<StaleRun[]> {
    if (rows.length === 0) return [];
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        organizationId,
        status: { in: [PayrollRunStatus.CALCULATED, PayrollRunStatus.PENDING_APPROVAL] },
        period: { year: period.year, month: { gt: period.throughMonth } },
        payslips: { some: { employeeId: { in: rows.map((r) => r.employeeId) } } },
      },
      select: { id: true, runNo: true, period: { select: { code: true } } },
      orderBy: [{ period: { month: 'asc' } }, { runNo: 'asc' }],
    });
    return runs.map((r) => ({ runId: r.id, runNo: r.runNo, period: r.period.code }));
  }

  private async existing(organizationId: string, year: number) {
    const balances = await this.prisma.payrollOpeningBalance.findMany({
      where: { organizationId, taxYear: year },
    });
    return new Map(
      balances.map((b) => [
        b.employeeId,
        {
          taxableIncome: Number(b.taxableIncome),
          withholdingTax: Number(b.withholdingTax),
          ssoEmployee: Number(b.ssoEmployee),
        },
      ]),
    );
  }

  /** Everyone employed at some point from January to the last month the file covers. */
  private employeesIn(organizationId: string, period: OpeningPeriod) {
    const firstDay = new Date(Date.UTC(period.year, 0, 1));
    const lastDay = new Date(Date.UTC(period.year, period.throughMonth, 0));
    return this.prisma.employee.findMany({
      where: {
        organizationId,
        deletedAt: null,
        hireDate: { lte: lastDay },
        OR: [{ lastWorkingDate: null }, { lastWorkingDate: { gte: firstDay } }],
      },
      select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true },
      orderBy: { employeeCode: 'asc' },
    });
  }
}

function totals(rows: OpeningBalanceRow[]): OpeningBalancePreview['totals'] {
  const cents = (pick: (r: OpeningBalanceRow) => number) =>
    rows.reduce((sum, r) => sum + Math.round(pick(r) * 100), 0) / 100;
  return {
    taxableIncome: cents((r) => r.taxableIncome),
    withholdingTax: cents((r) => r.withholdingTax),
    ssoEmployee: cents((r) => r.ssoEmployee),
  };
}
