import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceStatus,
  ExpenseClaimStatus,
  OvertimeStatus,
  PayComponentType,
  PayrollPeriodStatus,
  PayrollRunStatus,
  PayrollRunType,
  Prisma,
} from '@prisma/client';
import { BusinessRuleError, ErrorCode, NotFoundError } from '../../core/errors/domain.errors';
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
import { buildPayslip, type OvertimeLine, type PayslipInput } from './domain/payroll-calculator';
import type { CreatePayrollPeriodDto, CreatePayrollRunDto } from './dto/payroll.dto';

/** The period fields a calculation reads — not the whole row. */
type PayrollPeriodWindow = {
  periodStart: Date;
  periodEnd: Date;
  cutoffDate: Date;
  year: number;
  month: number;
};

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
  ) {}

  // -------------------------------------------------------------------- periods

  listPeriods(organizationId: string, year?: number) {
    return this.prisma.payrollPeriod.findMany({
      where: { organizationId, ...(year ? { year } : {}) },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { _count: { select: { runs: true } } },
    });
  }

  createPeriod(organizationId: string, dto: CreatePayrollPeriodDto) {
    const periodStart = toDateOnly(dto.periodStart);
    const periodEnd = toDateOnly(dto.periodEnd);

    if (periodEnd < periodStart) {
      throw new BusinessRuleError('INVALID_PERIOD', 'The period must end after it starts');
    }

    return this.prisma.payrollPeriod.create({
      data: {
        organizationId,
        code: dto.code ?? `${dto.year}-${String(dto.month).padStart(2, '0')}`,
        year: dto.year,
        month: dto.month,
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
      );

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
    period: { periodStart: Date; periodEnd: Date; cutoffDate: Date; year: number; month: number },
    employee: { id: string; hireDate: Date; lastWorkingDate: Date | null },
    workingDaysInPeriod: number,
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

    const [attendance, overtimeRequests, recurringItems, claims, enrollments, taxProfile, ytd] =
      await Promise.all([
        this.prisma.attendanceRecord.findMany({
          where: { employeeId, workDate: { gte: period.periodStart, lte: period.periodEnd } },
          select: { status: true, approvedOvertimeMinutes: true },
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
              period: { year: period.year },
              status: { in: [PayrollRunStatus.APPROVED, PayrollRunStatus.PAID] },
            },
          },
          _sum: { taxableIncome: true, withholdingTax: true, ssoEmployee: true },
        }),
      ]);

    const unpaidLeaveDays = await this.countUnpaidLeaveDays(
      employeeId,
      period.periodStart,
      period.periodEnd,
    );
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
    const effectivePayableDays = Math.max(0, employeeWorkingDays - unpaidLeaveDays - absentDays);

    const overtime: OvertimeLine[] = overtimeRequests.map((ot) => ({
      type: ot.type,
      hours: Number(ot.approvedHours ?? ot.requestedHours),
      multiplier: Number(ot.rateMultiplier ?? DEFAULT_OT_MULTIPLIERS[ot.type]),
    }));

    const input: PayslipInput = {
      baseSalary: Number(compensation.baseSalary),
      currency: compensation.currency,
      workingDaysInPeriod,
      payableDays: effectivePayableDays,
      unpaidLeaveDays,
      overtime,
      recurring: recurringItems.map((item) => ({
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
      benefitDeductions: enrollments
        .filter((e) => Number(e.plan.employeeCostPerPeriod) > 0)
        .map((e) => ({
          code: `BEN_${e.plan.code}`,
          name: e.plan.name,
          amount: Number(e.plan.employeeCostPerPeriod),
        })),
      employerBenefitCosts: enrollments
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
      // Year-to-date must include income earned before this system went live,
      // otherwise the first run of a mid-year deployment under-projects the
      // annual salary and withholds far too little tax — which lands on the
      // employee as a bill in March. HR enters these on the tax profile.
      ytdTaxableIncome:
        Number(ytd._sum.taxableIncome ?? 0) + Number(taxProfile?.priorEmployerIncome ?? 0),
      ytdWithheldTax:
        Number(ytd._sum.withholdingTax ?? 0) + Number(taxProfile?.priorEmployerTax ?? 0),
      ytdSsoEmployee: Number(ytd._sum.ssoEmployee ?? 0),
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
        // Frozen inputs: makes the slip reproducible and explains any dispute.
        snapshot: {
          compensationId: compensation.id,
          baseSalary: Number(compensation.baseSalary),
          workingDaysInPeriod,
          employeeWorkingDays,
          unpaidLeaveDays,
          absentDays,
          payableDays: effectivePayableDays,
          taxAllowances: input.taxAllowances,
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
