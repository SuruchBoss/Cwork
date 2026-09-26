// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ApprovalEntityType,
  ApprovalStatus,
  ExpenseCategory,
  ExpenseClaimStatus,
  Prisma,
} from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { Permission } from '../../core/security/permissions';
import { toDateOnly } from '../../core/utils/date.util';
import { Decimal, round2, toPrismaDecimal } from '../../core/utils/money.util';
import { SequenceService } from '../../core/utils/sequence.service';
import {
  ApprovalOutcomeRegistry,
  type ApprovalOutcome,
} from '../approvals/approval-outcome.registry';
import { ApprovalService } from '../approvals/approval.service';
import { employeeVisibilityFilter, requireEmployeeId } from '../../core/security/employee-access';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateExpenseClaimDto, DecideExpenseClaimDto } from './dto/payroll.dto';

@Injectable()
export class ExpensesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly outcomes: ApprovalOutcomeRegistry,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
  ) {}

  onModuleInit(): void {
    this.outcomes.register(ApprovalEntityType.EXPENSE_CLAIM, (outcome) =>
      this.onApprovalOutcome(outcome),
    );
  }

  async create(user: AuthenticatedUser, dto: CreateExpenseClaimDto) {
    const employeeId = requireEmployeeId(user);

    if (dto.items.length === 0) {
      throw new BusinessRuleError('NO_CLAIM_ITEMS', 'A claim must contain at least one line item');
    }

    const total = round2(dto.items.reduce((acc, item) => acc.plus(item.amount), new Decimal(0)));
    if (total.lessThanOrEqualTo(0)) {
      throw new BusinessRuleError(
        'INVALID_CLAIM_TOTAL',
        'The claim total must be greater than zero',
      );
    }

    if (dto.benefitPlanId) {
      await this.assertWithinBenefitLimit(employeeId, dto.benefitPlanId, total);
    }

    const claimNo = await this.sequences.next(user.organizationId, 'EXPENSE_CLAIM');
    const isDraft = dto.saveAsDraft === true;

    const claim = await this.prisma.expenseClaim.create({
      data: {
        organizationId: user.organizationId,
        claimNo,
        employeeId,
        title: dto.title,
        category: dto.category ?? inferCategory(dto.items),
        totalAmount: toPrismaDecimal(total),
        benefitPlanId: dto.benefitPlanId,
        paymentMethod: dto.paymentMethod,
        status: isDraft ? ExpenseClaimStatus.DRAFT : ExpenseClaimStatus.PENDING,
        submittedAt: isDraft ? null : new Date(),
        items: {
          create: dto.items.map((item) => ({
            expenseDate: toDateOnly(item.expenseDate),
            category: item.category,
            description: item.description,
            amount: new Prisma.Decimal(item.amount),
            taxAmount: new Prisma.Decimal(item.taxAmount ?? 0),
            vendor: item.vendor,
            taxInvoiceNo: item.taxInvoiceNo,
            receiptFileId: item.receiptFileId,
          })),
        },
      },
      include: {
        employee: { select: { firstNameTh: true, lastNameTh: true, departmentId: true } },
      },
    });

    if (!isDraft) {
      const approval = await this.approvals.start({
        organizationId: user.organizationId,
        entityType: ApprovalEntityType.EXPENSE_CLAIM,
        entityId: claim.id,
        submittedByUserId: user.userId,
        subjectEmployeeId: employeeId,
        snapshot: {
          employeeId,
          departmentId: claim.employee.departmentId,
          totalAmount: total.toNumber(),
          category: claim.category,
        },
        notification: {
          title: 'คำขอเบิกค่าใช้จ่ายรออนุมัติ',
          body: `${claim.employee.firstNameTh} ${claim.employee.lastNameTh} ขอเบิก ${total.toFixed(2)} บาท (${claim.title})`,
        },
      });

      if (approval.instanceId) {
        await this.prisma.expenseClaim.update({
          where: { id: claim.id },
          data: { approvalInstanceId: approval.instanceId },
        });
      }
      if (approval.autoApproved) {
        await this.applyApproval(claim.id, total);
      }
    }

    return this.findOne(user, claim.id);
  }

  async list(
    user: AuthenticatedUser,
    filters: { status?: ExpenseClaimStatus; employeeId?: string; from?: string; to?: string },
  ) {
    return this.prisma.expenseClaim.findMany({
      where: {
        AND: [
          { organizationId: user.organizationId },
          { employee: employeeVisibilityFilter(user) },
          filters.employeeId ? { employeeId: filters.employeeId } : {},
          filters.status ? { status: filters.status } : {},
          filters.from ? { createdAt: { gte: new Date(filters.from) } } : {},
          filters.to ? { createdAt: { lte: new Date(filters.to) } } : {},
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true } },
        _count: { select: { items: true } },
      },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: { id, organizationId: user.organizationId, employee: employeeVisibilityFilter(user) },
      include: {
        items: { orderBy: { expenseDate: 'asc' } },
        employee: { select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true } },
      },
    });
    if (!claim) throw new NotFoundError('ExpenseClaim', id);

    const approval = claim.approvalInstanceId
      ? await this.approvals.getInstanceForEntity(ApprovalEntityType.EXPENSE_CLAIM, id)
      : null;
    return { ...claim, approval };
  }

  async decide(user: AuthenticatedUser, id: string, dto: DecideExpenseClaimDto) {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!claim) throw new NotFoundError('ExpenseClaim', id);
    if (claim.status !== ExpenseClaimStatus.PENDING) {
      throw new BusinessRuleError('CLAIM_NOT_PENDING', 'This claim has already been decided');
    }

    if (claim.approvalInstanceId) {
      await this.approvals.cancel(claim.approvalInstanceId, 'Decided directly');
    }

    if (dto.decision === 'REJECT') {
      await this.prisma.$transaction(async (tx) => {
        await tx.expenseClaim.update({
          where: { id },
          data: {
            status: ExpenseClaimStatus.REJECTED,
            decidedAt: new Date(),
            rejectReason: dto.note,
          },
        });
        await this.notifyEmployee(
          tx,
          id,
          'expense.rejected',
          'คำขอเบิกไม่ได้รับการอนุมัติ',
          dto.note,
        );
      });
      return this.findOne(user, id);
    }

    const approved = new Decimal(dto.approvedAmount ?? Number(claim.totalAmount));
    if (approved.greaterThan(claim.totalAmount.toString())) {
      throw new BusinessRuleError(
        'APPROVED_EXCEEDS_CLAIM',
        'The approved amount cannot exceed the claimed amount',
      );
    }

    await this.applyApproval(id, approved);
    return this.findOne(user, id);
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const employeeId = requireEmployeeId(user);
    const claim = await this.prisma.expenseClaim.findFirst({
      where: { id, employeeId, organizationId: user.organizationId },
    });
    if (!claim) throw new NotFoundError('ExpenseClaim', id);
    const settled: ExpenseClaimStatus[] = [ExpenseClaimStatus.PAID, ExpenseClaimStatus.SCHEDULED];
    if (settled.includes(claim.status)) {
      throw new BusinessRuleError(
        'CLAIM_ALREADY_PAID',
        'A paid or scheduled claim cannot be cancelled',
      );
    }

    if (claim.approvalInstanceId) await this.approvals.cancel(claim.approvalInstanceId);
    return this.prisma.expenseClaim.update({
      where: { id },
      data: { status: ExpenseClaimStatus.CANCELLED },
    });
  }

  /** Spend against a benefit's annual limit, for the benefits dashboard. */
  async benefitUsage(organizationId: string, employeeId: string, year: number) {
    const enrollments = await this.prisma.benefitEnrollment.findMany({
      where: { employeeId, employee: { organizationId }, status: 'ACTIVE' },
      include: { plan: true },
    });

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));

    return Promise.all(
      enrollments.map(async (enrollment) => {
        const used = await this.prisma.expenseClaim.aggregate({
          where: {
            employeeId,
            benefitPlanId: enrollment.planId,
            status: {
              in: [
                ExpenseClaimStatus.APPROVED,
                ExpenseClaimStatus.SCHEDULED,
                ExpenseClaimStatus.PAID,
              ],
            },
            createdAt: { gte: yearStart, lte: yearEnd },
          },
          _sum: { approvedAmount: true },
        });

        const usedAmount = Number(used._sum.approvedAmount ?? 0);
        const limit = enrollment.plan.annualLimit ? Number(enrollment.plan.annualLimit) : null;

        return {
          planId: enrollment.planId,
          code: enrollment.plan.code,
          name: enrollment.plan.name,
          category: enrollment.plan.category,
          annualLimit: limit,
          used: usedAmount,
          remaining: limit !== null ? Math.max(0, limit - usedAmount) : null,
        };
      }),
    );
  }

  // ------------------------------------------------------------------ internals

  private async onApprovalOutcome(outcome: ApprovalOutcome): Promise<void> {
    const claim = await this.prisma.expenseClaim.findUnique({ where: { id: outcome.entityId } });
    if (!claim || claim.status !== ExpenseClaimStatus.PENDING) return;

    if (outcome.status === ApprovalStatus.APPROVED) {
      await this.applyApproval(claim.id, new Decimal(claim.totalAmount.toString()));
    } else if (outcome.status === ApprovalStatus.REJECTED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.expenseClaim.update({
          where: { id: claim.id },
          data: {
            status: ExpenseClaimStatus.REJECTED,
            decidedAt: new Date(),
            rejectReason: outcome.comment,
          },
        });
        await this.notifyEmployee(
          tx,
          claim.id,
          'expense.rejected',
          'คำขอเบิกไม่ได้รับการอนุมัติ',
          outcome.comment,
        );
      });
    }
  }

  private async applyApproval(claimId: string, approvedAmount: Decimal): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.expenseClaim.update({
        where: { id: claimId },
        data: {
          status: ExpenseClaimStatus.APPROVED,
          approvedAmount: toPrismaDecimal(approvedAmount),
          decidedAt: new Date(),
        },
      });

      await this.notifyEmployee(
        tx,
        claimId,
        'expense.approved',
        'คำขอเบิกได้รับการอนุมัติ',
        `จำนวน ${approvedAmount.toFixed(2)} บาท จะจ่ายพร้อมเงินเดือนงวดถัดไป`,
      );
    });
  }

  private async assertWithinBenefitLimit(
    employeeId: string,
    benefitPlanId: string,
    amount: Decimal,
  ): Promise<void> {
    const plan = await this.prisma.benefitPlan.findUnique({ where: { id: benefitPlanId } });
    if (!plan?.annualLimit) return;

    const year = new Date().getUTCFullYear();
    const used = await this.prisma.expenseClaim.aggregate({
      where: {
        employeeId,
        benefitPlanId,
        status: {
          in: [ExpenseClaimStatus.PENDING, ExpenseClaimStatus.APPROVED, ExpenseClaimStatus.PAID],
        },
        createdAt: { gte: new Date(Date.UTC(year, 0, 1)) },
      },
      _sum: { totalAmount: true },
    });

    const usedAmount = new Decimal((used._sum.totalAmount ?? 0).toString());
    const limit = new Decimal(plan.annualLimit.toString());

    if (usedAmount.plus(amount).greaterThan(limit)) {
      throw new BusinessRuleError(
        'BENEFIT_LIMIT_EXCEEDED',
        `This exceeds the annual limit for ${plan.name}: ${limit.minus(usedAmount).toFixed(2)} remaining`,
        { limit: limit.toNumber(), used: usedAmount.toNumber() },
      );
    }
  }

  /**
   * Tells the employee, inside the caller's transaction.
   *
   * The `tx` is not decoration: the decision and the message about it belong to
   * the same commit, or a crash between them leaves a decided claim nobody was
   * told about.
   */
  private async notifyEmployee(
    tx: Prisma.TransactionClient,
    claimId: string,
    type: string,
    title: string,
    body?: string,
  ): Promise<void> {
    const claim = await tx.expenseClaim.findUnique({
      where: { id: claimId },
      include: { employee: { select: { userId: true } } },
    });
    if (!claim?.employee.userId) return;

    await this.notifications.notifyIn(tx, claim.organizationId, claim.employee.userId, {
      type,
      title,
      body: body ?? claim.title,
      data: { expenseClaimId: claimId },
    });
  }
}

/** Uses the largest line's category when the claim does not declare one. */
function inferCategory(
  items: Array<{ category: ExpenseCategory; amount: number }>,
): ExpenseCategory {
  const totals = new Map<ExpenseCategory, number>();
  for (const item of items) {
    totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ExpenseCategory.OTHER;
}

/** Permission required to see other people's claims. */
export const EXPENSE_READ_ALL = Permission.EXPENSE_READ;
