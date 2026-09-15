import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ApprovalEntityType,
  ApprovalStatus,
  EmployeeStatus,
  EmploymentEventType,
  Prisma,
  ResignationStatus,
  UserStatus,
} from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { toDateOnly } from '../../core/utils/date.util';
import {
  ApprovalOutcomeRegistry,
  type ApprovalOutcome,
} from '../approvals/approval-outcome.registry';
import { ApprovalService } from '../approvals/approval.service';
import { NotificationsService } from '../notifications/notifications.service';
import { requireEmployeeId } from '../../core/security/employee-access';
import type {
  CreateOffboardingTaskDto,
  CreateResignationDto,
  DecideResignationDto,
} from './dto/employee.dto';

/** Default clearance checklist created with every resignation. */
const DEFAULT_CLEARANCE_TASKS: Array<{ title: string; category: string }> = [
  { title: 'คืนคอมพิวเตอร์และอุปกรณ์ไอที', category: 'IT' },
  { title: 'ปิดสิทธิ์การเข้าถึงระบบและอีเมล', category: 'IT' },
  { title: 'คืนบัตรพนักงานและกุญแจ', category: 'ADMIN' },
  { title: 'ส่งมอบงานให้ผู้รับผิดชอบแทน', category: 'MANAGER' },
  { title: 'เคลียร์เงินยืมทดรองและค่าใช้จ่ายค้างเบิก', category: 'FINANCE' },
  { title: 'สรุปวันลาคงเหลือและคำนวณเงินชดเชย', category: 'HR' },
  { title: 'สัมภาษณ์พนักงานลาออก (Exit interview)', category: 'HR' },
];

