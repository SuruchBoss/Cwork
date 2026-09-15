import { Injectable, Logger } from '@nestjs/common';
import {
  ApprovalEntityType,
  ApprovalStatus,
  ApprovalTaskStatus,
  ApproverType,
  Prisma,
} from '@prisma/client';
import { BusinessRuleError, ErrorCode, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalOutcomeRegistry } from './approval-outcome.registry';
import { matchesConditions, type PolicyConditions } from './domain/policy-matcher';

export interface StartApprovalInput {
  organizationId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  submittedByUserId: string;
  /** The employee the request is *about* — used to walk the reporting chain. */
  subjectEmployeeId: string | null;
  /** Values the policy conditions are evaluated against. */
  snapshot: Record<string, unknown>;
  notification?: { title: string; body: string };
}

export interface StartApprovalResult {
  instanceId: string | null;
  status: ApprovalStatus;
  /** True when no approver was required and the entity is already approved. */
  autoApproved: boolean;
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outcomes: ApprovalOutcomeRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Creates an approval instance and the first step's tasks.
   *
   * If no policy matches, or every resolved approver is the submitter, the
   * request is auto-approved: an approval chain that resolves to nobody must not
   * silently park a request in limbo.
   */
  async start(input: StartApprovalInput): Promise<StartApprovalResult> {
    const policy = await this.findMatchingPolicy(input);

    if (!policy || policy.steps.length === 0) {
      this.logger.debug(
        `No approval policy for ${input.entityType}; auto-approving ${input.entityId}`,
      );
      return { instanceId: null, status: ApprovalStatus.APPROVED, autoApproved: true };
    }

    const instance = await this.prisma.approvalInstance.create({
      data: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        policyId: policy.id,
        submittedById: input.submittedByUserId,
        currentStep: 0,
        snapshot: input.snapshot as Prisma.InputJsonValue,
      },
    });

    const advanced = await this.openStepsFrom(instance.id, 0, input);
    if (advanced.completed) {
      await this.complete(instance.id, ApprovalStatus.APPROVED);
      return { instanceId: instance.id, status: ApprovalStatus.APPROVED, autoApproved: true };
    }

