import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ApprovalEntityType,
  ApprovalStatus,
  DayPortion,
  LeaveRequestStatus,
  LeaveUnit,
  Prisma,
} from '@prisma/client';
import { BusinessRuleError, ErrorCode, NotFoundError } from '../../core/errors/domain.errors';
import { PageDto } from '../../core/http/pagination.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { Permission } from '../../core/security/permissions';
import { formatDateOnly, toDateOnly, yearsOfService } from '../../core/utils/date.util';
import { Decimal, toPrismaDecimal } from '../../core/utils/money.util';
import { SequenceService } from '../../core/utils/sequence.service';
import {
  ApprovalOutcomeRegistry,
  type ApprovalOutcome,
} from '../approvals/approval-outcome.registry';
import { ApprovalService } from '../approvals/approval.service';
import { employeeVisibilityFilter, requireEmployeeId } from '../../core/security/employee-access';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationService } from '../organization/organization.service';
import { computeLeaveDays } from './domain/leave-calculator';
import type {
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  LeaveRequestQueryDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto';
import { LeaveBalanceService } from './leave-balance.service';

const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5];

@Injectable()
export class LeaveService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: LeaveBalanceService,
    private readonly approvals: ApprovalService,
    private readonly outcomes: ApprovalOutcomeRegistry,
    private readonly notifications: NotificationsService,
    private readonly organization: OrganizationService,
    private readonly sequences: SequenceService,
  ) {}

  onModuleInit(): void {
    this.outcomes.register(ApprovalEntityType.LEAVE_REQUEST, (outcome) =>
      this.onApprovalOutcome(outcome),
    );
  }

  // ----------------------------------------------------------------- leave types

  listLeaveTypes(organizationId: string, includeInactive = false) {
    return this.prisma.leaveType.findMany({
      where: { organizationId, deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ orderIndex: 'asc' }, { code: 'asc' }],
    });
  }

  createLeaveType(organizationId: string, dto: CreateLeaveTypeDto) {
    return this.prisma.leaveType.create({
      data: {
        ...dto,
        organizationId,
        defaultQuota:
          dto.defaultQuota !== undefined ? new Prisma.Decimal(dto.defaultQuota) : undefined,
        maxPerYear: dto.maxPerYear !== undefined ? new Prisma.Decimal(dto.maxPerYear) : undefined,
        carryOverMaxDays:
          dto.carryOverMaxDays !== undefined ? new Prisma.Decimal(dto.carryOverMaxDays) : undefined,
        seniorityTiers: (dto.seniorityTiers ?? []) as Prisma.InputJsonValue,
      },
    });
  }

  async updateLeaveType(organizationId: string, id: string, dto: UpdateLeaveTypeDto) {
    const existing = await this.prisma.leaveType.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('LeaveType', id);

    return this.prisma.leaveType.update({
      where: { id },
      data: {
        ...dto,
        defaultQuota:
          dto.defaultQuota !== undefined ? new Prisma.Decimal(dto.defaultQuota) : undefined,
        maxPerYear: dto.maxPerYear !== undefined ? new Prisma.Decimal(dto.maxPerYear) : undefined,
        carryOverMaxDays:
          dto.carryOverMaxDays !== undefined ? new Prisma.Decimal(dto.carryOverMaxDays) : undefined,
        seniorityTiers: dto.seniorityTiers
          ? (dto.seniorityTiers as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  // -------------------------------------------------------------- leave requests

  /**
   * Previews a request without saving it: which days are charged, how many, and
   * what the balance would become. The mobile app calls this as the user picks
   * dates so the cost is visible before submitting.
   */
  async preview(user: AuthenticatedUser, dto: CreateLeaveRequestDto, employeeId?: string) {
    const subjectId = employeeId ?? requireEmployeeId(user);
    const { leaveType, computed, employee } = await this.resolveRequest(
      user.organizationId,
      subjectId,
      dto,
    );

    const year = toDateOnly(dto.startDate).getUTCFullYear();
    const balances = await this.balances.getBalances(user.organizationId, subjectId, year);
    const balance = balances.find((b) => b.leaveTypeId === leaveType.id);

    return {
      leaveType: {
        id: leaveType.id,
        code: leaveType.code,
        name: leaveType.name,
        isPaid: leaveType.isPaid,
      },
      employee: { id: employee.id, name: `${employee.firstNameTh} ${employee.lastNameTh}` },
      days: computed.days.map((d) => ({
        date: formatDateOnly(d.date),
        portion: d.portion,
        dayValue: d.dayValue.toNumber(),
      })),
      totalDays: computed.totalDays.toNumber(),
      totalHours: computed.totalHours?.toNumber() ?? null,
      balanceBefore: balance?.available ?? 0,
      balanceAfter: (balance?.available ?? 0) - computed.totalDays.toNumber(),
      warnings: this.collectWarnings(leaveType, computed.totalDays, balance?.available ?? 0, dto),
    };
  }

  async create(user: AuthenticatedUser, dto: CreateLeaveRequestDto) {
    const employeeId = requireEmployeeId(user);
    const { leaveType, computed } = await this.resolveRequest(user.organizationId, employeeId, dto);

    this.assertRequestAllowed(leaveType, computed.totalDays, dto);

    const year = toDateOnly(dto.startDate).getUTCFullYear();
    await this.assertNoOverlap(employeeId, toDateOnly(dto.startDate), toDateOnly(dto.endDate));

    const requestNo = await this.sequences.next(user.organizationId, 'LEAVE_REQUEST', year);
    const isDraft = dto.saveAsDraft === true;

    const request = await this.prisma.$transaction(async (tx) => {
      const entitlement = await this.balances.ensureEntitlement(
        tx,
        user.organizationId,
        employeeId,
        leaveType,
        year,
      );

      if (!isDraft) {
        await this.assertSufficientBalance(entitlement, leaveType, computed.totalDays);
        await this.balances.applyDelta(tx, entitlement.id, { pending: computed.totalDays });
      }

      return tx.leaveRequest.create({
        data: {
          organizationId: user.organizationId,
          requestNo,
          employeeId,
          leaveTypeId: leaveType.id,
          startDate: toDateOnly(dto.startDate),
          endDate: toDateOnly(dto.endDate),
          startPortion: dto.startPortion ?? DayPortion.FULL,
          endPortion: dto.endPortion ?? DayPortion.FULL,
          totalDays: toPrismaDecimal(computed.totalDays),
          totalHours: computed.totalHours ? toPrismaDecimal(computed.totalHours) : null,
          reason: dto.reason,
          contactPhone: dto.contactPhone,
          backupEmployeeId: dto.backupEmployeeId,
          attachmentIds: dto.attachmentIds ?? [],
          status: isDraft ? LeaveRequestStatus.DRAFT : LeaveRequestStatus.PENDING,
          submittedAt: isDraft ? null : new Date(),
          days: {
            create: computed.days.map((day) => ({
              date: day.date,
              portion: day.portion,
              hours: day.hours !== null ? new Prisma.Decimal(day.hours) : null,
              dayValue: toPrismaDecimal(day.dayValue),
            })),
          },
        },
      });
    });

    if (!isDraft) {
      await this.startApproval(user, request.id);
    }

    return this.findOne(user, request.id);
  }

  /**
   * Used by the AI assistant: files a request on the employee's behalf with the
   * provenance flag set, so HR can always tell an assistant-filed request apart.
   */
  async createViaAssistant(user: AuthenticatedUser, dto: CreateLeaveRequestDto) {
    const created = await this.create(user, { ...dto, saveAsDraft: false });
    await this.prisma.leaveRequest.update({
      where: { id: created.id },
      data: { createdViaAssistant: true },
    });
    return { ...created, createdViaAssistant: true };
  }

  async submitDraft(user: AuthenticatedUser, id: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { leaveType: true },
    });
    if (!request) throw new NotFoundError('LeaveRequest', id);
    if (request.employeeId !== user.employeeId) {
      throw new BusinessRuleError(
        'NOT_YOUR_REQUEST',
        'You can only submit your own leave requests',
      );
    }
    if (request.status !== LeaveRequestStatus.DRAFT) {
      throw new BusinessRuleError('NOT_A_DRAFT', 'Only draft requests can be submitted');
    }

    const totalDays = new Decimal(request.totalDays.toString());
    const year = request.startDate.getUTCFullYear();

    await this.prisma.$transaction(async (tx) => {
      const entitlement = await this.balances.ensureEntitlement(
        tx,
        user.organizationId,
        request.employeeId,
        request.leaveType,
        year,
      );
      await this.assertSufficientBalance(entitlement, request.leaveType, totalDays);
      await this.balances.applyDelta(tx, entitlement.id, { pending: totalDays });
      await tx.leaveRequest.update({
        where: { id },
        data: { status: LeaveRequestStatus.PENDING, submittedAt: new Date() },
      });
    });

    await this.startApproval(user, id);
    return this.findOne(user, id);
  }

  async cancel(user: AuthenticatedUser, id: string, reason?: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { leaveType: true },
    });
    if (!request) throw new NotFoundError('LeaveRequest', id);

    const isOwner = request.employeeId === user.employeeId;
    const canManage = user.permissions.includes(Permission.LEAVE_MANAGE);
    if (!isOwner && !canManage) {
      throw new BusinessRuleError(
        'NOT_YOUR_REQUEST',
        'You can only cancel your own leave requests',
      );
    }

    const cancellable: LeaveRequestStatus[] = [
      LeaveRequestStatus.DRAFT,
      LeaveRequestStatus.PENDING,
      LeaveRequestStatus.APPROVED,
    ];
    if (!cancellable.includes(request.status)) {
      throw new BusinessRuleError(
        'NOT_CANCELLABLE',
        `A ${request.status} request cannot be cancelled`,
      );
    }

    // Cancelling an approved request that already started needs HR, because the
    // days have been consumed and may already be reflected in attendance.
    if (
      request.status === LeaveRequestStatus.APPROVED &&
      request.startDate <= toDateOnly(new Date()) &&
      !canManage
    ) {
      throw new BusinessRuleError(
        'LEAVE_ALREADY_STARTED',
        'This leave has already started — ask HR to cancel it',
      );
    }

    const totalDays = new Decimal(request.totalDays.toString());
    const year = request.startDate.getUTCFullYear();

    await this.prisma.$transaction(async (tx) => {
      if (request.status !== LeaveRequestStatus.DRAFT) {
        const entitlement = await this.balances.ensureEntitlement(
          tx,
          user.organizationId,
          request.employeeId,
          request.leaveType,
          year,
        );
        // Return the days to whichever bucket they were taken from.
        await this.balances.applyDelta(tx, entitlement.id, {
          ...(request.status === LeaveRequestStatus.PENDING
            ? { pending: totalDays.negated() }
            : { used: totalDays.negated() }),
        });
      }

      await tx.leaveRequest.update({
        where: { id },
        data: {
          status:
            request.status === LeaveRequestStatus.APPROVED
              ? LeaveRequestStatus.CANCELLED_AFTER_APPROVAL
              : LeaveRequestStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });
    });

    if (request.approvalInstanceId) {
      await this.approvals.cancel(request.approvalInstanceId, reason ?? 'Cancelled by requester');
    }

    return this.findOne(user, id);
  }

  async list(user: AuthenticatedUser, query: LeaveRequestQueryDto) {
    const where: Prisma.LeaveRequestWhereInput = {
      AND: [
        { organizationId: user.organizationId },
        { employee: employeeVisibilityFilter(user) },
        query.teamOnly && user.employeeId ? { employee: { managerId: user.employeeId } } : {},
        query.employeeId ? { employeeId: query.employeeId } : {},
        query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {},
        query.departmentId ? { employee: { departmentId: query.departmentId } } : {},
        query.status?.length ? { status: { in: query.status } } : {},
        query.from ? { endDate: { gte: toDateOnly(query.from) } } : {},
        query.to ? { startDate: { lte: toDateOnly(query.to) } } : {},
      ],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        orderBy: { startDate: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: {
          leaveType: { select: { id: true, code: true, name: true, colorHex: true, isPaid: true } },
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstNameTh: true,
              lastNameTh: true,
              photoFileId: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return PageDto.of(data, total, query.page, query.limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        employee: employeeVisibilityFilter(user),
      },
      include: {
        leaveType: true,
        days: { orderBy: { date: 'asc' } },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstNameTh: true,
            lastNameTh: true,
            department: { select: { id: true, name: true } },
            manager: { select: { id: true, firstNameTh: true, lastNameTh: true } },
          },
        },
        backupEmployee: { select: { id: true, firstNameTh: true, lastNameTh: true } },
      },
    });
    if (!request) throw new NotFoundError('LeaveRequest', id);

    const approval = request.approvalInstanceId
      ? await this.approvals.getInstanceForEntity(ApprovalEntityType.LEAVE_REQUEST, request.id)
      : null;

    return { ...request, approval };
  }

  /** Team calendar: who is away, for a date range. */
  async calendar(user: AuthenticatedUser, from: string, to: string, departmentId?: string) {
    return this.prisma.leaveRequest.findMany({
      where: {
        organizationId: user.organizationId,
        employee: { AND: [employeeVisibilityFilter(user), departmentId ? { departmentId } : {}] },
        status: { in: [LeaveRequestStatus.APPROVED, LeaveRequestStatus.PENDING] },
        startDate: { lte: toDateOnly(to) },
        endDate: { gte: toDateOnly(from) },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        totalDays: true,
        leaveType: { select: { code: true, name: true, colorHex: true } },
        employee: {
          select: {
            id: true,
            firstNameTh: true,
            lastNameTh: true,
            nickname: true,
            photoFileId: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  // ------------------------------------------------------------------ internals

  private async resolveRequest(
    organizationId: string,
    employeeId: string,
    dto: CreateLeaveRequestDto,
  ) {
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: dto.leaveTypeId, organizationId, isActive: true, deletedAt: null },
    });
    if (!leaveType) throw new NotFoundError('LeaveType', dto.leaveTypeId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId, deletedAt: null },
      select: {
        id: true,
        firstNameTh: true,
        lastNameTh: true,
        gender: true,
        hireDate: true,
        workLocationId: true,
        userId: true,
        managerId: true,
        scheduleAssignments: {
          where: {
            effectiveFrom: { lte: toDateOnly(dto.startDate) },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: toDateOnly(dto.startDate) } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          include: { schedule: { include: { defaultShift: true } } },
        },
      },
    });
    if (!employee) throw new NotFoundError('Employee', employeeId);

    if (leaveType.genderRestriction && leaveType.genderRestriction !== employee.gender) {
      throw new BusinessRuleError(
        'LEAVE_TYPE_NOT_ELIGIBLE',
        `${leaveType.name} is not available for this employee`,
      );
    }

    const serviceDays = Math.floor(
      (toDateOnly(dto.startDate).getTime() - toDateOnly(employee.hireDate).getTime()) / 86_400_000,
    );
    if (serviceDays < leaveType.minServiceDays) {
      throw new BusinessRuleError(
        'INSUFFICIENT_SERVICE',
        `${leaveType.name} requires ${leaveType.minServiceDays} days of service`,
        { serviceDays, requiredDays: leaveType.minServiceDays },
      );
    }

    const schedule = employee.scheduleAssignments[0]?.schedule;
    const workingWeekdays = schedule?.workingDays?.length
      ? schedule.workingDays
      : DEFAULT_WORKING_WEEKDAYS;
    const hoursPerDay = schedule?.defaultShift ? schedule.defaultShift.standardWorkMinutes / 60 : 8;

    const holidayDates = await this.organization.holidayDateSet(
      organizationId,
      toDateOnly(dto.startDate),
      toDateOnly(dto.endDate),
      employee.workLocationId,
    );

    const computed = computeLeaveDays({
      startDate: toDateOnly(dto.startDate),
      endDate: toDateOnly(dto.endDate),
      startPortion: dto.startPortion ?? DayPortion.FULL,
      endPortion: dto.endPortion ?? DayPortion.FULL,
      workingWeekdays,
      holidayDates,
      hoursPerDay,
      requestedHours: dto.requestedHours,
    });

    return { leaveType, employee, computed, yearsOfService: yearsOfService(employee.hireDate) };
  }

  private assertRequestAllowed(
    leaveType: {
      allowHalfDay: boolean;
      allowHourly: boolean;
      unit: LeaveUnit;
      requiresAttachment: boolean;
      attachmentRequiredAfterDays: number | null;
      minNoticeDays: number;
      maxConsecutiveDays: number | null;
      name: string;
    },
    totalDays: Decimal,
    dto: CreateLeaveRequestDto,
  ): void {
    if (totalDays.lessThanOrEqualTo(0)) {
      throw new BusinessRuleError(
        ErrorCode.NO_WORKING_DAYS_SELECTED,
        'The selected range contains no working days',
      );
    }

    const wantsHalfDay =
      (dto.startPortion &&
        dto.startPortion !== DayPortion.FULL &&
        dto.startPortion !== DayPortion.HOURS) ||
      (dto.endPortion && dto.endPortion !== DayPortion.FULL);
    if (wantsHalfDay && !leaveType.allowHalfDay) {
      throw new BusinessRuleError(
        'HALF_DAY_NOT_ALLOWED',
        `${leaveType.name} cannot be taken as a half day`,
      );
    }

    if (dto.startPortion === DayPortion.HOURS && !leaveType.allowHourly) {
      throw new BusinessRuleError(
        'HOURLY_NOT_ALLOWED',
        `${leaveType.name} cannot be taken by the hour`,
      );
    }

    if (leaveType.maxConsecutiveDays && totalDays.greaterThan(leaveType.maxConsecutiveDays)) {
      throw new BusinessRuleError(
        'EXCEEDS_MAX_CONSECUTIVE',
        `${leaveType.name} is limited to ${leaveType.maxConsecutiveDays} consecutive days`,
      );
    }

    const noticeDays = Math.floor(
      (toDateOnly(dto.startDate).getTime() - toDateOnly(new Date()).getTime()) / 86_400_000,
    );
    if (noticeDays < leaveType.minNoticeDays) {
      throw new BusinessRuleError(
        ErrorCode.LEAVE_NOTICE_TOO_SHORT,
        `${leaveType.name} requires ${leaveType.minNoticeDays} days of notice`,
        { noticeDays, requiredDays: leaveType.minNoticeDays },
      );
    }

    const attachmentThreshold = leaveType.attachmentRequiredAfterDays;
    const needsAttachment =
      leaveType.requiresAttachment &&
      (attachmentThreshold === null || totalDays.greaterThanOrEqualTo(attachmentThreshold));
    if (needsAttachment && (dto.attachmentIds ?? []).length === 0) {
      throw new BusinessRuleError(
        ErrorCode.LEAVE_ATTACHMENT_REQUIRED,
        `${leaveType.name} requires supporting documentation`,
      );
    }
  }

  private collectWarnings(
    leaveType: { minNoticeDays: number; name: string },
    totalDays: Decimal,
    available: number,
    dto: CreateLeaveRequestDto,
  ): string[] {
    const warnings: string[] = [];
    if (totalDays.toNumber() > available) {
      warnings.push(`เกินวันลาคงเหลือ ${(totalDays.toNumber() - available).toFixed(1)} วัน`);
    }
    const noticeDays = Math.floor(
      (toDateOnly(dto.startDate).getTime() - toDateOnly(new Date()).getTime()) / 86_400_000,
    );
    if (noticeDays < leaveType.minNoticeDays) {
      warnings.push(`แจ้งล่วงหน้าน้อยกว่า ${leaveType.minNoticeDays} วัน`);
    }
    return warnings;
  }

  private async assertNoOverlap(employeeId: string, startDate: Date, endDate: Date): Promise<void> {
    const conflict = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, requestNo: true, startDate: true, endDate: true },
    });

    if (conflict) {
      throw new BusinessRuleError(
        ErrorCode.OVERLAPPING_LEAVE,
        `This overlaps leave request ${conflict.requestNo}`,
        {
          conflictId: conflict.id,
          from: formatDateOnly(conflict.startDate),
          to: formatDateOnly(conflict.endDate),
        },
      );
    }
  }

  private async assertSufficientBalance(
    entitlement: {
      openingBalance: Prisma.Decimal;
      granted: Prisma.Decimal;
      carriedOver: Prisma.Decimal;
      adjusted: Prisma.Decimal;
      used: Prisma.Decimal;
      pending: Prisma.Decimal;
      expired: Prisma.Decimal;
    },
    leaveType: { allowNegativeBalance: boolean; name: string },
    requested: Decimal,
  ): Promise<void> {
    if (leaveType.allowNegativeBalance) return;

    const available = new Decimal(entitlement.openingBalance.toString())
      .plus(entitlement.granted.toString())
      .plus(entitlement.carriedOver.toString())
      .plus(entitlement.adjusted.toString())
      .minus(entitlement.used.toString())
      .minus(entitlement.pending.toString())
      .minus(entitlement.expired.toString());

    if (requested.greaterThan(available)) {
      throw new BusinessRuleError(
        ErrorCode.INSUFFICIENT_LEAVE_BALANCE,
        `Not enough ${leaveType.name}: ${available.toFixed(1)} days available, ${requested.toFixed(1)} requested`,
        { available: available.toNumber(), requested: requested.toNumber() },
      );
    }
  }

  private async startApproval(user: AuthenticatedUser, requestId: string): Promise<void> {
    const request = await this.prisma.leaveRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        leaveType: { select: { code: true, name: true } },
        employee: { select: { id: true, firstNameTh: true, lastNameTh: true, departmentId: true } },
      },
    });

    const result = await this.approvals.start({
      organizationId: user.organizationId,
      entityType: ApprovalEntityType.LEAVE_REQUEST,
      entityId: requestId,
      submittedByUserId: user.userId,
      subjectEmployeeId: request.employeeId,
      snapshot: {
        employeeId: request.employeeId,
        departmentId: request.employee.departmentId,
        leaveTypeCode: request.leaveType.code,
        totalDays: Number(request.totalDays),
        startDate: formatDateOnly(request.startDate),
      },
      notification: {
        title: 'คำขอลารออนุมัติ',
        body: `${request.employee.firstNameTh} ${request.employee.lastNameTh} ขอ${request.leaveType.name} ${Number(request.totalDays)} วัน (${formatDateOnly(request.startDate)})`,
      },
    });

    if (result.instanceId) {
      await this.prisma.leaveRequest.update({
        where: { id: requestId },
        data: { approvalInstanceId: result.instanceId },
      });
    }

    if (result.autoApproved) {
      await this.finaliseApproved(requestId);
    }
  }

  private async onApprovalOutcome(outcome: ApprovalOutcome): Promise<void> {
    if (outcome.status === ApprovalStatus.APPROVED) {
      await this.finaliseApproved(outcome.entityId, outcome.comment);
    } else if (outcome.status === ApprovalStatus.REJECTED) {
      await this.finaliseRejected(outcome.entityId, outcome.comment);
    }
  }

  /** Moves the reserved days from `pending` to `used` and notifies the employee. */
  private async finaliseApproved(requestId: string, comment?: string): Promise<void> {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        leaveType: true,
        employee: { select: { userId: true, organizationId: true } },
      },
    });
    if (!request || request.status !== LeaveRequestStatus.PENDING) return;

    const totalDays = new Decimal(request.totalDays.toString());
    const year = request.startDate.getUTCFullYear();

    await this.prisma.$transaction(async (tx) => {
      const entitlement = await this.balances.ensureEntitlement(
        tx,
        request.organizationId,
        request.employeeId,
        request.leaveType,
        year,
      );
      await this.balances.applyDelta(tx, entitlement.id, {
        pending: totalDays.negated(),
        used: totalDays,
      });
      await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: LeaveRequestStatus.APPROVED, decidedAt: new Date() },
      });

      // Inside the transaction: the balance moving and the employee being told
      // are one fact. A crash between them would otherwise leave an approval
      // nobody was told about.
      if (request.employee.userId) {
        await this.notifications.notifyIn(tx, request.organizationId, request.employee.userId, {
          type: 'leave.approved',
          title: 'คำขอลาได้รับการอนุมัติ',
          body: `${request.leaveType.name} ${formatDateOnly(request.startDate)} - ${formatDateOnly(request.endDate)}${comment ? ` · ${comment}` : ''}`,
          data: { leaveRequestId: requestId },
        });
      }
    });
  }

  /** Releases the reserved days back to the balance. */
  private async finaliseRejected(requestId: string, comment?: string): Promise<void> {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { leaveType: true, employee: { select: { userId: true } } },
    });
    if (!request || request.status !== LeaveRequestStatus.PENDING) return;

    const totalDays = new Decimal(request.totalDays.toString());
    const year = request.startDate.getUTCFullYear();

    await this.prisma.$transaction(async (tx) => {
      const entitlement = await this.balances.ensureEntitlement(
        tx,
        request.organizationId,
        request.employeeId,
        request.leaveType,
        year,
      );
      await this.balances.applyDelta(tx, entitlement.id, { pending: totalDays.negated() });
      await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: LeaveRequestStatus.REJECTED, decidedAt: new Date() },
      });

      if (request.employee.userId) {
        await this.notifications.notifyIn(tx, request.organizationId, request.employee.userId, {
          type: 'leave.rejected',
          title: 'คำขอลาไม่ได้รับการอนุมัติ',
          body: comment ?? `${request.leaveType.name} ${formatDateOnly(request.startDate)}`,
          data: { leaveRequestId: requestId },
        });
      }
    });
  }
}
