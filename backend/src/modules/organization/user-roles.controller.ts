// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { GrantRoleDto } from './dto/user-roles.dto';
import { UserRolesService, type RoleChangeMeta } from './user-roles.service';

/**
 * The roles of an employee's account (CW-079). Every route needs
 * `role:manage`; the service also refuses a role the caller does not hold in
 * full. Changes are audited by the service with the role and account named,
 * rather than by the generic interceptor.
 */
@ApiTags('Organization')
@ApiBearerAuth()
@Controller('employees/:employeeId/roles')
export class UserRolesController {
  constructor(private readonly userRoles: UserRolesService) {}

  @Get()
  @RequirePermissions(Permission.ROLE_MANAGE)
  @ApiOperation({
    summary: "An employee's account and its roles, with the roles that can be given",
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.userRoles.list(user, employeeId);
  }

  @Post()
  @RequirePermissions(Permission.ROLE_MANAGE)
  @ApiOperation({ summary: "Give a system role to an employee's account; signs that account out" })
  grant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: GrantRoleDto,
    @Req() req: Request,
  ) {
    return this.userRoles.grant(user, employeeId, dto, requestMeta(req));
  }

  @Delete(':grantId')
  @RequirePermissions(Permission.ROLE_MANAGE)
  @ApiOperation({ summary: "Take a role away from an employee's account; signs that account out" })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @Req() req: Request,
  ) {
    return this.userRoles.revoke(user, employeeId, grantId, requestMeta(req));
  }
}

function requestMeta(req: Request & { id?: string }): RoleChangeMeta {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id };
}
