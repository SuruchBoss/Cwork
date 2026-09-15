import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SequenceScope =
  | 'LEAVE_REQUEST'
  | 'OVERTIME_REQUEST'
  | 'EXPENSE_CLAIM'
  | 'DOCUMENT_REQUEST'
  | 'PAYROLL_RUN'
  | 'JOB_REQUISITION'
  | 'EMPLOYEE';

const PREFIXES: Record<SequenceScope, string> = {
  LEAVE_REQUEST: 'LV',
  OVERTIME_REQUEST: 'OT',
  EXPENSE_CLAIM: 'EXP',
  DOCUMENT_REQUEST: 'DOC',
  PAYROLL_RUN: 'PAY',
  JOB_REQUISITION: 'REQ',
  EMPLOYEE: 'EMP',
};

/**
 * Allocates gap-tolerant, human-readable reference numbers.
 *
 * The allocation is one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so
 * two concurrent requests can never be handed the same number even without an
 * explicit lock. Numbers may skip values if a transaction rolls back — that is
 * intentional; reusing a reference number is far worse than a gap.
 */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(
    organizationId: string,
    scope: SequenceScope,
    year = new Date().getUTCFullYear(),
  ): Promise<string> {
    const key = `${scope}:${year}`;
    const prefix = PREFIXES[scope];

    const rows = await this.prisma.$queryRaw<{ nextValue: number; padding: number }[]>`
      INSERT INTO "number_sequences" ("id", "organizationId", "key", "prefix", "nextValue", "padding", "updatedAt")
      VALUES (gen_random_uuid(), ${organizationId}::uuid, ${key}, ${prefix}, 2, 5, now())
      ON CONFLICT ("organizationId", "key")
      DO UPDATE SET "nextValue" = "number_sequences"."nextValue" + 1, "updatedAt" = now()
      RETURNING "nextValue" - 1 AS "nextValue", "padding"
    `;

    const { nextValue, padding } = rows[0];
    return `${prefix}-${year}-${String(nextValue).padStart(padding, '0')}`;
  }
}
