// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApprovalEntityType, ApprovalTaskStatus, AuditAction } from '@prisma/client';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { ApprovalService } from './approval.service';
import {
  ApprovalDecisionDto,
  ApprovalTaskQueryDto,
  CreateApprovalPolicyDto,
} from './dto/approval.dto';

@ApiTags('Approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get('tasks')
  @ApiOperation({ summary: 'Approval tasks assigned to me' })
  listMyTasks(@CurrentUser() user: AuthenticatedUser, @Query() query: ApprovalTaskQueryDto) {
    return this.approvals.listMyTasks(user.userId, query.status ?? ApprovalTaskStatus.PENDING);
  }

  @Post('tasks/:id/decide')
  @RequirePermissions(Permission.APPROVAL_ACT)
  @Audited({ action: AuditAction.APPROVE, entityType: 'ApprovalTask' })
  @ApiOperation({ summary: 'Approve or reject an assigned request' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.approvals.decide(id, user.userId, dto.decision, dto.comment);
  }

  @Get('instances/:entityType/:entityId')
  @ApiOperation({ summary: 'Approval trail for one entity' })
  getInstance(
    @Param('entityType') entityType: ApprovalEntityType,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    return this.approvals.getInstanceForEntity(entityType, entityId);
  }

  @Get('policies')
  @RequirePermissions(Permission.APPROVAL_POLICY_MANAGE)
  @ApiOperation({ summary: 'List approval policies' })
  listPolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.approvals.listPolicies(user.organizationId);
  }

  @Post('policies')
  @RequirePermissions(Permission.APPROVAL_POLICY_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'ApprovalPolicy' })
  @ApiOperation({ summary: 'Create an approval policy with its steps' })
  createPolicy(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApprovalPolicyDto) {
    return this.approvals.createPolicy(user.organizationId, dto);
  }
}
