// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * After a database seeded at the previous release has been migrated up to the
 * current commit, this asserts the seeded data is still readable through the
 * CURRENT Prisma client (CW-032). It is the second half of the upgrade job in
 * CI; on its own it proves nothing, because it must run against a database that
 * was populated by the old code and then migrated.
 *
 * Reading each core model with `findFirst` issues a `SELECT` of every column
 * the current schema declares. If a migration dropped or renamed a column that
 * `schema.prisma` still expects, Postgres answers "column does not exist" and
 * this exits non-zero — which is how "a migration that drops a populated column
 * fails CI" (the ticket's acceptance) actually bites. A column dropped from the
 * schema as well (an intentional removal) is not selected and correctly passes.
 *
 * The `POPULATED` models are also asserted to hold at least one row, so a run
 * that quietly seeded nothing cannot pass by reading empty tables.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * A spread of models across the modules the seed touches. `findFirst` on each
 * forces a full-column select, so between them they exercise most of the
 * schema's tables; a missing column on any of them fails the run.
 */
const MODELS = [
  'organization',
  'user',
  'employee',
  'department',
  'position',
  'role',
  'leaveType',
  'shift',
  'workSchedule',
  'scheduleAssignment',
  'workLocation',
  'holiday',
  'payComponent',
  'benefitPlan',
  'employeeCompensation',
  'approvalPolicy',
  'attendanceRecord',
  'knowledgeDocument',
  'knowledgeChunk',
] as const;

/** Models the seed always populates: an empty result here means the seed did not run. */
const POPULATED = new Set<string>(['organization', 'user', 'employee', 'department']);

async function main(): Promise<void> {
  const failures: string[] = [];

  for (const model of MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model];
    try {
      const row = await delegate.findFirst();
      if (POPULATED.has(model) && row === null) {
        failures.push(`${model}: no rows — the previous-release seed did not populate it`);
      }
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await prisma.$disconnect();

  if (failures.length > 0) {
    console.error('Seeded data is not readable after upgrading to this commit:\n');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('\nA migration changed the database out from under schema.prisma — a column');
    console.error('the current code still reads was dropped or renamed, or the migration did');
    console.error('not apply cleanly on populated tables.');
    process.exit(1);
  }

  console.log(`Upgraded database is readable: ${MODELS.length} core models queried, seed data intact.`);
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exit(1);
});
