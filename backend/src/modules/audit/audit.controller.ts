import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PageDto } from '../../core/http/pagination.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'Browse the append-only audit trail' })
  // AuditQueryDto already extends PaginationQueryDto. An intersection type here
  // would silently defeat the validation pipe: it can only transform a class,
  // so `limit` would arrive as a string and Prisma would reject it.
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditQueryDto) {
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
}
