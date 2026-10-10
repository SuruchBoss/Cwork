// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceStatus,
  AuditAction,
  ExpenseClaimStatus,
  OvertimeStatus,
  PayComponentType,
  PayFrequency,
  PayrollPeriodStatus,
  PayrollRunStatus,
  PayrollRunType,
  Prisma,
} from '@prisma/client';
import {
  BusinessRuleError,
  ConflictError,
  ErrorCode,
  NotFoundError,
} from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import {
  eachDateInRange,
  formatDateOnly,
  isoWeekday,
  toDateOnly,
} from '../../core/utils/date.util';
import { Decimal, round2, toPrismaDecimal } from '../../core/utils/money.util';
import { SequenceService } from '../../core/utils/sequence.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationService } from '../organization/organization.service';
import { DEFAULT_OT_MULTIPLIERS } from '../attendance/overtime.service';
import {
  buildPayslip,
  type FirstHalfPaid,
  type OvertimeLine,
  type PayslipInput,
} from './domain/payroll-calculator';
import {
  countDaysPaid,
  minimumWageWarnings,
  type DailyWageDay,
  type PayslipWarning,
} from './domain/daily-wage';
import { yearToDate } from './domain/year-to-date';
import {
  EXPORT_FORMATS,
  PayrollReconciliationError,
  reconcilePeriod,
  resolveExportFormat,
} from './domain/payroll-export';
import { AuditService } from '../audit/audit.service';
import type { CreatePayrollPeriodDto, CreatePayrollRunDto } from './dto/payroll.dto';

/** The period fields a calculation reads — not the whole row. */
type PayrollPeriodWindow = {
  periodStart: Date;
  periodEnd: Date;
  cutoffDate: Date;
  year: number;
  month: number;
  payFrequency: PayFrequency;
  half: number;
};

/**
 * The first half of a semi-monthly month, as its second half needs it: the run
 * that paid it, so each employee's first-half payslip can be read (CW-069).
 */
type FirstHalfRun = { runId: string } | null;

