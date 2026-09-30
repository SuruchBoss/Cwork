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
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditAction, ResignationStatus } from '@prisma/client';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequireAnyPermission, RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { requireEmployeeId } from '../../core/security/employee-access';
import {
  CreateEmployeeDto,
  CreateOffboardingTaskDto,
  CreateResignationDto,
  DecideResignationDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
  UpdateOwnProfileDto,
} from './dto/employee.dto';
import {
  IMPORT_BODY,
  IMPORT_LIMITS,
  requireUpload,
  XLSX_CONTENT_TYPE,
} from '../../core/spreadsheet/upload';
import { EmployeeImportService } from './employee-import.service';
import { EmployeesService } from './employees.service';
import { OffboardingService } from './offboarding.service';
import { EmployeeRetentionService } from './retention.service';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly retention: EmployeeRetentionService,
    private readonly imports: EmployeeImportService,
  ) {}

  @Get()
  @RequireAnyPermission(
    Permission.EMPLOYEE_READ,
    Permission.EMPLOYEE_READ_TEAM,
    Permission.EMPLOYEE_READ_SELF,
  )
  @ApiOperation({ summary: 'List employees visible to the caller' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: EmployeeQueryDto) {
    return this.employees.list(user, query);
  }

  // Import and retention routes are declared before ':id' so the static segment wins.

  @Get('import/template')
  @RequirePermissions(Permission.EMPLOYEE_CREATE)
  @ApiQuery({ name: 'lang', required: false, enum: ['th', 'en'] })
  @ApiOperation({
    summary: 'The spreadsheet template for importing employees (CW-059)',
    description:
      'An .xlsx with the columns on the first sheet and what goes in each on the second.',
  })
  importTemplate(@Res() res: Response, @Query('lang') lang?: string): void {
    const file = this.imports.template(lang === 'en' ? 'en' : 'th');
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.send(file.content);
  }

  @Post('import/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.EMPLOYEE_CREATE)
  @UseInterceptors(FileInterceptor('file', { limits: IMPORT_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMPORT_BODY)
  @ApiOperation({
    summary: 'Check an employee spreadsheet without importing it',
    description:
      "Reads .xlsx or CSV (UTF-8 or Thai Excel's Windows-874) and returns either the employees it would create or every problem, by row and column. Writes nothing.",
  })
  importPreview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.imports.preview(user, requireUpload(file));
  }

  @Post('import')
  @RequirePermissions(Permission.EMPLOYEE_CREATE)
  @UseInterceptors(FileInterceptor('file', { limits: IMPORT_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMPORT_BODY)
  @ApiOperation({
    summary: 'Import employees from a spreadsheet (CW-059)',
    description:
      'Checks the file again, then creates every employee in one transaction, or none: a file with any problem is refused with 422 and the same list the preview gives. Audited as one event.',
  })
  importEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.imports.commit(user, requireUpload(file));
  }

  @Get('retention/preview')
  @RequirePermissions(Permission.EMPLOYEE_DELETE)
  @ApiOperation({
    summary: 'Dry run: leavers whose retention has lapsed and would be purged',
    description: 'Read-only. Lists what a purge would redact, changing nothing.',
  })
  retentionPreview(@CurrentUser() user: AuthenticatedUser) {
    return this.retention.preview(user.organizationId);
  }

  @Post('retention/purge')
  @RequirePermissions(Permission.EMPLOYEE_DELETE)
  @Audited({
    action: AuditAction.DELETE,
    entityType: 'Employee',
    summary: 'PDPA retention purge run',
  })
  @ApiOperation({ summary: 'Redact leavers past their retention window (audited)' })
  retentionPurge(@CurrentUser() user: AuthenticatedUser) {
    return this.retention.purge(user.organizationId, user.userId);
  }

  @Get('me')
  @RequirePermissions(Permission.EMPLOYEE_READ_SELF)
  @ApiOperation({ summary: 'My own employee profile' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.employees.findOne(user, requireEmployeeId(user));
  }

  @Patch('me')
  @RequirePermissions(Permission.EMPLOYEE_UPDATE_SELF)
  @Audited({
    action: AuditAction.UPDATE,
    entityType: 'Employee',
    summary: 'Self-service profile update',
  })
  @ApiOperation({ summary: 'Update my contact details' })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOwnProfileDto) {
    return this.employees.updateOwnProfile(user, dto);
  }

  @Get('me/team')
  @RequirePermissions(Permission.EMPLOYEE_READ_TEAM)
  @ApiOperation({ summary: 'My direct reports' })
  myTeam(@CurrentUser() user: AuthenticatedUser) {
    return this.employees.listDirectReports(user, requireEmployeeId(user));
  }

  @Get(':id')
  @RequireAnyPermission(
    Permission.EMPLOYEE_READ,
    Permission.EMPLOYEE_READ_TEAM,
    Permission.EMPLOYEE_READ_SELF,
  )
  @ApiOperation({ summary: 'Employee profile' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.findOne(user, id);
  }

  @Get(':id/employment-events')
  @RequirePermissions(Permission.EMPLOYEE_READ)
  @ApiOperation({ summary: 'Employment history timeline' })
  employmentEvents(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.listEmploymentEvents(user.organizationId, id);
  }

  @Get(':id/direct-reports')
  @RequireAnyPermission(Permission.EMPLOYEE_READ, Permission.EMPLOYEE_READ_TEAM)
  @ApiOperation({ summary: 'Direct reports of an employee' })
  directReports(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.listDirectReports(user, id);
  }

  @Post()
  @RequirePermissions(Permission.EMPLOYEE_CREATE)
  @Audited({ action: AuditAction.CREATE, entityType: 'Employee' })
  @ApiOperation({ summary: 'Create an employee record' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.EMPLOYEE_UPDATE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'Employee' })
  @ApiOperation({ summary: 'Update an employee record' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.EMPLOYEE_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: AuditAction.DELETE, entityType: 'Employee' })
  @ApiOperation({ summary: 'Soft-delete an employee and disable their login' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.softDelete(user, id);
  }
}

@ApiTags('Offboarding')
@ApiBearerAuth()
@Controller('offboarding')
export class OffboardingController {
  constructor(private readonly offboarding: OffboardingService) {}

  @Post('resignations')
  @RequirePermissions(Permission.RESIGNATION_SUBMIT_SELF)
  @Audited({ action: AuditAction.CREATE, entityType: 'ResignationRequest' })
  @ApiOperation({ summary: 'Submit my resignation' })
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateResignationDto) {
    return this.offboarding.submitResignation(user, dto);
  }

  @Get('resignations')
  @RequirePermissions(Permission.OFFBOARDING_READ)
  @ApiOperation({ summary: 'List resignations' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: ResignationStatus) {
    return this.offboarding.listResignations(user.organizationId, status);
  }

  @Get('resignations/:id')
  @RequirePermissions(Permission.OFFBOARDING_READ)
  @ApiOperation({ summary: 'Resignation detail with clearance checklist' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.offboarding.getResignation(user.organizationId, id);
  }

  @Post('resignations/:id/decide')
  @RequirePermissions(Permission.OFFBOARDING_MANAGE)
  @Audited({ action: AuditAction.APPROVE, entityType: 'ResignationRequest' })
  @ApiOperation({ summary: 'Approve or reject a resignation' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideResignationDto,
  ) {
    return this.offboarding.decideResignation(user, id, dto);
  }

  @Post('resignations/:id/tasks')
  @RequirePermissions(Permission.OFFBOARDING_MANAGE)
  @ApiOperation({ summary: 'Add a clearance task' })
  addTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOffboardingTaskDto,
  ) {
    return this.offboarding.addTask(user.organizationId, id, dto);
  }

  @Patch('tasks/:taskId/complete')
  @RequirePermissions(Permission.OFFBOARDING_MANAGE)
  @ApiOperation({ summary: 'Mark a clearance task complete' })
  completeTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: { note?: string },
  ) {
    return this.offboarding.completeTask(user.organizationId, taskId, body?.note);
  }

  @Post('resignations/:id/exit-interview')
  @RequirePermissions(Permission.OFFBOARDING_MANAGE)
  @ApiOperation({ summary: 'Record the exit interview' })
  exitInterview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      responses: Record<string, unknown>;
      overallSatisfaction?: number;
      wouldRecommend?: boolean;
      wouldRehire?: boolean;
      summary?: string;
    },
  ) {
    return this.offboarding.saveExitInterview(user, id, body);
  }
}
