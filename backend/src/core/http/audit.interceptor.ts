import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditAction } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../security/current-user';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_META_KEY, AuditMetadata } from './audit.decorator';

/**
 * Writes an audit entry for any handler annotated with `@Audited(...)`.
 * Failures are not audited here — the exception filter logs those — so the
 * audit table stays a record of what actually changed.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata>(AUDIT_META_KEY, context.getHandler());
    if (!meta) return next.handle();

    const request = context
      .switchToHttp()
      .getRequest<Request & { id?: string; user?: AuthenticatedUser }>();
    const user = request.user;

    return next.handle().pipe(
      tap((result) => {
        if (!user) return;
        void this.auditService.record({
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: meta.action as AuditAction,
          entityType: meta.entityType,
          entityId: meta.resolveId ? meta.resolveId(request, result) : extractId(request, result),
          summary: meta.summary,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          requestId: request.id,
        });
      }),
    );
  }
}

function extractId(request: Request, result: unknown): string | undefined {
  if (result && typeof result === 'object' && 'id' in result) {
    return String((result as { id: unknown }).id);
  }
  const param = (request.params as Record<string, string> | undefined)?.id;
  return param;
}
