import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ApprovalEntityType,
  ApprovalStatus,
  OvertimeStatus,
  OvertimeType,
  Prisma,
} from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { formatDateOnly, isoWeekday, minutesBetween, toDateOnly } from '../../core/utils/date.util';
import { Decimal, toPrismaDecimal } from '../../core/utils/money.util';
import { SequenceService } from '../../core/utils/sequence.service';
import {
  ApprovalOutcomeRegistry,
  type ApprovalOutcome,
} from '../approvals/approval-outcome.registry';
import { ApprovalService } from '../approvals/approval.service';
import { employeeVisibilityFilter, requireEmployeeId } from '../employees/domain/employee-access';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationService } from '../organization/organization.service';
import type { CreateOvertimeDto, DecideOvertimeDto } from './dto/attendance.dto';

/**
 * Default multipliers from the Thai Labour Protection Act:
 *   - Overtime on a normal working day        : 1.5× the hourly rate
 *   - Work on a day off (within normal hours)  : 1× extra
 *   - Work on a public holiday                 : 2× (3× for non-entitled staff)
 *   - Overtime on a holiday                    : 3×
 * Organisations that pay more can override these in `settings.overtime`.
 */
export const DEFAULT_OT_MULTIPLIERS: Record<OvertimeType, number> = {
  [OvertimeType.NORMAL_DAY]: 1.5,
  [OvertimeType.DAY_OFF]: 1,
  [OvertimeType.HOLIDAY]: 2,
  [OvertimeType.HOLIDAY_OVERTIME]: 3,
};