@Injectable()
export class OffboardingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly outcomes: ApprovalOutcomeRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.outcomes.register(ApprovalEntityType.RESIGNATION, (outcome) =>
      this.onApprovalOutcome(outcome),
    );
  }

  /** An employee files their own resignation; HR/managers approve it. */
  async submitResignation(user: AuthenticatedUser, dto: CreateResignationDto) {
    const employeeId = requireEmployeeId(user);

    const open = await this.prisma.resignationRequest.findFirst({
      where: { employeeId, status: { in: [ResignationStatus.DRAFT, ResignationStatus.PENDING] } },
      select: { id: true },
    });
    if (open) {
      throw new BusinessRuleError(
        'RESIGNATION_ALREADY_PENDING',
        'You already have a resignation in progress',
      );
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { hireDate: true, firstNameTh: true, lastNameTh: true, employeeCode: true },
    });

    const lastWorkingDate = toDateOnly(dto.requestedLastWorkingDate);
    if (lastWorkingDate <= toDateOnly(new Date())) {
      throw new BusinessRuleError(
        'INVALID_LAST_WORKING_DATE',
        'The final working day must be in the future',
      );
    }

    const noticeDays = Math.round(
      (lastWorkingDate.getTime() - toDateOnly(new Date()).getTime()) / 86_400_000,
    );

    const resignation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.resignationRequest.create({
        data: {
          employeeId,
          separationType: dto.separationType,
          requestedLastWorkingDate: lastWorkingDate,
          noticeDays,
          reasonCategory: dto.reasonCategory,
          reason: dto.reason,
          status: ResignationStatus.PENDING,
        },
      });

      await tx.offboardingTask.createMany({
        data: DEFAULT_CLEARANCE_TASKS.map((task, index) => ({
          resignationId: created.id,
          title: task.title,
          category: task.category,
          dueDate: lastWorkingDate,
          orderIndex: index,
        })),
      });

      return created;
    });

    const approval = await this.approvals.start({
      organizationId: user.organizationId,
      entityType: ApprovalEntityType.RESIGNATION,
      entityId: resignation.id,
      submittedByUserId: user.userId,
      subjectEmployeeId: employeeId,
      snapshot: {
        employeeId,
        noticeDays,
        separationType: resignation.separationType,
        lastWorkingDate: dto.requestedLastWorkingDate,
      },
      notification: {
        title: 'คำขอลาออกรออนุมัติ',
        body: `${employee.firstNameTh} ${employee.lastNameTh} (${employee.employeeCode}) ยื่นลาออก มีผล ${dto.requestedLastWorkingDate}`,
      },
    });

    if (approval.instanceId) {
      await this.prisma.resignationRequest.update({
        where: { id: resignation.id },
        data: { approvalInstanceId: approval.instanceId },
      });
    }
    if (approval.autoApproved) {
      await this.applyApproval(resignation.id, lastWorkingDate);
    }

    return this.getResignation(user.organizationId, resignation.id);
  }

  async listResignations(organizationId: string, status?: ResignationStatus) {
    return this.prisma.resignationRequest.findMany({
      where: { employee: { organizationId }, ...(status ? { status } : {}) },
      orderBy: { submittedAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstNameTh: true,
            lastNameTh: true,
            department: { select: { name: true } },
            position: { select: { title: true } },
          },
        },
        _count: { select: { tasks: true } },
      },
    });
  }

  async getResignation(organizationId: string, id: string) {
    const resignation = await this.prisma.resignationRequest.findFirst({
      where: { id, employee: { organizationId } },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstNameTh: true,
            lastNameTh: true,
            hireDate: true,
            department: { select: { name: true } },
            position: { select: { title: true } },
          },
        },
        tasks: { orderBy: { orderIndex: 'asc' } },
        exitInterview: true,
      },
    });
    if (!resignation) throw new NotFoundError('ResignationRequest', id);
    return resignation;
  }

  /** HR override path — used when there is no approval policy configured. */
  async decideResignation(user: AuthenticatedUser, id: string, dto: DecideResignationDto) {
    const resignation = await this.prisma.resignationRequest.findFirst({
      where: { id, employee: { organizationId: user.organizationId } },
    });
    if (!resignation) throw new NotFoundError('ResignationRequest', id);
    if (resignation.status !== ResignationStatus.PENDING) {
      throw new BusinessRuleError(
        'RESIGNATION_NOT_PENDING',
        'This resignation has already been decided',
      );
    }

    if (dto.decision === 'REJECT') {
      if (resignation.approvalInstanceId)
        await this.approvals.cancel(resignation.approvalInstanceId);
      await this.prisma.resignationRequest.update({
        where: { id },
        data: {
          status: ResignationStatus.REJECTED,
          decidedAt: new Date(),
          decidedById: user.userId,
          decisionNote: dto.note,
        },
      });
      return this.getResignation(user.organizationId, id);
    }

    const lastWorkingDate = dto.agreedLastWorkingDate
      ? toDateOnly(dto.agreedLastWorkingDate)
      : resignation.requestedLastWorkingDate;

    if (resignation.approvalInstanceId)
      await this.approvals.cancel(resignation.approvalInstanceId, 'Decided by HR');
    await this.applyApproval(id, lastWorkingDate, user.userId, dto.note);
    return this.getResignation(user.organizationId, id);
  }

  async addTask(organizationId: string, resignationId: string, dto: CreateOffboardingTaskDto) {
    await this.getResignation(organizationId, resignationId);
    return this.prisma.offboardingTask.create({
      data: {
        resignationId,
        title: dto.title,
        category: dto.category,
        assigneeEmployeeId: dto.assigneeEmployeeId,
        dueDate: dto.dueDate ? toDateOnly(dto.dueDate) : null,
        orderIndex: dto.orderIndex ?? 0,
      },
    });
  }

  async completeTask(organizationId: string, taskId: string, note?: string) {
    const task = await this.prisma.offboardingTask.findFirst({
      where: { id: taskId, resignation: { employee: { organizationId } } },
    });
    if (!task) throw new NotFoundError('OffboardingTask', taskId);

    return this.prisma.offboardingTask.update({
      where: { id: taskId },
      data: { status: 'DONE', completedAt: new Date(), note },
    });
  }

  async saveExitInterview(
    user: AuthenticatedUser,
    resignationId: string,
    payload: {
      responses: Record<string, unknown>;
      overallSatisfaction?: number;
      wouldRecommend?: boolean;
      wouldRehire?: boolean;
      summary?: string;
    },
  ) {
    const resignation = await this.getResignation(user.organizationId, resignationId);

    return this.prisma.exitInterview.upsert({
      where: { resignationId },
      create: {
        resignationId,
        employeeId: resignation.employeeId,
        conductedById: user.userId,
        conductedAt: new Date(),
        responses: payload.responses as Prisma.InputJsonValue,
        overallSatisfaction: payload.overallSatisfaction,
        wouldRecommend: payload.wouldRecommend,
        wouldRehire: payload.wouldRehire,
        summary: payload.summary,
      },
      update: {
        conductedById: user.userId,
        conductedAt: new Date(),
        responses: payload.responses as Prisma.InputJsonValue,
        overallSatisfaction: payload.overallSatisfaction,
        wouldRecommend: payload.wouldRecommend,
        wouldRehire: payload.wouldRehire,
        summary: payload.summary,
      },
    });
  }

  // ------------------------------------------------------------------ internals

  private async onApprovalOutcome(outcome: ApprovalOutcome): Promise<void> {
    const resignation = await this.prisma.resignationRequest.findUnique({
      where: { id: outcome.entityId },
    });
    if (!resignation) return;

    if (outcome.status === ApprovalStatus.APPROVED) {
      await this.applyApproval(
        resignation.id,
        resignation.agreedLastWorkingDate ?? resignation.requestedLastWorkingDate,
        outcome.decidedByUserId,
        outcome.comment,
      );
    } else if (outcome.status === ApprovalStatus.REJECTED) {
      await this.prisma.resignationRequest.update({
        where: { id: resignation.id },
        data: {
          status: ResignationStatus.REJECTED,
          decidedAt: new Date(),
          decidedById: outcome.decidedByUserId,
          decisionNote: outcome.comment,
        },
      });
    }
  }

  /**
   * Approving a resignation does not end employment immediately — it schedules
   * it. `SeparationScheduler` flips the employee to RESIGNED on the final day,
   * so they keep app access (and get paid) until then.
   */
  private async applyApproval(
    resignationId: string,
    lastWorkingDate: Date,
    decidedById?: string,
    note?: string,
  ): Promise<void> {
    // One transaction for all four writes. Three of them were already a set
    // that has to hold together — a resignation approved without the leaving
    // date on the employee, or without the employment event, is a record that
    // contradicts itself — and the fourth, telling the person, belongs with
    // them for the same reason.
    await this.prisma.$transaction(async (tx) => {
      const resignation = await tx.resignationRequest.update({
        where: { id: resignationId },
        data: {
          status: ResignationStatus.APPROVED,
          agreedLastWorkingDate: lastWorkingDate,
          decidedAt: new Date(),
          decidedById,
          decisionNote: note,
        },
        include: { employee: { select: { id: true, userId: true, organizationId: true } } },
      });

      await tx.employee.update({
        where: { id: resignation.employeeId },
        data: {
          resignationDate: toDateOnly(new Date()),
          lastWorkingDate,
        },
      });

      await tx.employmentEvent.create({
        data: {
          employeeId: resignation.employeeId,
          type: EmploymentEventType.RESIGNATION,
          effectiveDate: lastWorkingDate,
          newValue: {
            lastWorkingDate: lastWorkingDate.toISOString().slice(0, 10),
          } as Prisma.InputJsonValue,
          reason: resignation.reasonCategory ?? undefined,
          recordedById: decidedById,
        },
      });

      if (resignation.employee.userId) {
        await this.notifications.notifyIn(
          tx,
          resignation.employee.organizationId,
          resignation.employee.userId,
          {
            type: 'resignation.approved',
            title: 'คำขอลาออกได้รับการอนุมัติ',
            body: `วันทำงานสุดท้ายของคุณคือ ${lastWorkingDate.toISOString().slice(0, 10)}`,
            data: { resignationId },
          },
        );
      }
    });
  }

  /**
   * Called daily: closes out anyone whose final working day has passed.
   * Idempotent, so a missed run simply catches up the next day.
   */
  async finaliseDueSeparations(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.resignationRequest.findMany({
      where: {
        status: ResignationStatus.APPROVED,
        agreedLastWorkingDate: { lt: toDateOnly(now) },
        employee: { status: { notIn: [EmployeeStatus.RESIGNED, EmployeeStatus.TERMINATED] } },
      },
      include: { employee: { select: { id: true, userId: true } } },
    });

    for (const resignation of due) {
      await this.prisma.$transaction([
        this.prisma.employee.update({
          where: { id: resignation.employeeId },
          data: { status: EmployeeStatus.RESIGNED },
        }),
        this.prisma.resignationRequest.update({
          where: { id: resignation.id },
          data: { status: ResignationStatus.COMPLETED },
        }),
        ...(resignation.employee.userId
          ? [
              this.prisma.user.update({
                where: { id: resignation.employee.userId },
                data: { status: UserStatus.DISABLED, sessionsValidFrom: new Date() },
              }),
              this.prisma.session.updateMany({
                where: { userId: resignation.employee.userId, revokedAt: null },
                data: { revokedAt: new Date(), revokedReason: 'EMPLOYMENT_ENDED' },
              }),
            ]
          : []),
      ]);
    }

    return due.length;
  }
}
