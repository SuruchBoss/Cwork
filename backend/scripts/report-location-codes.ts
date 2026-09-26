// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Reports work-location codes that do not match the ecosystem's identifier
 * shape (CW-049 / ADR-0006) — and changes nothing.
 *
 *     npm run report:location-codes
 *
 * Adopting the rule is a breaking change for an existing installation: a code
 * that was free text may not be a valid identifier. Rather than mangle a code
 * it cannot mechanically fix, this lists every offending code and exits
 * non-zero, so an operator corrects each one deliberately — editing it while the
 * site is still unused, or superseding it once it is — before the constraint is
 * relied on. It never writes.
 *
 * The format is enforced at the API for every new or changed code; this exists
 * for the codes that already sit in the table when the rule arrives.
 */
import { PrismaClient } from '@prisma/client';

// ADR-0006. Kept in step with WORK_LOCATION_CODE_PATTERN in organization.dto.ts.
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,31}$/;

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const locations = await prisma.workLocation.findMany({
    where: { deletedAt: null },
    select: { id: true, organizationId: true, code: true, name: true },
    orderBy: [{ organizationId: 'asc' }, { code: 'asc' }],
  });

  const offenders = locations.filter((l) => !CODE_PATTERN.test(l.code));

  console.log(`Checked ${locations.length} work location(s) against ${CODE_PATTERN}.`);

  if (offenders.length === 0) {
    console.log('  ok  every code is a valid ecosystem location code; nothing to change.');
    return;
  }

  console.error(`\n${offenders.length} code(s) do not match and must be corrected before the rule`);
  console.error('applies. This tool does not guess a replacement — fix each one (edit it while');
  console.error('the site is unused, or supersede it once it is used) and run this again:\n');
  for (const l of offenders) {
    console.error(`  - "${l.code}"  (${l.name}, org ${l.organizationId}, id ${l.id})`);
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`report-location-codes failed: ${String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
