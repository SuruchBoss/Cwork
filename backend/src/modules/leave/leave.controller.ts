// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { AuditAction } from '@prisma/client';
import type { Response } from 'express';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequireAnyPermission, RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { requireEmployeeId } from '../../core/security/employee-access';
import {
  AdjustLeaveBalanceDto,
  CancelLeaveRequestDto,
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  LeaveRequestQueryDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto';
import {
  IMPORT_BODY,
  IMPORT_LIMITS,
  requireUpload,
  XLSX_CONTENT_TYPE,
} from '../../core/spreadsheet/upload';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveService } from './leave.service';
import { PriorLeaveImportService } from './prior-leave-import.service';

@ApiTags('Leave')
@ApiBearerAuth()
@Controller('leave')
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly balances: LeaveBalanceService,
    private readonly priorLeave: PriorLeaveImportService,
  ) {}

  // ------------------------------------------------------------------- types

  @Get('types')
  @ApiOperation({ summary: 'Leave types available in this organisation' })
  listTypes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.leave.listLeaveTypes(user.organizationId, includeInactive === 'true');
  }

  @Post('types')
  @RequirePermissions(Permission.LEAVE_TYPE_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'LeaveType' })
  @ApiOperation({ summary: 'Create a leave type' })
  createType(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeaveTypeDto) {
    return this.leave.createLeaveType(user.organizationId, dto);
  }

  @Patch('types/:id')
  @RequirePermissions(Permission.LEAVE_TYPE_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'LeaveType' })
  @ApiOperation({ summary: 'Update a leave type' })
  updateType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leave.updateLeaveType(user.organizationId, id, dto);
  }

  // ---------------------------------------------------------------- balances

  @Get('balances/me')
  @RequirePermissions(Permission.LEAVE_READ_SELF)
  @ApiOperation({ summary: 'My leave balances' })
  myBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.balances.getBalances(user.organizationId, requireEmployeeId(user), year);
  }

  @Get('balances/:employeeId')
  @RequireAnyPermission(Permission.LEAVE_READ, Permission.LEAVE_READ_TEAM)
  @ApiOperation({ summary: 'Leave balances of an employee' })
  employeeBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.balances.getBalances(user.organizationId, employeeId, year);
  }

  @Post('balances/adjust')
  @RequirePermissions(Permission.LEAVE_BALANCE_ADJUST)
  @Audited({
    action: AuditAction.UPDATE,
    entityType: 'LeaveEntitlement',
    summary: 'Manual balance adjustment',
  })
  @ApiOperation({ summary: 'Adjust a leave balance (audited)' })
  adjust(@CurrentUser() user: AuthenticatedUser, @Body() dto: AdjustLeaveBalanceDto) {
    return this.balances.adjust(user.organizationId, dto, user.userId);
  }

  @Post('balances/rollover/:year')
  @RequirePermissions(Permission.LEAVE_BALANCE_ADJUST)
  @Audited({
    action: AuditAction.UPDATE,
    entityType: 'LeaveEntitlement',
    summary: 'Year-end rollover',
  })
  @ApiOperation({ summary: 'Run year-end carry-over for a leave year' })
  async rollover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return { processed: await this.balances.rolloverYear(user.organizationId, year) };
  }

  // Leave taken before Cwork (CW-059). Set, not added, so an import can be
  // run again with corrected figures.

  @Get('balances/import/template')
  @RequirePermissions(Permission.LEAVE_BALANCE_ADJUST)
  @ApiQuery({ name: 'lang', required: false, enum: ['th', 'en'] })
  @ApiOperation({
    summary: 'The template for leave taken this year before Cwork (CW-059)',
    description:
      'An .xlsx listing every current employee on a row and every active leave type in a column.',
  })
  async priorLeaveTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const file = await this.priorLeave.template(user.organizationId, lang === 'en' ? 'en' : 'th');
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.send(file.content);
  }

  @Post('balances/import/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LEAVE_BALANCE_ADJUST)
  @UseInterceptors(FileInterceptor('file', { limits: IMPORT_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMPORT_BODY)
  @ApiOperation({
    summary: 'Check a leave-taken spreadsheet without importing it',
    description:
      'Returns each balance as it would be after the import, or every problem by row and column. Writes nothing.',
  })
  priorLeavePreview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.priorLeave.preview(user, requireUpload(file));
  }

  @Post('balances/import')
  @RequirePermissions(Permission.LEAVE_BALANCE_ADJUST)
  @UseInterceptors(FileInterceptor('file', { limits: IMPORT_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMPORT_BODY)
  @ApiOperation({
    summary: 'Import leave taken this year before Cwork (CW-059)',
    description:
      'Checks the file again, then sets every figure in one transaction, or none: a file with any problem is refused with 422. Audited as one event.',
  })
  priorLeaveImport(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.priorLeave.commit(user, requireUpload(file));
  }

  // ---------------------------------------------------------------- requests

  @Post('requests/preview')
  @RequirePermissions(Permission.LEAVE_REQUEST_SELF)
  @ApiOperation({ summary: 'Preview the cost of a leave request before submitting' })
  preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeaveRequestDto) {
    return this.leave.preview(user, dto);
  }

  @Post('requests')
  @RequirePermissions(Permission.LEAVE_REQUEST_SELF)
  @Audited({ action: AuditAction.CREATE, entityType: 'LeaveRequest' })
  @ApiOperation({ summary: 'Submit a leave request' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeaveRequestDto) {
    return this.leave.create(user, dto);
  }

  @Get('requests')
  @RequireAnyPermission(
    Permission.LEAVE_READ,
    Permission.LEAVE_READ_TEAM,
    Permission.LEAVE_READ_SELF,
  )
  @ApiOperation({ summary: 'List leave requests visible to the caller' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: LeaveRequestQueryDto) {
    return this.leave.list(user, query);
  }

  @Get('calendar')
  @RequireAnyPermission(
    Permission.LEAVE_READ,
    Permission.LEAVE_READ_TEAM,
    Permission.LEAVE_READ_SELF,
  )
  @ApiOperation({ summary: 'Who is away, for a date range' })
  calendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.leave.calendar(user, from, to, departmentId);
  }

  @Get('requests/:id')
  @RequireAnyPermission(
    Permission.LEAVE_READ,
    Permission.LEAVE_READ_TEAM,
    Permission.LEAVE_READ_SELF,
  )
  @ApiOperation({ summary: 'Leave request detail with approval trail' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.findOne(user, id);
  }

  @Post('requests/:id/submit')
  @RequirePermissions(Permission.LEAVE_REQUEST_SELF)
  @Audited({ action: AuditAction.UPDATE, entityType: 'LeaveRequest', summary: 'Draft submitted' })
  @ApiOperation({ summary: 'Submit a saved draft for approval' })
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.submitDraft(user, id);
  }

  @Post('requests/:id/cancel')
  @RequireAnyPermission(Permission.LEAVE_REQUEST_SELF, Permission.LEAVE_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'LeaveRequest', summary: 'Cancelled' })
  @ApiOperation({ summary: 'Cancel a leave request and return the days' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelLeaveRequestDto,
  ) {
    return this.leave.cancel(user, id, dto.reason);
  }
}
