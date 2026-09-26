// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import {
  CreateDepartmentDto,
  CreateHolidayDto,
  CreatePositionDto,
  CreateWorkLocationDto,
  UpdateDepartmentDto,
  UpdateOrganizationDto,
  UpdatePositionDto,
  UpdateWorkLocationDto,
} from './dto/organization.dto';
import { OrganizationService } from './organization.service';

@ApiTags('Organization')
@ApiBearerAuth()
@Controller()
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Get('organization')
  @RequirePermissions(Permission.ORG_READ)
  @ApiOperation({ summary: 'Current organisation profile and settings' })
  getOrganization(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getOrganization(user.organizationId);
  }

  @Patch('organization')
  @RequirePermissions(Permission.ORG_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'Organization' })
  @ApiOperation({ summary: 'Update organisation profile' })
  updateOrganization(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOrganizationDto) {
    return this.service.updateOrganization(user.organizationId, dto);
  }

  // ---------------------------------------------------------------- departments

  @Get('departments')
  @RequirePermissions(Permission.ORG_READ)
  @ApiOperation({ summary: 'List departments' })
  listDepartments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.listDepartments(user.organizationId, includeInactive === 'true');
  }

  @Get('departments/tree')
  @RequirePermissions(Permission.ORG_READ)
  @ApiOperation({ summary: 'Department hierarchy as a tree' })
  departmentTree(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getDepartmentTree(user.organizationId);
  }

  @Post('departments')
  @RequirePermissions(Permission.ORG_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'Department' })
  @ApiOperation({ summary: 'Create a department' })
  createDepartment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepartmentDto) {
    return this.service.createDepartment(user.organizationId, dto);
  }

  @Patch('departments/:id')
  @RequirePermissions(Permission.ORG_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'Department' })
  @ApiOperation({ summary: 'Update a department' })
  updateDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.service.updateDepartment(user.organizationId, id, dto);
  }

  @Delete('departments/:id')
  @RequirePermissions(Permission.ORG_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: AuditAction.DELETE, entityType: 'Department' })
  @ApiOperation({ summary: 'Soft-delete a department' })
  deleteDepartment(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteDepartment(user.organizationId, id);
  }

  // ------------------------------------------------------------------ positions

  @Get('positions')
  @RequirePermissions(Permission.ORG_READ)
  @ApiOperation({ summary: 'List positions' })
  listPositions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.service.listPositions(user.organizationId, departmentId);
  }

  @Post('positions')
  @RequirePermissions(Permission.ORG_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'Position' })
  @ApiOperation({ summary: 'Create a position' })
  createPosition(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePositionDto) {
    return this.service.createPosition(user.organizationId, dto);
  }

  @Patch('positions/:id')
  @RequirePermissions(Permission.ORG_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'Position' })
  @ApiOperation({ summary: 'Update a position' })
  updatePosition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.service.updatePosition(user.organizationId, id, dto);
  }

  // ------------------------------------------------------------- work locations

  @Get('work-locations')
  @RequirePermissions(Permission.ORG_READ)
  @ApiOperation({ summary: 'List worksites and their geofences' })
  listWorkLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listWorkLocations(user.organizationId);
  }

  @Post('work-locations')
  @RequirePermissions(Permission.ORG_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'WorkLocation' })
  @ApiOperation({ summary: 'Create a worksite' })
  createWorkLocation(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWorkLocationDto) {
    return this.service.createWorkLocation(user.organizationId, dto);
  }

  @Patch('work-locations/:id')
  @RequirePermissions(Permission.ORG_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'WorkLocation' })
  @ApiOperation({ summary: 'Update a worksite' })
  updateWorkLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkLocationDto,
  ) {
    return this.service.updateWorkLocation(user.organizationId, id, dto);
  }

  @Post('work-locations/:id/supersede')
  @RequirePermissions(Permission.ORG_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'WorkLocation' })
  @ApiOperation({ summary: 'Replace a worksite whose code is locked with a new one (CW-049)' })
  supersedeWorkLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkLocationDto,
  ) {
    return this.service.supersedeWorkLocation(user.organizationId, id, dto);
  }

  // ------------------------------------------------------------------- holidays

  @Get('holidays')
  @ApiOperation({ summary: 'Public-holiday calendar' })
  listHolidays(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.service.listHolidays(user.organizationId, year);
  }

  @Post('holidays')
  @RequirePermissions(Permission.ORG_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'Holiday' })
  @ApiOperation({ summary: 'Add a public holiday' })
  createHoliday(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateHolidayDto) {
    return this.service.createHoliday(user.organizationId, dto);
  }

  @Delete('holidays/:id')
  @RequirePermissions(Permission.ORG_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: AuditAction.DELETE, entityType: 'Holiday' })
  @ApiOperation({ summary: 'Remove a public holiday' })
  deleteHoliday(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteHoliday(user.organizationId, id);
  }

  // --------------------------------------------------------------------- roles

  @Get('roles')
  @RequirePermissions(Permission.ROLE_MANAGE)
  @ApiOperation({ summary: 'List roles and their permission sets' })
  listRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listRoles(user.organizationId);
  }
}
