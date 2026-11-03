// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { PrismaClient } from '@prisma/client';

/**
 * A scanner number is bound to an employee for a period (CW-109), so a spec
 * that needs one on somebody writes the period and takes it away again.
 */
export async function giveNumber(
  prisma: PrismaClient,
  employeeId: string,
  scannerNumber: string,
  period: { from?: string; to?: string } = {},
): Promise<string> {
  const { organizationId } = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { organizationId: true },
  });
  const row = await prisma.employeeScannerNumber.create({
    data: {
      organizationId,
      employeeId,
      scannerNumber,
      validFrom: period.from ? new Date(`${period.from}T00:00:00Z`) : null,
      validTo: period.to ? new Date(`${period.to}T00:00:00Z`) : null,
    },
    select: { id: true },
  });
  return row.id;
}

/** Takes every number off these employees, so no other spec finds one on them. */
export function takeNumbers(prisma: PrismaClient, employeeIds: string[]) {
  return prisma.employeeScannerNumber.deleteMany({ where: { employeeId: { in: employeeIds } } });
}

/** The number an employee uses now, or null. */
export async function numberInUse(prisma: PrismaClient, employeeId: string) {
  const row = await prisma.employeeScannerNumber.findFirst({
    where: { employeeId, validTo: null },
    select: { scannerNumber: true },
  });
  return row?.scannerNumber ?? null;
}