@Injectable()
export class OvertimeService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly outcomes: ApprovalOutcomeRegistry,
    private readonly notifications: NotificationsService,
    private readonly organization: OrganizationService,
    private readonly sequences: SequenceService,
  ) {}

  onModuleInit(): void {
    this.outcomes.register(ApprovalEntityType.OVERTIME_REQUEST, (outcome) =>
      this.onApprovalOutcome(outcome),
    );
  }

  async create(user: AuthenticatedUser, dto: CreateOvertimeDto) {
    const employeeId = requireEmployeeId(user);
    const workDate = toDateOnly(dto.workDate);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (endAt <= startAt) {
      throw new BusinessRuleError('INVALID_OT_INTERVAL', 'Overtime must end after it starts');
    }

    const hours = new Decimal(minutesBetween(startAt, endAt)).dividedBy(60).toDecimalPlaces(2);
    if (hours.greaterThan(12)) {
      throw new BusinessRuleError(
        'OT_TOO_LONG',
        'A single overtime request cannot exceed 12 hours',
      );
    }

    const overlapping = await this.prisma.overtimeRequest.findFirst({
      where: {
        employeeId,
        status: { in: [OvertimeStatus.PENDING, OvertimeStatus.APPROVED] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true, requestNo: true },
    });
    if (overlapping) {
      throw new BusinessRuleError(
        'OVERLAPPING_OVERTIME',
        `This overlaps overtime request ${overlapping.requestNo}`,
      );
    }

    const compensation = await this.prisma.employeeCompensation.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { isOvertimeEligible: true },
    });
    if (compensation && !compensation.isOvertimeEligible) {
      throw new BusinessRuleError(
        'NOT_OVERTIME_ELIGIBLE',
        'This position is not eligible for paid overtime',
      );
    }

    const type =
      dto.type ?? (await this.inferOvertimeType(user.organizationId, employeeId, workDate));
    const multiplier = await this.resolveMultiplier(user.organizationId, type);
    const requestNo = await this.sequences.next(
      user.organizationId,
      'OVERTIME_REQUEST',
      workDate.getUTCFullYear(),
    );

    const request = await this.prisma.overtimeRequest.create({
      data: {
        organizationId: user.organizationId,
        requestNo,
        employeeId,
        workDate,
        startAt,
        endAt,
        requestedHours: toPrismaDecimal(hours),
        type,
        rateMultiplier: new Prisma.Decimal(multiplier),
        reason: dto.reason,
        status: OvertimeStatus.PENDING,
        submittedAt: new Date(),
      },
      include: {
        employee: { select: { firstNameTh: true, lastNameTh: true, departmentId: true } },
      },
    });

    const approval = await this.approvals.start({
      organizationId: user.organizationId,
      entityType: ApprovalEntityType.OVERTIME_REQUEST,
      entityId: request.id,
      submittedByUserId: user.userId,
      subjectEmployeeId: employeeId,
      snapshot: {
        employeeId,
        departmentId: request.employee.departmentId,
        hours: hours.toNumber(),
        type,
        workDate: formatDateOnly(workDate),
      },
      notification: {
        title: 'คำขอทำโอทีรออนุมัติ',
        body: `${request.employee.firstNameTh} ${request.employee.lastNameTh} ขอโอที ${hours.toFixed(1)} ชม. (${formatDateOnly(workDate)})`,
      },
    });

    if (approval.instanceId) {
      await this.prisma.overtimeRequest.update({
        where: { id: request.id },
        data: { approvalInstanceId: approval.instanceId },
      });
    }
    if (approval.autoApproved) {
      await this.applyApproval(request.id, hours);
    }

    return this.findOne(user, request.id);
  }

  async list(
    user: AuthenticatedUser,
    filters: { status?: OvertimeStatus; from?: string; to?: string; employeeId?: string },
  ) {
    return this.prisma.overtimeRequest.findMany({
      where: {
        AND: [
          { organizationId: user.organizationId },
          { employee: employeeVisibilityFilter(user) },
          filters.employeeId ? { employeeId: filters.employeeId } : {},
          filters.status ? { status: filters.status } : {},
          filters.from ? { workDate: { gte: toDateOnly(filters.from) } } : {},
          filters.to ? { workDate: { lte: toDateOnly(filters.to) } } : {},
        ],
      },
      orderBy: { workDate: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstNameTh: true,
            lastNameTh: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: { id, organizationId: user.organizationId, employee: employeeVisibilityFilter(user) },
      include: {
        employee: { select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true } },
      },
    });
    if (!request) throw new NotFoundError('OvertimeRequest', id);

    const approval = request.approvalInstanceId
      ? await this.approvals.getInstanceForEntity(ApprovalEntityType.OVERTIME_REQUEST, id)
      : null;
    return { ...request, approval };
  }

  /** Manager override when no approval policy is configured. */
  async decide(user: AuthenticatedUser, id: string, dto: DecideOvertimeDto) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!request) throw new NotFoundError('OvertimeRequest', id);
    if (request.status !== OvertimeStatus.PENDING) {
      throw new BusinessRuleError(
        'OVERTIME_NOT_PENDING',
        'This overtime request has already been decided',
      );
    }

    if (request.approvalInstanceId) {
      await this.approvals.cancel(request.approvalInstanceId, 'Decided directly');
    }

    if (dto.decision === 'REJECT') {
      await this.prisma.overtimeRequest.update({
        where: { id },
        data: { status: OvertimeStatus.REJECTED, decidedAt: new Date() },
      });
      return this.findOne(user, id);
    }

    const approvedHours = new Decimal(dto.approvedHours ?? Number(request.requestedHours));
    await this.applyApproval(id, approvedHours);
    return this.findOne(user, id);
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const employeeId = requireEmployeeId(user);
    const request = await this.prisma.overtimeRequest.findFirst({
      where: { id, employeeId, organizationId: user.organizationId },
    });
    if (!request) throw new NotFoundError('OvertimeRequest', id);
    if (request.isPaid) {
      throw new BusinessRuleError('OVERTIME_ALREADY_PAID', 'Paid overtime cannot be cancelled');
    }

    if (request.approvalInstanceId) await this.approvals.cancel(request.approvalInstanceId);
    return this.prisma.overtimeRequest.update({
      where: { id },
      data: { status: OvertimeStatus.CANCELLED },
    });
  }

  // ------------------------------------------------------------------ internals

  private async onApprovalOutcome(outcome: ApprovalOutcome): Promise<void> {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id: outcome.entityId },
    });
    if (!request || request.status !== OvertimeStatus.PENDING) return;

    if (outcome.status === ApprovalStatus.APPROVED) {
      await this.applyApproval(request.id, new Decimal(request.requestedHours.toString()));
    } else if (outcome.status === ApprovalStatus.REJECTED) {
      await this.prisma.overtimeRequest.update({
        where: { id: request.id },
        data: { status: OvertimeStatus.REJECTED, decidedAt: new Date() },
      });
      await this.notifyEmployee(
        request.id,
        'overtime.rejected',
        'คำขอโอทีไม่ได้รับการอนุมัติ',
        outcome.comment,
      );
    }
  }

  /**
   * Approving overtime also writes the approved minutes onto the day's
   * attendance record, which is what payroll reads. Payable overtime is always
   * the *approved* figure, never the raw clock time.
   */
  private async applyApproval(requestId: string, approvedHours: Decimal): Promise<void> {
    const request = await this.prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        status: OvertimeStatus.APPROVED,
        approvedHours: toPrismaDecimal(approvedHours),
        decidedAt: new Date(),
      },
    });

    await this.prisma.attendanceRecord.updateMany({
      where: { employeeId: request.employeeId, workDate: request.workDate },
      data: { approvedOvertimeMinutes: Math.round(approvedHours.times(60).toNumber()) },
    });

    await this.notifyEmployee(
      requestId,
      'overtime.approved',
      'คำขอโอทีได้รับการอนุมัติ',
      `${approvedHours.toFixed(1)} ชั่วโมง`,
    );
  }

  private async notifyEmployee(
    requestId: string,
    type: string,
    title: string,
    body?: string,
  ): Promise<void> {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { userId: true, organizationId: true } } },
    });
    if (!request?.employee.userId) return;

    await this.notifications.notify(request.employee.organizationId, request.employee.userId, {
      type,
      title,
      body: body ?? `${formatDateOnly(request.workDate)}`,
      data: { overtimeRequestId: requestId },
    });
  }

  /** Picks the statutory category from the calendar and the employee's roster. */
  private async inferOvertimeType(
    organizationId: string,
    employeeId: string,
    workDate: Date,
  ): Promise<OvertimeType> {
    const holidays = await this.organization.holidayDateSet(organizationId, workDate, workDate);
    if (holidays.has(formatDateOnly(workDate))) return OvertimeType.HOLIDAY;

    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { schedule: { select: { workingDays: true } } },
    });

    const workingDays = assignment?.schedule.workingDays ?? [1, 2, 3, 4, 5];
    return workingDays.includes(isoWeekday(workDate))
      ? OvertimeType.NORMAL_DAY
      : OvertimeType.DAY_OFF;
  }

  private async resolveMultiplier(organizationId: string, type: OvertimeType): Promise<number> {
    const organization = await this.organization.getOrganization(organizationId);
    const overrides = (organization.settings as { overtime?: Record<string, number> } | null)
      ?.overtime;
    return overrides?.[type] ?? DEFAULT_OT_MULTIPLIERS[type];
  }
}