    return { instanceId: instance.id, status: ApprovalStatus.PENDING, autoApproved: false };
  }

  /** Records one approver's decision and advances or terminates the instance. */
  async decide(
    taskId: string,
    userId: string,
    decision: 'APPROVE' | 'REJECT',
    comment?: string,
  ): Promise<{ instanceStatus: ApprovalStatus }> {
    const task = await this.prisma.approvalTask.findUnique({
      where: { id: taskId },
      include: { instance: { include: { policy: { include: { steps: true } } } } },
    });

    if (!task) throw new NotFoundError('ApprovalTask', taskId);
    if (task.approverUserId !== userId && task.delegatedToId !== userId) {
      throw new BusinessRuleError('NOT_YOUR_APPROVAL', 'This approval is assigned to someone else');
    }
    if (task.status !== ApprovalTaskStatus.PENDING) {
      throw new BusinessRuleError(
        ErrorCode.APPROVAL_NOT_PENDING,
        'This approval has already been decided',
      );
    }
    if (task.instance.status !== ApprovalStatus.PENDING) {
      throw new BusinessRuleError(
        ErrorCode.APPROVAL_NOT_PENDING,
        'This request is no longer pending',
      );
    }

    await this.prisma.approvalTask.update({
      where: { id: task.id },
      data: {
        status: decision === 'APPROVE' ? ApprovalTaskStatus.APPROVED : ApprovalTaskStatus.REJECTED,
        decidedAt: new Date(),
        comment,
      },
    });

    if (decision === 'REJECT') {
      // One rejection ends the whole chain — later approvers never see it.
      await this.prisma.approvalTask.updateMany({
        where: { instanceId: task.instanceId, status: ApprovalTaskStatus.PENDING },
        data: { status: ApprovalTaskStatus.SKIPPED },
      });
      await this.complete(task.instanceId, ApprovalStatus.REJECTED, userId, comment);
      return { instanceStatus: ApprovalStatus.REJECTED };
    }

    const step = task.instance.policy?.steps.find((s) => s.orderIndex === task.stepIndex);
    const siblings = await this.prisma.approvalTask.findMany({
      where: { instanceId: task.instanceId, stepIndex: task.stepIndex },
    });

    const stepSatisfied = step?.anyOf
      ? siblings.some((t) => t.status === ApprovalTaskStatus.APPROVED)
      : siblings.every((t) => t.status === ApprovalTaskStatus.APPROVED);

    if (!stepSatisfied) return { instanceStatus: ApprovalStatus.PENDING };

    if (step?.anyOf) {
      await this.prisma.approvalTask.updateMany({
        where: {
          instanceId: task.instanceId,
          stepIndex: task.stepIndex,
          status: ApprovalTaskStatus.PENDING,
        },
        data: { status: ApprovalTaskStatus.SKIPPED },
      });
    }

    const subjectEmployeeId = (task.instance.snapshot as Record<string, unknown>)?.employeeId as
      string | undefined;

    const advanced = await this.openStepsFrom(task.instanceId, task.stepIndex + 1, {
      organizationId: task.instance.organizationId,
      entityType: task.instance.entityType,
      entityId: task.instance.entityId,
      submittedByUserId: task.instance.submittedById,
      subjectEmployeeId: subjectEmployeeId ?? null,
      snapshot: task.instance.snapshot as Record<string, unknown>,
    });

    if (advanced.completed) {
      await this.complete(task.instanceId, ApprovalStatus.APPROVED, userId, comment);
      return { instanceStatus: ApprovalStatus.APPROVED };
    }

    await this.prisma.approvalInstance.update({
      where: { id: task.instanceId },
      data: { currentStep: advanced.stepIndex },
    });
    return { instanceStatus: ApprovalStatus.PENDING };
  }

  /** Withdraws a pending approval (the submitter cancelled the request). */
  async cancel(instanceId: string, reason = 'Cancelled by submitter'): Promise<void> {
    const instance = await this.prisma.approvalInstance.findUnique({ where: { id: instanceId } });
    if (!instance || instance.status !== ApprovalStatus.PENDING) return;

    await this.prisma.$transaction([
      this.prisma.approvalTask.updateMany({
        where: { instanceId, status: ApprovalTaskStatus.PENDING },
        data: { status: ApprovalTaskStatus.SKIPPED, comment: reason },
      }),
      this.prisma.approvalInstance.update({
        where: { id: instanceId },
        data: { status: ApprovalStatus.CANCELLED, completedAt: new Date() },
      }),
    ]);
  }

  /** Approval tasks waiting on this user, newest first. */
  async listMyTasks(userId: string, status: ApprovalTaskStatus = ApprovalTaskStatus.PENDING) {
    return this.prisma.approvalTask.findMany({
      where: {
        status,
        OR: [{ approverUserId: userId }, { delegatedToId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        instance: {
          select: {
            id: true,
            entityType: true,
            entityId: true,
            snapshot: true,
            submittedAt: true,
            submittedBy: {
              select: {
                id: true,
                email: true,
                employee: { select: { firstNameTh: true, lastNameTh: true, employeeCode: true } },
              },
            },
          },
        },
      },
    });
  }

  async getInstanceForEntity(entityType: ApprovalEntityType, entityId: string) {
    return this.prisma.approvalInstance.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
      include: {
        tasks: {
          orderBy: [{ stepIndex: 'asc' }, { createdAt: 'asc' }],
          include: {
            approver: {
              select: {
                id: true,
                email: true,
                employee: { select: { firstNameTh: true, lastNameTh: true } },
              },
            },
          },
        },
      },
    });
  }

  // ------------------------------------------------------------------ internals

  private async findMatchingPolicy(input: StartApprovalInput) {
    const policies = await this.prisma.approvalPolicy.findMany({
      where: { organizationId: input.organizationId, entityType: input.entityType, isActive: true },
      orderBy: { priority: 'desc' },
      include: { steps: { orderBy: { orderIndex: 'asc' } } },
    });
    return policies.find((p) =>
      matchesConditions(p.conditions as PolicyConditions, input.snapshot),
    );
  }

  /**
   * Opens the first step at or after `fromIndex` that resolves to at least one
   * approver. Steps whose approvers cannot be resolved (vacant manager slot) or
   * that resolve only to the submitter are skipped rather than blocking.
   */
  private async openStepsFrom(
    instanceId: string,
    fromIndex: number,
    input: Omit<StartApprovalInput, 'notification'> & {
      notification?: StartApprovalInput['notification'];
    },
  ): Promise<{ completed: boolean; stepIndex: number }> {
    const instance = await this.prisma.approvalInstance.findUniqueOrThrow({
      where: { id: instanceId },
      include: { policy: { include: { steps: { orderBy: { orderIndex: 'asc' } } } } },
    });
    const steps = instance.policy?.steps ?? [];

    for (const step of steps) {
      if (step.orderIndex < fromIndex) continue;

      const approverIds = await this.resolveApprovers(step, input);
      const eligible = step.skipIfSelf
        ? approverIds.filter((id) => id !== input.submittedByUserId)
        : approverIds;

      if (eligible.length === 0) {
        if (step.isOptional || approverIds.length === 0) continue;
        continue;
      }

      const dueAt = step.slaHours ? new Date(Date.now() + step.slaHours * 3_600_000) : null;
      await this.prisma.approvalTask.createMany({
        data: eligible.map((approverUserId) => ({
          instanceId,
          stepIndex: step.orderIndex,
          approverUserId,
          dueAt,
        })),
        skipDuplicates: true,
      });

      if (input.notification) {
        await this.notifications.notifyMany(input.organizationId, eligible, {
          type: `approval.${input.entityType.toLowerCase()}.pending`,
          title: input.notification.title,
          body: input.notification.body,
          data: { entityType: input.entityType, entityId: input.entityId, instanceId },
        });
      }

      return { completed: false, stepIndex: step.orderIndex };
    }

    return { completed: true, stepIndex: steps.length };
  }

  private async resolveApprovers(
    step: {
      approverType: ApproverType;
      levelsUp: number;
      roleId: string | null;
      specificUserId: string | null;
    },
    input: Pick<StartApprovalInput, 'organizationId' | 'subjectEmployeeId'>,
  ): Promise<string[]> {
    switch (step.approverType) {
      case ApproverType.SPECIFIC_USER:
        return step.specificUserId ? [step.specificUserId] : [];

      case ApproverType.ROLE: {
        if (!step.roleId) return [];
        const grants = await this.prisma.userRole.findMany({
          where: {
            roleId: step.roleId,
            user: { organizationId: input.organizationId, status: 'ACTIVE', deletedAt: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { userId: true },
        });
        return [...new Set(grants.map((g) => g.userId))];
      }

      case ApproverType.DEPARTMENT_HEAD: {
        if (!input.subjectEmployeeId) return [];
        const employee = await this.prisma.employee.findUnique({
          where: { id: input.subjectEmployeeId },
          select: { department: { select: { head: { select: { userId: true } } } } },
        });
        const userId = employee?.department?.head?.userId;
        return userId ? [userId] : [];
      }

      case ApproverType.LINE_MANAGER:
      default: {
        if (!input.subjectEmployeeId) return [];
        let cursor: string | null = input.subjectEmployeeId;
        for (let level = 0; level < Math.max(1, step.levelsUp); level += 1) {
          const employee: { managerId: string | null } | null =
            await this.prisma.employee.findUnique({
              where: { id: cursor },
              select: { managerId: true },
            });
          cursor = employee?.managerId ?? null;
          if (!cursor) return [];
        }
        const manager = await this.prisma.employee.findUnique({
          where: { id: cursor },
          select: { userId: true },
        });
        return manager?.userId ? [manager.userId] : [];
      }
    }
  }

  private async complete(
    instanceId: string,
    status: ApprovalStatus,
    decidedByUserId?: string,
    comment?: string,
  ): Promise<void> {
    const instance = await this.prisma.approvalInstance.update({
      where: { id: instanceId },
      data: { status, completedAt: new Date() },
    });

    await this.outcomes.dispatch({
      instanceId,
      organizationId: instance.organizationId,
      entityType: instance.entityType,
      entityId: instance.entityId,
      status,
      decidedByUserId,
      comment,
    });
  }
}