/** The employee fields a payslip needs. */
type PayrollSubject = {
  id: string;
  employeeCode: string;
  hireDate: Date;
  lastWorkingDate: Date | null;
};

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationService,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------- periods

  listPeriods(organizationId: string, year?: number) {
    return this.prisma.payrollPeriod.findMany({
      where: { organizationId, ...(year ? { year } : {}) },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { half: 'desc' }],
      include: { _count: { select: { runs: true } } },
    });
  }

  /**
   * Opens a period: a whole month, or one half of a semi-monthly month
   * (CW-069). A month has at most one monthly period and one of each half; a
   * second one would pay the same month twice, so it is refused here, and the
   * database's unique key refuses it again if two requests race.
   */
  async createPeriod(organizationId: string, dto: CreatePayrollPeriodDto) {
    const periodStart = toDateOnly(dto.periodStart);
    const periodEnd = toDateOnly(dto.periodEnd);

    if (periodEnd < periodStart) {
      throw new BusinessRuleError('INVALID_PERIOD', 'The period must end after it starts');
    }

    const payFrequency = dto.payFrequency ?? PayFrequency.MONTHLY;
    const semiMonthly = payFrequency === PayFrequency.SEMI_MONTHLY;
    if (semiMonthly !== (dto.half !== undefined)) {
      throw new BusinessRuleError(
        'INVALID_PERIOD_HALF',
        semiMonthly
          ? 'A semi-monthly period is the first or the second half of the month: give half 1 or 2'
          : 'Only a semi-monthly period has a half',
      );
    }
    const half = dto.half ?? 0;
    const monthCode = `${dto.year}-${String(dto.month).padStart(2, '0')}`;

    const existing = await this.prisma.payrollPeriod.findFirst({
      where: { organizationId, payFrequency, year: dto.year, month: dto.month, half },
      select: { id: true, code: true },
    });
    if (existing) {
      throw new ConflictError(
        'PAYROLL_PERIOD_EXISTS',
        `${monthCode} already has ${semiMonthly ? `a period for half ${half}` : 'a monthly period'} (${existing.code})`,
        { periodId: existing.id, code: existing.code },
      );
    }

    return this.prisma.payrollPeriod.create({
      data: {
        organizationId,
        code: dto.code ?? (semiMonthly ? `${monthCode}-H${half}` : monthCode),
        year: dto.year,
        month: dto.month,
        payFrequency,
        half,
        periodStart,
        periodEnd,
        cutoffDate: toDateOnly(dto.cutoffDate ?? dto.periodEnd),
        payDate: toDateOnly(dto.payDate),
      },
    });
  }

  async lockPeriod(organizationId: string, periodId: string) {
    const period = await this.requirePeriod(organizationId, periodId);
    return this.prisma.payrollPeriod.update({
      where: { id: period.id },
      data: { status: PayrollPeriodStatus.LOCKED },
    });
  }

  // ----------------------------------------------------------------------- runs

  async createRun(user: AuthenticatedUser, dto: CreatePayrollRunDto) {
    const period = await this.requirePeriod(user.organizationId, dto.periodId);
    if (period.status === PayrollPeriodStatus.CLOSED) {
      throw new BusinessRuleError(ErrorCode.PAYROLL_PERIOD_LOCKED, 'This payroll period is closed');
    }

    const existing = await this.prisma.payrollRun.findFirst({
      where: {
        organizationId: user.organizationId,
        periodId: period.id,
        type: dto.type ?? PayrollRunType.REGULAR,
        status: { notIn: [PayrollRunStatus.CANCELLED, PayrollRunStatus.FAILED] },
      },
      select: { id: true, runNo: true },
    });
    if (existing && (dto.type ?? PayrollRunType.REGULAR) === PayrollRunType.REGULAR) {
      throw new BusinessRuleError(
        ErrorCode.PAYROLL_ALREADY_RUN,
        `A regular run (${existing.runNo}) already exists for this period`,
        { runId: existing.id },
      );
    }

    const runNo = await this.sequences.next(user.organizationId, 'PAYROLL_RUN', period.year);

    return this.prisma.payrollRun.create({
      data: {
        organizationId: user.organizationId,
        periodId: period.id,
        runNo,
        type: dto.type ?? PayrollRunType.REGULAR,
        note: dto.note,
        createdById: user.userId,
      },
    });
  }

  /**
   * Calculates every payslip in a run.
   *
   * Recalculating replaces the previous payslips wholesale rather than patching
   * them, so a corrected input always produces a clean result. A run that has
   * been approved or paid can never be recalculated.
   */
  async calculateRun(user: AuthenticatedUser, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: user.organizationId },
      include: { period: true },
    });
    if (!run) throw new NotFoundError('PayrollRun', runId);

    const immutable: PayrollRunStatus[] = [PayrollRunStatus.APPROVED, PayrollRunStatus.PAID];
    if (immutable.includes(run.status)) {
      throw new BusinessRuleError(
        'PAYROLL_RUN_LOCKED',
        'An approved or paid run cannot be recalculated — create an off-cycle run instead',
      );
    }
    await this.refusePaidBeforeCwork(user.organizationId, run.period);
    const firstHalf = await this.firstHalfFor(user.organizationId, run.period);

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: PayrollRunStatus.CALCULATING, failureReason: null },
    });

    try {
      const employees = await this.employeesInPeriod(user.organizationId, run.period);

      const workingDaysInPeriod = await this.countWorkingDays(
        user.organizationId,
        run.period.periodStart,
        run.period.periodEnd,
      );

      // Replace, don't patch: stale payslips from a previous attempt must go.
      await this.prisma.payslip.deleteMany({ where: { runId } });

      const { totals, count, skipped } = await this.payslipsFor(
        user.organizationId,
        run,
        employees,
        workingDaysInPeriod,
        firstHalf,
      );

      const organization = await this.organization.getOrganization(user.organizationId);

      const updated = await this.prisma.payrollRun.update({
        where: { id: runId },
        data: {
          status: PayrollRunStatus.CALCULATED,
          employeeCount: count,
          totalGross: toPrismaDecimal(totals.gross),
          totalDeduction: toPrismaDecimal(totals.deduction),
          totalNet: toPrismaDecimal(totals.net),
          totalEmployerCost: toPrismaDecimal(totals.employer),
          currency: organization.currency,
          calculatedAt: new Date(),
        },
      });

      if (skipped.length > 0) {
        this.logger.warn(
          `Run ${run.runNo}: skipped ${skipped.length} employee(s) without compensation`,
        );
      }

      return { ...updated, skipped };
    } catch (error) {
      await this.prisma.payrollRun.update({
        where: { id: runId },
        data: {
          status: PayrollRunStatus.FAILED,
          failureReason: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * A month the opening balances already cover was paid before Cwork (CW-059).
   * Paying it again here would pay people twice and count the month twice in
   * the year-to-date figures, so the run is refused and says from when Cwork
   * pays instead.
   */
  private async refusePaidBeforeCwork(
    organizationId: string,
    period: { year: number; month: number; code: string },
  ) {
    const covered = await this.prisma.payrollOpeningBalance.findMany({
      where: {
        organizationId,
        taxYear: period.year,
        throughMonth: { gte: period.month },
        employee: { deletedAt: null },
      },
      select: { throughMonth: true, employee: { select: { employeeCode: true } } },
      orderBy: { employee: { employeeCode: 'asc' } },
    });
    if (covered.length === 0) return;

    const through = Math.max(...covered.map((c) => c.throughMonth));
    throw new BusinessRuleError(
      'PAID_BEFORE_CWORK',
      `${period.code} was paid before Cwork: the opening balances of ${covered.length} ` +
        `employee(s) run to ${period.year}-${String(through).padStart(2, '0')}. ` +
        'Run payroll from the month after.',
      { throughMonth: through, employees: covered.map((c) => c.employee.employeeCode) },
    );
  }

  /**
   * The paid first half a second half builds on (CW-069).
   *
   * The second half withholds the month's tax and social security less what
   * the first half took, so it needs the first half settled; and the first
   * half's run is what marks the expense claims it paid, so calculating the
   * second half before it is paid would pay those claims twice. Both are
   * reasons to refuse rather than guess.
   */
  private async firstHalfFor(organizationId: string, period: PayrollPeriodWindow) {
    if (period.payFrequency !== PayFrequency.SEMI_MONTHLY || period.half !== 2) return null;

    const run = await this.prisma.payrollRun.findFirst({
      where: {
        organizationId,
        type: PayrollRunType.REGULAR,
        status: PayrollRunStatus.PAID,
        period: {
          payFrequency: PayFrequency.SEMI_MONTHLY,
          year: period.year,
          month: period.month,
          half: 1,
        },
      },
      select: { id: true },
    });
    if (!run) {
      throw new BusinessRuleError(
        'FIRST_HALF_NOT_PAID',
        `The second half of ${period.year}-${String(period.month).padStart(2, '0')} is ` +
          'worked out from the first half: pay the first half first',
      );
    }
    return { runId: run.id };
  }

  /**
   * Everyone the run has to pay.
   *
   * Hired by the end of the period and not gone before it started, so somebody
   * who left mid-month is still paid for the part they worked. `PRE_BOARDING`
   * is excluded because an accepted offer is not employment yet.
   */
  private employeesInPeriod(
    organizationId: string,
    period: { periodStart: Date; periodEnd: Date },
  ) {
    return this.prisma.employee.findMany({
      where: {
        organizationId,
        deletedAt: null,
        hireDate: { lte: period.periodEnd },
        OR: [{ lastWorkingDate: null }, { lastWorkingDate: { gte: period.periodStart } }],
        status: { notIn: ['PRE_BOARDING'] },
      },
      select: {
        id: true,
        employeeCode: true,
        firstNameTh: true,
        lastNameTh: true,
        userId: true,
        hireDate: true,
        lastWorkingDate: true,
      },
    });
  }

  /**
   * One payslip per employee, and the run totals as they accumulate.
   *
   * An employee with no effective compensation is *skipped and reported*, not
   * failed: one missing record must not stop the other three hundred people
   * being paid, and a silent omission is worse than either.
   */
  private async payslipsFor(
    organizationId: string,
    run: { id: string; period: PayrollPeriodWindow },
    employees: PayrollSubject[],
    workingDaysInPeriod: number,
    firstHalf: FirstHalfRun,
  ) {
    const totals = {
      gross: new Decimal(0),
      deduction: new Decimal(0),
      net: new Decimal(0),
      employer: new Decimal(0),
    };
    let count = 0;
    const skipped: Array<{ employeeCode: string; reason: string }> = [];

    for (const employee of employees) {
      const result = await this.calculateEmployeePayslip(
        organizationId,
        run.id,
        run.period,
        employee,
        workingDaysInPeriod,
        firstHalf,
      );

      // Paid in the other cycle: a daily-wage employee in a monthly run, or a
      // salaried one in a half-month run (CW-069).
      if (result === 'OTHER_PAY_FREQUENCY') continue;
      if (!result) {
        skipped.push({
          employeeCode: employee.employeeCode,
          reason: 'No effective compensation record',
        });
        continue;
      }

      totals.gross = totals.gross.plus(result.grossEarnings);
      totals.deduction = totals.deduction.plus(result.totalDeductions);
      totals.net = totals.net.plus(result.netPay);
      totals.employer = totals.employer.plus(result.employerCost);
      count += 1;
    }

    return { totals, count, skipped };
  }

  async approveRun(user: AuthenticatedUser, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: user.organizationId },
    });
    if (!run) throw new NotFoundError('PayrollRun', runId);
    if (
      run.status !== PayrollRunStatus.CALCULATED &&
      run.status !== PayrollRunStatus.PENDING_APPROVAL
    ) {
      throw new BusinessRuleError('RUN_NOT_CALCULATED', 'Only a calculated run can be approved');
    }
    // Separation of duties: whoever calculated the run cannot approve it.
    if (run.createdById && run.createdById === user.userId) {
      throw new BusinessRuleError(
        'SELF_APPROVAL_NOT_ALLOWED',
        'A payroll run must be approved by someone other than the person who prepared it',
      );
    }

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: PayrollRunStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: user.userId,
      },
    });
  }

  /**
   * Marks a run paid: publishes payslips, consumes the overtime and expense
   * claims it paid, and locks the attendance days it was based on.
   */
  async markPaid(user: AuthenticatedUser, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: user.organizationId },
      include: { period: true, payslips: { select: { id: true, employeeId: true } } },
    });
    if (!run) throw new NotFoundError('PayrollRun', runId);
    if (run.status !== PayrollRunStatus.APPROVED) {
      throw new BusinessRuleError('RUN_NOT_APPROVED', 'Only an approved run can be marked paid');
    }

    const employeeIds = run.payslips.map((p) => p.employeeId);

    // Interactive rather than the array form, so the notifications commit with
    // the payslips. "Published" and "everyone was told" are the same event as
    // far as an employee is concerned.
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({
        where: { id: runId },
        data: { status: PayrollRunStatus.PAID, paidAt: new Date() },
      });
      await tx.payslip.updateMany({ where: { runId }, data: { publishedAt: new Date() } });
      await tx.overtimeRequest.updateMany({
        where: {
          organizationId: user.organizationId,
          employeeId: { in: employeeIds },
          status: OvertimeStatus.APPROVED,
          isPaid: false,
          workDate: { gte: run.period.periodStart, lte: run.period.periodEnd },
        },
        data: { isPaid: true, payrollRunId: runId },
      });
      await tx.expenseClaim.updateMany({
        where: {
          organizationId: user.organizationId,
          employeeId: { in: employeeIds },
          status: ExpenseClaimStatus.APPROVED,
          paymentMethod: 'PAYROLL',
          decidedAt: { lte: run.period.cutoffDate },
        },
        data: { status: ExpenseClaimStatus.PAID, paidAt: new Date(), payrollRunId: runId },
      });
      // Locking prevents retroactive punch edits changing a paid month.
      await tx.attendanceRecord.updateMany({
        where: {
          organizationId: user.organizationId,
          employeeId: { in: employeeIds },
          workDate: { gte: run.period.periodStart, lte: run.period.periodEnd },
          lockedAt: null,
        },
        data: { lockedAt: new Date() },
      });
      await tx.payrollPeriod.update({
        where: { id: run.periodId },
        data: { status: PayrollPeriodStatus.CLOSED },
      });

      const recipients = await tx.employee.findMany({
        where: { id: { in: employeeIds }, userId: { not: null } },
        select: { userId: true },
      });

      await this.notifications.notifyManyIn(
        tx,
        user.organizationId,
        recipients.map((r) => r.userId!),
        {
          type: 'payslip.published',
          title: 'สลิปเงินเดือนพร้อมแล้ว',
          body: `สลิปเงินเดือนงวด ${run.period.code} เปิดให้ดูได้แล้ว`,
          data: { runId, periodCode: run.period.code },
        },
      );
    });

    return this.prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  }

  async cancelRun(user: AuthenticatedUser, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: user.organizationId },
    });
    if (!run) throw new NotFoundError('PayrollRun', runId);
    if (run.status === PayrollRunStatus.PAID) {
      throw new BusinessRuleError('RUN_ALREADY_PAID', 'A paid run cannot be cancelled');
    }

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: PayrollRunStatus.CANCELLED },
    });
  }

  listRuns(organizationId: string, periodId?: string) {
    return this.prisma.payrollRun.findMany({
      where: { organizationId, ...(periodId ? { periodId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { period: { select: { code: true, year: true, month: true, payDate: true } } },
    });
  }

  async getRun(organizationId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      include: {
        period: true,
        payslips: {
          orderBy: { employee: { employeeCode: 'asc' } },
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstNameTh: true,
                lastNameTh: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!run) throw new NotFoundError('PayrollRun', runId);
    return run;
  }

  // -------------------------------------------------------------------- export

  /**
   * Reconciles a period and returns the requested file (CW-044).
   *
   * The reconciliation is the point: a period whose runs are not all approved,
   * or whose payslip totals do not add up to the run totals, is refused with
   * the reason named — it never produces a file that is quietly wrong. A
   * successful export is written to the audit log with who took it, the period,
   * the format and the row count.
   */
  async exportPeriod(user: AuthenticatedUser, periodId: string, formatId?: string) {
    const format = resolveExportFormat(formatId);
    if (!format) {
      throw new BusinessRuleError(
        'UNKNOWN_EXPORT_FORMAT',
        `Unknown export format "${formatId}". Available: ${Object.keys(EXPORT_FORMATS).join(', ')}.`,
      );
    }

    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, organizationId: user.organizationId },
      include: {
        runs: {
          orderBy: { runNo: 'asc' },
          include: {
            payslips: {
              orderBy: { employee: { employeeCode: 'asc' } },
              include: {
                employee: {
                  select: {
                    employeeCode: true,
                    firstNameTh: true,
                    lastNameTh: true,
                    department: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!period) throw new NotFoundError('PayrollPeriod', periodId);

    let reconciled;
    try {
      reconciled = reconcilePeriod(
        { code: period.code, year: period.year, month: period.month },
        period.runs.map((run) => ({
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
          })),
        })),
      );
    } catch (error) {
      // Refusal is a client error, not a server fault: name the reason (422).
      if (error instanceof PayrollReconciliationError) {
        throw new BusinessRuleError(error.code, error.message);
      }
      throw error;
    }

    const content = format.build(reconciled);
    const rowCount = reconciled.rows.length;

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.EXPORT,
      entityType: 'PayrollPeriod',
      entityId: period.id,
      summary: `Exported payroll period ${period.code} as ${format.label}`,
      changes: { format: format.id, rowCount, period: period.code },
    });

    return {
      filename: `payroll-${period.code}.${format.extension}`,
      contentType: format.contentType,
      content,
      rowCount,
    };
  }

  // ------------------------------------------------------------------- payslips

  async getPayslip(user: AuthenticatedUser, payslipId: string, canReadAll: boolean) {
    const payslip = await this.prisma.payslip.findFirst({
      where: {
        id: payslipId,
        run: { organizationId: user.organizationId },
        ...(canReadAll ? {} : { employeeId: user.employeeId ?? '' }),
      },
      include: {
        items: { orderBy: { orderIndex: 'asc' } },
        run: { include: { period: true } },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstNameTh: true,
            lastNameTh: true,
            position: { select: { title: true } },
            department: { select: { name: true } },
          },
        },
      },
    });
    if (!payslip) throw new NotFoundError('Payslip', payslipId);

    // Employees only see published slips; a draft run is not a promise.
    if (!canReadAll && !payslip.publishedAt) {
      throw new NotFoundError('Payslip', payslipId);
    }

    if (payslip.employeeId === user.employeeId && !payslip.viewedAt) {
      await this.prisma.payslip.update({
        where: { id: payslipId },
        data: { viewedAt: new Date() },
      });
    }

    return payslip;
  }

  listMyPayslips(employeeId: string, year?: number) {
    return this.prisma.payslip.findMany({
      where: {
        employeeId,
        publishedAt: { not: null },
        ...(year ? { run: { period: { year } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        currency: true,
        grossEarnings: true,
        totalDeductions: true,
        netPay: true,
        publishedAt: true,
        viewedAt: true,
        run: {
          select: {
            runNo: true,
            period: { select: { code: true, year: true, month: true, payDate: true } },
          },
        },
      },
    });
  }

  // ------------------------------------------------------------------ internals

  private async calculateEmployeePayslip(
    organizationId: string,
    runId: string,
    period: PayrollPeriodWindow,
    employee: { id: string; hireDate: Date; lastWorkingDate: Date | null },
    workingDaysInPeriod: number,
    firstHalfRun: FirstHalfRun = null,
  ) {
    const employeeId = employee.id;
    const compensation = await this.prisma.employeeCompensation.findFirst({
      where: {
        employeeId,
        employee: { organizationId },
        effectiveFrom: { lte: period.periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.periodStart } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    // No salary on file means we cannot pay them — surfaced as `skipped`, never
    // silently paid as zero.
    if (!compensation) return null;

    // A half-month period pays the daily-wage employees; a monthly one pays
    // everyone else, as it always has (CW-069).
    const semiMonthly = period.payFrequency === PayFrequency.SEMI_MONTHLY;
    if (semiMonthly !== (compensation.payFrequency === PayFrequency.SEMI_MONTHLY)) {
      return 'OTHER_PAY_FREQUENCY' as const;
    }
    const half = semiMonthly ? period.half : 0;
    const dailyRate = compensation.dailyRate === null ? null : Number(compensation.dailyRate);

    const [
      attendance,
      overtimeRequests,
      recurringItems,
      claims,
      enrollments,
      taxProfile,
      ytd,
      openingBalance,
    ] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { employeeId, workDate: { gte: period.periodStart, lte: period.periodEnd } },
        select: { workDate: true, status: true, approvedOvertimeMinutes: true },
      }),
      this.prisma.overtimeRequest.findMany({
        where: {
          employeeId,
          status: OvertimeStatus.APPROVED,
          isPaid: false,
          workDate: { gte: period.periodStart, lte: period.periodEnd },
        },
        select: { type: true, approvedHours: true, requestedHours: true, rateMultiplier: true },
      }),
      this.prisma.employeeRecurringItem.findMany({
        where: {
          employeeId,
          effectiveFrom: { lte: period.periodEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.periodStart } }],
        },
        include: { component: true },
      }),
      this.prisma.expenseClaim.findMany({
        where: {
          employeeId,
          status: ExpenseClaimStatus.APPROVED,
          paymentMethod: 'PAYROLL',
          decidedAt: { lte: period.cutoffDate },
        },
        select: { id: true, claimNo: true, title: true, approvedAmount: true, totalAmount: true },
      }),
      this.prisma.benefitEnrollment.findMany({
        where: {
          employeeId,
          status: 'ACTIVE',
          effectiveFrom: { lte: period.periodEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.periodStart } }],
        },
        include: { plan: true },
      }),
      this.prisma.employeeTaxProfile.findUnique({
        where: { employeeId_taxYear: { employeeId, taxYear: period.year } },
      }),
      this.prisma.payslip.aggregate({
        where: {
          employeeId,
          run: {
            // A half reads the months before this one; its own first half is
            // read on its own, below, because the second half adds it to the
            // month rather than to the year so far (CW-069).
            period: semiMonthly
              ? { year: period.year, month: { lt: period.month } }
              : { year: period.year },
            status: { in: [PayrollRunStatus.APPROVED, PayrollRunStatus.PAID] },
          },
        },
        _sum: { taxableIncome: true, withholdingTax: true, ssoEmployee: true },
      }),
      this.prisma.payrollOpeningBalance.findUnique({
        where: { employeeId_taxYear: { employeeId, taxYear: period.year } },
      }),
    ]);

    // The year so far, and whose pay it was: Cwork's months, this employer's
    // months before Cwork (CW-059), and a previous employer's. Without the
    // earlier months the first run of a mid-year deployment under-projects the
    // annual salary and withholds far too little tax, which lands on the
    // employee as a bill in March.
    const yearSoFar = yearToDate({
      inCwork: {
        taxableIncome: Number(ytd._sum.taxableIncome ?? 0),
        withholdingTax: Number(ytd._sum.withholdingTax ?? 0),
        ssoEmployee: Number(ytd._sum.ssoEmployee ?? 0),
      },
      beforeCwork: openingBalance && {
        taxableIncome: Number(openingBalance.taxableIncome),
        withholdingTax: Number(openingBalance.withholdingTax),
        ssoEmployee: Number(openingBalance.ssoEmployee),
      },
      previousEmployer: taxProfile && {
        taxableIncome: Number(taxProfile.priorEmployerIncome),
        withholdingTax: Number(taxProfile.priorEmployerTax),
      },
    });

    const unpaidLeaveDays = await this.countUnpaidLeaveDays(
      employeeId,
      period.periodStart,
      period.periodEnd,
    );
    const firstHalf = half === 2 ? await this.firstHalfPaid(firstHalfRun, employeeId) : null;
    const absentDays = attendance.filter((r) => r.status === AttendanceStatus.ABSENT).length;

    // A monthly-salaried employee is paid the full month and then *deducted* for
    // unpaid leave and unexcused absence. Prorating by the count of attendance
    // records would underpay anyone whose days have not been closed out yet
    // (future dates in the period, a clock-in rollout still in progress), which
    // is the kind of bug that silently shorts people's pay.
    const employeeWorkingDays = await this.countEmployeeWorkingDays(
      organizationId,
      period,
      employee,
      workingDaysInPeriod,
    );
    const warnings: PayslipWarning[] = [];
    const daysPaid =
      dailyRate === null
        ? null
        : countDaysPaid(await this.dailyWageDays(organizationId, period, employee, attendance));
    const effectivePayableDays =
      daysPaid?.days ?? Math.max(0, employeeWorkingDays - unpaidLeaveDays - absentDays);

    const overtime: OvertimeLine[] = overtimeRequests.map((ot) => ({
      type: ot.type,
      hours: Number(ot.approvedHours ?? ot.requestedHours),
      multiplier: Number(ot.rateMultiplier ?? DEFAULT_OT_MULTIPLIERS[ot.type]),
    }));

    if (dailyRate !== null && daysPaid) {
      warnings.push(...daysPaid.warnings);
      warnings.push(...(await this.minimumWageWarningsFor(employeeId, dailyRate)));
      // Work on a weekly day off or a holiday is paid at statutory rates that
      // differ for an employee who is not paid for the day off. The
      // overtime engine has one rate per type for everybody, so HR is asked to
      // check it rather than told it is right (documented gap, CW-069).
      const restDayWork = overtime.filter(
        (ot) => ot.hours > 0 && (ot.type === 'DAY_OFF' || ot.type === 'HOLIDAY'),
      );
      if (restDayWork.length > 0) {
        warnings.push({
          code: 'REST_DAY_WORK_RATE',
          params: {
            hours: restDayWork.reduce((acc, ot) => acc + ot.hours, 0),
            rates: restDayWork.map((ot) => `${ot.type} ${ot.multiplier}x`).join(', '),
          },
        });
      }
    }

    // Monthly amounts are charged once a month: benefit premiums and standing
    // allowances and deductions go on the second half (PO decision Q6).
    const monthlyItemsHere = half !== 1;

    const input: PayslipInput = {
      baseSalary: Number(compensation.baseSalary),
      ...(dailyRate !== null && daysPaid
        ? { dailyWage: { rate: dailyRate, daysPaid: daysPaid.days } }
        : {}),
      ...(half === 1 ? { half: { half: 1 as const } } : {}),
      ...(half === 2 ? { half: { half: 2 as const, firstHalf: firstHalf! } } : {}),
      currency: compensation.currency,
      workingDaysInPeriod,
      payableDays: effectivePayableDays,
      unpaidLeaveDays,
      overtime,
      recurring: (monthlyItemsHere ? recurringItems : []).map((item) => ({
        code: item.component.code,
        name: item.component.name,
        type: item.component.type,
        amount: Number(item.amount),
        isTaxable: item.component.isTaxable,
        includeInSsoBase: item.component.includeInSsoBase,
        isProratable: item.component.isProratable,
        orderIndex: item.component.orderIndex,
      })),
      reimbursements: claims.map((claim) => ({
        code: claim.claimNo,
        name: `เบิกค่าใช้จ่าย: ${claim.title}`,
        amount: Number(claim.approvedAmount ?? claim.totalAmount),
      })),
      benefitDeductions: (monthlyItemsHere ? enrollments : [])
        .filter((e) => Number(e.plan.employeeCostPerPeriod) > 0)
        .map((e) => ({
          code: `BEN_${e.plan.code}`,
          name: e.plan.name,
          amount: Number(e.plan.employeeCostPerPeriod),
        })),
      employerBenefitCosts: (monthlyItemsHere ? enrollments : [])
        .filter((e) => Number(e.plan.employerCostPerPeriod) > 0)
        .map((e) => ({
          code: `BEN_ER_${e.plan.code}`,
          name: `${e.plan.name} (นายจ้าง)`,
          amount: Number(e.plan.employerCostPerPeriod),
        })),
      isSsoEligible: compensation.isSsoEligible,
      pvdEmployeeRate: Number(compensation.pvdEmployeeRate),
      pvdEmployerRate: Number(compensation.pvdEmployerRate),
      monthNumber: period.month,
      ytdTaxableIncome: yearSoFar.forThisMonth.taxableIncome,
      ytdWithheldTax: yearSoFar.forThisMonth.withholdingTax,
      ytdSsoEmployee: yearSoFar.forThisMonth.ssoEmployee,
      taxAllowances: taxProfile
        ? {
            hasSpouseAllowance: taxProfile.spouseAllowance,
            childrenCount: taxProfile.childrenCount,
            childrenBorn2018OrLater: taxProfile.childrenBorn2018OrLater,
            parentCareCount: taxProfile.parentCareCount,
            disabledCareCount: taxProfile.disabledCareCount,
            lifeInsurancePremium: Number(taxProfile.lifeInsurancePremium),
            healthInsurancePremium: Number(taxProfile.healthInsurancePremium),
            parentHealthInsurancePremium: Number(taxProfile.parentHealthInsurancePremium),
            rmfContribution: Number(taxProfile.rmfContribution),
            ssfContribution: Number(taxProfile.ssfContribution),
            mortgageInterest: Number(taxProfile.mortgageInterest),
            donation: Number(taxProfile.donation),
            educationDonation: Number(taxProfile.educationDonation),
          }
        : {},
    };

    const draft = buildPayslip(input);
    warnings.push(...draft.warnings);

    await this.prisma.payslip.create({
      data: {
        runId,
        employeeId,
        currency: input.currency,
        baseSalary: toPrismaDecimal(draft.baseSalary),
        grossEarnings: toPrismaDecimal(draft.grossEarnings),
        totalDeductions: toPrismaDecimal(draft.totalDeductions),
        netPay: toPrismaDecimal(draft.netPay),
        taxableIncome: toPrismaDecimal(draft.taxableIncome),
        withholdingTax: toPrismaDecimal(draft.withholdingTax),
        ssoEmployee: toPrismaDecimal(draft.ssoEmployee),
        ssoEmployer: toPrismaDecimal(draft.ssoEmployer),
        pvdEmployee: toPrismaDecimal(draft.pvdEmployee),
        pvdEmployer: toPrismaDecimal(draft.pvdEmployer),
        workedDays: new Prisma.Decimal(effectivePayableDays),
        unpaidLeaveDays: new Prisma.Decimal(unpaidLeaveDays),
        overtimeHours: toPrismaDecimal(draft.overtimeHours),
        warnings: warnings as unknown as Prisma.InputJsonValue,
        // Frozen inputs: makes the slip reproducible and explains any dispute.
        snapshot: {
          compensationId: compensation.id,
          baseSalary: Number(compensation.baseSalary),
          ...(dailyRate !== null ? { dailyRate, daysPaid } : {}),
          ...(half ? { half, firstHalf } : {}),
          ssoWage: draft.ssoWage.toNumber(),
          workingDaysInPeriod,
          employeeWorkingDays,
          unpaidLeaveDays,
          absentDays,
          payableDays: effectivePayableDays,
          taxAllowances: input.taxAllowances,
          yearToDate: yearSoFar,
          overtime,
          calculatedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
        items: {
          create: draft.lines.map((line) => ({
            code: line.code,
            name: line.name,
            type: line.type,
            quantity: line.quantity ? toPrismaDecimal(line.quantity) : null,
            rate: line.rate ? toPrismaDecimal(line.rate) : null,
            amount: toPrismaDecimal(line.amount),
            isTaxable: line.isTaxable,
            orderIndex: line.orderIndex,
            meta: (line.meta ?? {}) as Prisma.InputJsonValue,
          })),
        },
      },
    });

    return draft;
  }

  /**
   * What the employee's first half paid this month (CW-069). Someone who
   * joined in the second half has no first-half payslip, which is a first
   * half of nothing.
   */
  private async firstHalfPaid(run: FirstHalfRun, employeeId: string): Promise<FirstHalfPaid> {
    const slip = run
      ? await this.prisma.payslip.findUnique({
          where: { runId_employeeId: { runId: run.runId, employeeId } },
          select: {
            taxableIncome: true,
            withholdingTax: true,
            ssoEmployee: true,
            pvdEmployee: true,
            snapshot: true,
          },
        })
      : null;
    if (!slip) {
      return { taxableIncome: 0, withholdingTax: 0, ssoEmployee: 0, ssoWage: 0, pvdEmployee: 0 };
    }
    return {
      taxableIncome: Number(slip.taxableIncome),
      withholdingTax: Number(slip.withholdingTax),
      ssoEmployee: Number(slip.ssoEmployee),
      ssoWage: Number((slip.snapshot as { ssoWage?: number } | null)?.ssoWage ?? 0),
      pvdEmployee: Number(slip.pvdEmployee),
    };
  }

  /**
   * Each day of the period a daily-wage employee was employed for, with what
   * decides whether it is paid (CW-069): their schedule, the paid public
   * holidays where they work, the day's attendance and any approved leave.
   */
  private async dailyWageDays(
    organizationId: string,
    period: { periodStart: Date; periodEnd: Date },
    employee: { id: string; hireDate: Date; lastWorkingDate: Date | null },
    attendance: Array<{ workDate: Date; status: AttendanceStatus }>,
  ): Promise<DailyWageDay[]> {
    const from = employee.hireDate > period.periodStart ? employee.hireDate : period.periodStart;
    const to =
      employee.lastWorkingDate && employee.lastWorkingDate < period.periodEnd
        ? employee.lastWorkingDate
        : period.periodEnd;
    if (to < from) return [];

    const [person, assignments, leaveDays] = await Promise.all([
      this.prisma.employee.findUniqueOrThrow({
        where: { id: employee.id },
        select: { workLocationId: true },
      }),
      this.prisma.scheduleAssignment.findMany({
        where: {
          employeeId: employee.id,
          effectiveFrom: { lte: to },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
        orderBy: { effectiveFrom: 'desc' },
        select: {
          effectiveFrom: true,
          effectiveTo: true,
          schedule: { select: { workingDays: true } },
        },
      }),
      this.prisma.leaveRequestDay.findMany({
        where: {
          date: { gte: from, lte: to },
          leaveRequest: { employeeId: employee.id, status: 'APPROVED' },
        },
        select: {
          date: true,
          dayValue: true,
          leaveRequest: { select: { leaveType: { select: { isPaid: true } } } },
        },
      }),
    ]);
    const holidays = await this.prisma.holiday.findMany({
      where: {
        organizationId,
        isPaid: true,
        date: { gte: from, lte: to },
        OR: [
          { workLocationId: null },
          ...(person.workLocationId ? [{ workLocationId: person.workLocationId }] : []),
        ],
      },
      select: { date: true },
    });

    const paidHolidays = new Set(holidays.map((h) => formatDateOnly(h.date)));
    const statusOn = new Map(attendance.map((r) => [formatDateOnly(r.workDate), r.status]));
    const leaveOn = new Map<string, { paid: Decimal; unpaid: Decimal }>();
    for (const day of leaveDays) {
      const key = formatDateOnly(day.date);
      const entry = leaveOn.get(key) ?? { paid: new Decimal(0), unpaid: new Decimal(0) };
      if (day.leaveRequest.leaveType.isPaid) entry.paid = entry.paid.plus(day.dayValue.toString());
      else entry.unpaid = entry.unpaid.plus(day.dayValue.toString());
      leaveOn.set(key, entry);
    }

    return eachDateInRange(from, to).map((date) => {
      const key = formatDateOnly(date);
      const assignment = assignments.find(
        (a) => a.effectiveFrom <= date && (a.effectiveTo === null || a.effectiveTo >= date),
      );
      // The same default the overtime engine uses for someone with no schedule.
      const workingDays = assignment?.schedule.workingDays ?? [1, 2, 3, 4, 5];
      const leave = leaveOn.get(key);
      return {
        date: key,
        scheduled: workingDays.includes(isoWeekday(date)),
        paidHoliday: paidHolidays.has(key),
        attendance: statusOn.get(key) ?? null,
        paidLeave: leave?.paid.toNumber() ?? 0,
        unpaidLeave: leave?.unpaid.toNumber() ?? 0,
      };
    });
  }

  /** The minimum wage check, again at calculation: the location's rate may have changed. */
  private async minimumWageWarningsFor(employeeId: string, dailyRate: number) {
    const { workLocation } = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: {
        workLocation: {
          select: { name: true, minimumDailyWage: true, minimumDailyWageSource: true },
        },
      },
    });
    return minimumWageWarnings(
      dailyRate,
      workLocation && {
        name: workLocation.name,
        minimumDailyWage:
          workLocation.minimumDailyWage === null ? null : Number(workLocation.minimumDailyWage),
        minimumDailyWageSource: workLocation.minimumDailyWageSource,
      },
    );
  }

  /**
   * Working days the employee was actually employed for, so a mid-month joiner
   * or leaver is prorated on the calendar rather than on attendance coverage.
   */
  private async countEmployeeWorkingDays(
    organizationId: string,
    period: { periodStart: Date; periodEnd: Date },
    employee: { hireDate: Date; lastWorkingDate: Date | null },
    workingDaysInPeriod: number,
  ): Promise<number> {
    const startsLate = employee.hireDate > period.periodStart;
    const endsEarly =
      employee.lastWorkingDate !== null && employee.lastWorkingDate < period.periodEnd;
    if (!startsLate && !endsEarly) return workingDaysInPeriod;

    const from = startsLate ? employee.hireDate : period.periodStart;
    const to = endsEarly ? employee.lastWorkingDate! : period.periodEnd;
    if (to < from) return 0;

    return this.countWorkingDays(organizationId, from, to);
  }

  /** Working days in a period: schedule weekdays minus public holidays. */
  private async countWorkingDays(organizationId: string, from: Date, to: Date): Promise<number> {
    const holidays = await this.organization.holidayDateSet(organizationId, from, to);
    return eachDateInRange(from, to).filter(
      (date) => isoWeekday(date) <= 5 && !holidays.has(formatDateOnly(date)),
    ).length;
  }

  private async countUnpaidLeaveDays(employeeId: string, from: Date, to: Date): Promise<number> {
    const days = await this.prisma.leaveRequestDay.findMany({
      where: {
        date: { gte: from, lte: to },
        leaveRequest: { employeeId, status: 'APPROVED', leaveType: { isPaid: false } },
      },
      select: { dayValue: true },
    });
    return round2(
      days.reduce((acc, d) => acc.plus(d.dayValue.toString()), new Decimal(0)),
    ).toNumber();
  }

  private async requirePeriod(organizationId: string, periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, organizationId },
    });
    if (!period) throw new NotFoundError('PayrollPeriod', periodId);
    return period;
  }
}

/** Re-exported so the seed and reports can reference the standard components. */
export const SYSTEM_PAY_COMPONENTS: Array<{
  code: string;
  name: string;
  type: PayComponentType;
  isTaxable: boolean;
  includeInSsoBase: boolean;
}> = [
  {
    code: 'BASE',
    name: 'เงินเดือน',
    type: PayComponentType.EARNING,
    isTaxable: true,
    includeInSsoBase: true,
  },
  {
    code: 'OT',
    name: 'ค่าล่วงเวลา',
    type: PayComponentType.EARNING,
    isTaxable: true,
    includeInSsoBase: false,
  },
  {
    code: 'SSO',
    name: 'ประกันสังคม',
    type: PayComponentType.DEDUCTION,
    isTaxable: false,
    includeInSsoBase: false,
  },
  {
    code: 'WHT',
    name: 'ภาษีหัก ณ ที่จ่าย',
    type: PayComponentType.DEDUCTION,
    isTaxable: false,
    includeInSsoBase: false,
  },
  {
    code: 'PVD',
    name: 'กองทุนสำรองเลี้ยงชีพ',
    type: PayComponentType.DEDUCTION,
    isTaxable: false,
    includeInSsoBase: false,
  },
];
