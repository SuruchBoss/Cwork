// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  PayrollReconciliationError,
  reconcilePeriod,
  type ReconciledPeriod,
} from './domain/payroll-export';

export interface LoadedPeriod {
  period: { id: string; code: string; year: number; month: number };
  reconciled: ReconciledPeriod;
}

/**
 * A period's payslips, checked against their runs (CW-044), for everything that
 * reads a whole period: the export and the check against what was filed
 * (CW-089). Refusing here, once, is what keeps every one of them from working
 * on a period that does not add up.
 *
 * `taxId` is given only by a caller that prints it: the ciphertext is read and
 * decrypted for that caller alone.
 */
export async function loadReconciledPeriod(
  prisma: PrismaService,
  organizationId: string,
  periodId: string,
  taxId?: (employee: { taxIdEnc: string | null; nationalIdEnc: string | null }) => string | null,
): Promise<LoadedPeriod> {
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: periodId, organizationId },
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
                  ...(taxId ? { taxIdEnc: true, nationalIdEnc: true } : {}),
                },
              },
            },
          },
        },
      },
    },
  });
  if (!period) throw new NotFoundError('PayrollPeriod', periodId);

  try {
    const reconciled = reconcilePeriod(
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
          ...(taxId
            ? {
                taxId: taxId(
                  slip.employee as { taxIdEnc: string | null; nationalIdEnc: string | null },
                ),
              }
            : {}),
        })),
      })),
    );
    return {
      period: { id: period.id, code: period.code, year: period.year, month: period.month },
      reconciled,
    };
  } catch (error) {
    // Refusal is a client error, not a server fault: name the reason (422).
    if (error instanceof PayrollReconciliationError) {
      throw new BusinessRuleError(error.code, error.message);
    }
    throw error;
  }
}
