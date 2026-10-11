// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AuditAction, PayrollRunStatus } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { AuditService } from '../audit/audit.service';
import {
  PayslipRenderer,
  WageReceiptRenderer,
  type SlipsPerPage,
} from '../documents/payslip-renderer';
import {
  payslipDiscrepancy,
  payslipSheet,
  wageReceiptSheet,
  type PrintablePayslip,
  type PrintableRun,
} from '../documents/payslip-sheet';

export interface PrintedFile {
  filename: string;
  contentType: string;
  content: Buffer;
}

/** Runs whose figures are settled: a draft or half-checked run is not something to hand out. */
const PRINTABLE_STATUSES: PayrollRunStatus[] = [PayrollRunStatus.APPROVED, PayrollRunStatus.PAID];

/**
 * Printed payslips and the wage-receipt sheet (CW-071).
 *
 * What is printed is the payslip record itself — the lines and totals the API
 * returns — and nothing is printed from a run that is not approved, or from a
 * slip whose lines do not add up to its totals. Every print is audited, since a
 * printed slip is a copy of someone's pay that leaves the system.
 */
@Injectable()
export class PayslipPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly slips: PayslipRenderer,
    private readonly receipts: WageReceiptRenderer,
  ) {}

  /** All payslips of a run, `perPage` to an A4 sheet. */
  async printRunPayslips(
    user: AuthenticatedUser,
    runId: string,
    perPage: SlipsPerPage,
  ): Promise<PrintedFile> {
    const { run, payslips } = await this.loadRun(user.organizationId, runId);
    const content = await this.slips.render(
      payslips.map((slip) => payslipSheet(run, slip)),
      perPage,
    );
    await this.record(user, runId, 'payslips', payslips.length, { perPage, runNo: run.runNo });
    return { filename: `payslips-${run.runNo}.pdf`, contentType: 'application/pdf', content };
  }

  /** One payslip, on a page of its own or `perPage` to a sheet. */
  async printPayslip(
    user: AuthenticatedUser,
    payslipId: string,
    perPage: SlipsPerPage,
  ): Promise<PrintedFile> {
    const found = await this.prisma.payslip.findFirst({
      where: { id: payslipId, run: { organizationId: user.organizationId } },
      select: { runId: true },
    });
    if (!found) throw new NotFoundError('Payslip', payslipId);
    const { run, payslips } = await this.loadRun(user.organizationId, found.runId, payslipId);
    const content = await this.slips.render(
      payslips.map((slip) => payslipSheet(run, slip)),
      perPage,
    );
    await this.record(user, found.runId, 'payslips', 1, {
      perPage,
      runNo: run.runNo,
      payslipId,
    });
    const employee = payslips[0]!.employee.employeeCode;
    return {
      filename: `payslip-${run.runNo}-${employee}.pdf`,
      contentType: 'application/pdf',
      content,
    };
  }

  /** The sheet each employee signs for their pay: one row per payslip of the run. */
  async printRunReceipts(user: AuthenticatedUser, runId: string): Promise<PrintedFile> {
    const { run, payslips } = await this.loadRun(user.organizationId, runId);
    const content = await this.receipts.render(wageReceiptSheet(run, payslips));
    await this.record(user, runId, 'wage-receipts', payslips.length, { runNo: run.runNo });
    return { filename: `wage-receipts-${run.runNo}.pdf`, contentType: 'application/pdf', content };
  }

  private async loadRun(
    organizationId: string,
    runId: string,
    onlyPayslipId?: string,
  ): Promise<{ run: PrintableRun; payslips: PrintablePayslip[] }> {
    const row = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      include: {
        period: true,
        organization: { select: { name: true, legalName: true, taxId: true } },
        payslips: {
          orderBy: { employee: { employeeCode: 'asc' } },
          include: {
            items: { orderBy: { orderIndex: 'asc' } },
            employee: {
              select: {
                employeeCode: true,
                firstNameTh: true,
                lastNameTh: true,
                position: { select: { title: true } },
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundError('PayrollRun', runId);

    if (!PRINTABLE_STATUSES.includes(row.status)) {
      throw new BusinessRuleError(
        'PAYROLL_RUN_NOT_PRINTABLE',
        `Run ${row.runNo} is ${row.status}; payslips can be printed once it is approved`,
        { status: row.status },
      );
    }

    const payslips = row.payslips.filter((slip) => !onlyPayslipId || slip.id === onlyPayslipId);
    if (payslips.length === 0) {
      throw new BusinessRuleError(
        'PAYROLL_RUN_HAS_NO_PAYSLIPS',
        `Run ${row.runNo} has no payslips to print`,
      );
    }
    for (const slip of payslips) {
      const problem = payslipDiscrepancy(slip);
      if (problem) {
        throw new BusinessRuleError(
          'PAYSLIP_DOES_NOT_ADD_UP',
          `Payslip of ${slip.employee.employeeCode} in run ${row.runNo} does not add up (${problem}); nothing was printed`,
          { employeeCode: slip.employee.employeeCode },
        );
      }
    }

    return {
      run: {
        runNo: row.runNo,
        period: {
          code: row.period.code,
          periodStart: row.period.periodStart,
          periodEnd: row.period.periodEnd,
          payDate: row.period.payDate,
        },
        organization: row.organization,
      },
      payslips,
    };
  }

  private async record(
    user: AuthenticatedUser,
    runId: string,
    kind: 'payslips' | 'wage-receipts',
    count: number,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.EXPORT,
      entityType: 'PayrollRun',
      entityId: runId,
      summary: `Printed ${count} ${kind === 'payslips' ? 'payslip(s)' : 'wage receipt row(s)'} of run ${String(extra.runNo)}`,
      changes: { kind, count, ...extra },
    });
  }
}
