import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PageDto } from '../../core/http/pagination.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import type { AuditQueryDto } from './dto/audit-query.dto';

export interface AuditEntry {
  organizationId: string;
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/** Field names whose values must never reach the audit table in cleartext. */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'nationalId',
  'nationalIdEnc',
  'passportNoEnc',
  'taxIdEnc',
  'socialSecurityNoEnc',
  'accountNoEnc',
  'accountNumber',
  'mfaSecretEnc',
  'mfaRecoveryCodes',
  'token',
  'tokenHash',
  'refreshToken',
  'apiKey',
]);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Browsing the trail, scoped to the caller's organisation.
   *
   * The write side above is the interesting one; this is here so the controller
   * does not have to hold a Prisma client to answer a GET. The `where` is built
   * once and used for both the page and the count, so the total can never
   * describe a different filter from the rows.
   */
  async search(user: AuthenticatedUser, query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: user.organizationId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: { actor: { select: { id: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return PageDto.of(data, total, query.page, query.limit);
  }

  /**
   * Auditing must never break the operation it is recording, so failures are
   * logged and swallowed. The trade-off is deliberate: a missing audit row is
   * recoverable from application logs, a failed payroll run is not.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          actorUserId: entry.actorUserId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          summary: entry.summary ?? null,
          changes: entry.changes ? (redact(entry.changes) as Prisma.InputJsonValue) : Prisma.DbNull,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent?.slice(0, 500) ?? null,
          requestId: entry.requestId ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${entry.entityType}:${entry.entityId ?? '-'}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Records a field-level diff, skipping unchanged and redacted values. */
  async recordChange(
    entry: Omit<AuditEntry, 'changes'>,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Promise<void> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const from = before[key];
      const to = after[key];
      if (JSON.stringify(from) === JSON.stringify(to)) continue;
      changes[key] = REDACTED_FIELDS.has(key)
        ? { from: '[redacted]', to: '[redacted]' }
        : { from: from ?? null, to: to ?? null };
    }
    if (Object.keys(changes).length === 0) return;
    await this.record({ ...entry, changes });
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_FIELDS.has(key) ? '[redacted]' : redact(val);
    }
    return out;
  }
  return value;
}
