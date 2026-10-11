// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { PayComponentType, type Prisma } from '@prisma/client';
import type { PrismaService } from '../../core/prisma/prisma.service';
import { Decimal, round2 } from '../../core/utils/money.util';

/** A payslip's social security figures, with who it belongs to and which month it counts for. */
export interface SsoSlip {
  employeeId: string;
  employeeCode: string;
  firstNameTh: string;
  lastNameTh: string;
  /** 1–12, the period's month. */
  month: number;
  /** The wage social security was worked out on, before the ceiling. */
  ssoWage: number;
  /** True when the wage was rebuilt from the payslip's lines, not stored on it. */
  wageRebuilt: boolean;
  ssoEmployee: number;
  ssoEmployer: number;
}

function compensationIdOf(snapshot: unknown): string | null {
  const id = (snapshot as { compensationId?: unknown } | null)?.compensationId;
  return typeof id === 'string' ? id : null;
}

/**
 * The payslips a social security report is built from, for the runs `where`
 * selects. Someone the run did not cover for social security is left out.
 *
 * Payslips from before CW-069 do not store the wage social security was worked
 * out on; it is rebuilt from their lines the way the calculator builds it: the
 * base pay plus earnings that count towards it.
 */
export async function ssoSlips(
  prisma: PrismaService,
  organizationId: string,
  run: Prisma.PayrollRunWhereInput,
): Promise<{ slips: SsoSlip[]; checked: number }> {
  const payslips = await prisma.payslip.findMany({
    where: { run: { organizationId, ...run } },
    select: {
      employeeId: true,
      ssoEmployee: true,
      ssoEmployer: true,
      snapshot: true,
      employee: { select: { employeeCode: true, firstNameTh: true, lastNameTh: true } },
      run: { select: { period: { select: { month: true } } } },
      items: { select: { code: true, type: true, amount: true } },
    },
  });

  const ssoComponents = new Set(
    (
      await prisma.payComponent.findMany({
        where: { organizationId, type: PayComponentType.EARNING, includeInSsoBase: true },
        select: { code: true },
      })
    ).map((c) => c.code),
  );

  const compensationIds = payslips
    .map((slip) => compensationIdOf(slip.snapshot))
    .filter((id): id is string => id !== null);
  const ineligible = new Set(
    (
      await prisma.employeeCompensation.findMany({
        where: { id: { in: [...new Set(compensationIds)] }, isSsoEligible: false },
        select: { id: true },
      })
    ).map((c) => c.id),
  );

  const slips: SsoSlip[] = [];
  for (const slip of payslips) {
    const compensationId = compensationIdOf(slip.snapshot);
    if (compensationId && ineligible.has(compensationId)) continue;
    if (!compensationId && Number(slip.ssoEmployee) === 0) continue;

    const stored = (slip.snapshot as { ssoWage?: unknown } | null)?.ssoWage;
    const rebuilt = typeof stored !== 'number';
    const wage = rebuilt
      ? slip.items
          .filter(
            (item) =>
              item.type === PayComponentType.EARNING &&
              (item.code === 'BASE' || ssoComponents.has(item.code)),
          )
          .reduce((sum, item) => sum.plus(item.amount.toString()), new Decimal(0))
      : new Decimal(stored);

    slips.push({
      employeeId: slip.employeeId,
      employeeCode: slip.employee.employeeCode,
      firstNameTh: slip.employee.firstNameTh,
      lastNameTh: slip.employee.lastNameTh,
      month: slip.run.period.month,
      ssoWage: round2(wage).toNumber(),
      wageRebuilt: rebuilt,
      ssoEmployee: Number(slip.ssoEmployee),
      ssoEmployer: Number(slip.ssoEmployer),
    });
  }
  return { slips, checked: payslips.length };
}
