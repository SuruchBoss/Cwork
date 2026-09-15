import {
  Body,
  Controller,
  Get,
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
import { RequireAnyPermission, RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { requireEmployeeId } from '../employees/domain/employee-access';
import {
  AdjustLeaveBalanceDto,
  CancelLeaveRequestDto,
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  LeaveRequestQueryDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveService } from './leave.service';

@ApiTags('Leave')
@ApiBearerAuth()
@Controller('leave')
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly balances: LeaveBalanceService,
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
