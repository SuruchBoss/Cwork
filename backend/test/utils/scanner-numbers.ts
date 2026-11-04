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

/**
 * Empties what a scanner file leaves behind: its imports and days, the punches and
 * attendance records made from them, and the corrections on those records.
 *
 * A spec that counts whole tables (how many imports, how many punches) starts from
 * here, so it does not depend on which specs ran before it. Punches are append-only,
 * which rules out DELETE, hence TRUNCATE, as the harness itself does.
 */
export async function emptyScannerLedger(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "scanner_punch_links", "scanner_day_decisions", "scanner_days", ' +
      '"scanner_imports", "attendance_punches", "attendance_records" CASCADE',
  );
}
