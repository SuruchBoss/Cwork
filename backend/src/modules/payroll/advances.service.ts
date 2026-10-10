// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AdvanceStatus, AuditAction, PayrollRunStatus, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { toDateOnly } from '../../core/utils/date.util';
import { Decimal, round2 } from '../../core/utils/money.util';
import { AuditService } from '../audit/audit.service';
import { organizationToday } from '../organization/organization-today';
import type { AdvanceOwed } from './domain/payroll-calculator';
import type { CreateAdvanceDto, UpdateAdvanceDto } from './dto/payroll.dto';

/** Runs whose payslips no longer take anything back. */
const VOID_RUNS: PayrollRunStatus[] = [PayrollRunStatus.CANCELLED, PayrollRunStatus.FAILED];
/** Runs whose deductions are final: the advance can no longer change. */
const FINAL_RUNS: PayrollRunStatus[] = [PayrollRunStatus.APPROVED, PayrollRunStatus.PAID];

const withDeductions = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstNameTh: true,
      lastNameTh: true,
      status: true,
      deletedAt: true,
    },
  },
  deductions: {
    select: {
      amount: true,
      payslip: {
        select: {
          run: {
            select: {
              id: true,
              runNo: true,
              status: true,
              period: { select: { code: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PayrollAdvanceInclude;

type AdvanceRow = Prisma.PayrollAdvanceGetPayload<{ include: typeof withDeductions }>;

/**
 * Cash advances (เบิกล่วงหน้า, CW-070): money paid before payday and taken
 * back by the regular runs that follow. What is owed is never stored; it is
 * the amount less what payslips in runs that still stand have deducted.
 */
@Injectable()
export class AdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, filter: { employeeId?: string; owing?: boolean } = {}) {
    const rows = await this.prisma.payrollAdvance.findMany({
      where: {
        organizationId,
        ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      include: withDeductions,
    });
    const shaped = rows.map(shape);
    return filter.owing
      ? shaped.filter((a) => a.status === AdvanceStatus.ACTIVE && a.outstanding > 0)
      : shaped;
  }

  async create(user: AuthenticatedUser, dto: CreateAdvanceDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundError('Employee', dto.employeeId);
    const paidOn = await this.assertPaidOn(user.organizationId, dto.paidOn);

    const created = await this.prisma.payrollAdvance.create({
      data: {
        organizationId: user.organizationId,
        employeeId: dto.employeeId,
        amount: new Prisma.Decimal(dto.amount),
        paidOn,
        method: dto.method,
        note: dto.note?.trim() || null,
        recordedById: user.userId,
      },
      include: withDeductions,
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.CREATE,
      entityType: 'PayrollAdvance',
      entityId: created.id,
      summary: `Advance of ${dto.amount} paid on ${dto.paidOn}`,
      changes: { employeeId: dto.employeeId, amount: dto.amount, paidOn: dto.paidOn },
    });
    return shape(created);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateAdvanceDto) {
    const advance = await this.editable(user.organizationId, id);
    const paidOn =
      dto.paidOn !== undefined
        ? await this.assertPaidOn(user.organizationId, dto.paidOn)
        : undefined;

    const updated = await this.prisma.payrollAdvance.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: new Prisma.Decimal(dto.amount) } : {}),
        ...(paidOn ? { paidOn } : {}),
        ...(dto.method !== undefined ? { method: dto.method } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
      include: withDeductions,
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.UPDATE,
      entityType: 'PayrollAdvance',
      entityId: id,
      summary: 'Advance changed',
      changes: {
        from: {
          amount: Number(advance.amount),
          paidOn: advance.paidOn.toISOString().slice(0, 10),
          method: advance.method,
          note: advance.note,
        },
        to: dto as Record<string, unknown>,
      },
    });
    return shape(updated);
  }

  /** Cancelled, never deleted: the record and its audit trail stay. */
  async cancel(user: AuthenticatedUser, id: string) {
    await this.editable(user.organizationId, id);
    const cancelled = await this.prisma.payrollAdvance.update({
      where: { id },
      data: {
        status: AdvanceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: user.userId,
      },
      include: withDeductions,
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.DELETE,
      entityType: 'PayrollAdvance',
      entityId: id,
      summary: 'Advance cancelled',
    });
    return shape(cancelled);
  }

  /**
   * What an employee still owes, as of a period's last day, for a run to take
   * back. The run's own earlier payslips are gone by the time this is asked,
   * so they never count against it.
   */
  async owedFor(employeeId: string, periodEnd: Date): Promise<AdvanceOwed[]> {
    const rows = await this.prisma.payrollAdvance.findMany({
      where: { employeeId, status: AdvanceStatus.ACTIVE, paidOn: { lte: periodEnd } },
      orderBy: { paidOn: 'asc' },
      include: withDeductions,
    });
    return rows
      .map(shape)
      .filter((a) => a.outstanding > 0)
      .map((a) => ({ id: a.id, paidOn: a.paidOn, outstanding: a.outstanding }));
  }

  /**
   * An advance a run took back and that changed after the run was calculated
   * would be approved on figures that are no longer true (CW-070). Refused
   * until the run is calculated again.
   */
  async assertUnchangedSince(runId: string, calculatedAt: Date | null) {
    const changed = await this.prisma.payrollAdvance.findMany({
      where: {
        deductions: { some: { payslip: { runId } } },
        ...(calculatedAt ? { updatedAt: { gt: calculatedAt } } : {}),
      },
      select: { id: true },
    });
    if (changed.length > 0) {
      throw new BusinessRuleError(
        'ADVANCES_CHANGED_SINCE_CALCULATION',
        'An advance this run takes back has changed since it was calculated: calculate the run again before approving it',
        { advanceIds: changed.map((a) => a.id) },
      );
    }
  }

  private async editable(organizationId: string, id: string): Promise<AdvanceRow> {
    const advance = await this.prisma.payrollAdvance.findFirst({
      where: { id, organizationId },
      include: withDeductions,
    });
    if (!advance) throw new NotFoundError('PayrollAdvance', id);
    if (advance.status === AdvanceStatus.CANCELLED) {
      throw new BusinessRuleError('ADVANCE_CANCELLED', 'This advance has been cancelled');
    }
    const final = advance.deductions.find((d) => FINAL_RUNS.includes(d.payslip.run.status));
    if (final) {
      throw new BusinessRuleError(
        'ADVANCE_LOCKED',
        'An approved or paid run has taken this advance back, so it can no longer be changed',
        { runId: final.payslip.run.id, runNo: final.payslip.run.runNo },
      );
    }
    return advance;
  }

  /** Money already paid out: a day in the future is a mistake, not a plan. */
  private async assertPaidOn(organizationId: string, value: string): Promise<Date> {
    const paidOn = toDateOnly(value);
    const today = await organizationToday(this.prisma, organizationId);
    if (paidOn > today) {
      throw new BusinessRuleError(
        'ADVANCE_IN_FUTURE',
        'An advance is recorded once it has been paid, so its date cannot be in the future',
      );
    }
    return paidOn;
  }
}

function shape(row: AdvanceRow) {
  const standing = row.deductions.filter((d) => !VOID_RUNS.includes(d.payslip.run.status));
  const deducted = standing.reduce((sum, d) => sum.plus(d.amount.toString()), new Decimal(0));
  const amount = new Decimal(row.amount.toString());
  return {
    id: row.id,
    employeeId: row.employeeId,
    employee: row.employee,
    amount: amount.toNumber(),
    paidOn: row.paidOn.toISOString().slice(0, 10),
    method: row.method,
    note: row.note,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deducted: round2(deducted).toNumber(),
    outstanding:
      row.status === AdvanceStatus.CANCELLED
        ? 0
        : Decimal.max(0, round2(amount.minus(deducted))).toNumber(),
    locked: standing.some((d) => FINAL_RUNS.includes(d.payslip.run.status)),
    deductions: standing.map((d) => ({
      amount: Number(d.amount),
      runId: d.payslip.run.id,
      runNo: d.payslip.run.runNo,
      runStatus: d.payslip.run.status,
      periodCode: d.payslip.run.period.code,
    })),
  };
}
