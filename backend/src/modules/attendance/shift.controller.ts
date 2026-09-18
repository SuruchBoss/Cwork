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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequireAnyPermission, RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import {
  BulkScheduleAssignmentDto,
  CreateScheduleAssignmentDto,
  CreateShiftDto,
  CreateWorkScheduleDto,
  RosterQueryDto,
  SetRosterDayDto,
  UpdateShiftDto,
  UpdateWorkScheduleDto,
} from './dto/shift.dto';
import { ShiftService } from './shift.service';

/** Anyone who can build a roster, or read attendance, may read the definitions. */
const READ_ROSTER = [
  Permission.SHIFT_MANAGE,
  Permission.ATTENDANCE_READ,
  Permission.ATTENDANCE_READ_TEAM,
] as const;

@ApiTags('Shifts & Roster')
@ApiBearerAuth()
@Controller()
export class ShiftController {
  constructor(private readonly service: ShiftService) {}

  // ------------------------------------------------------------------- shifts

  @Get('shifts')
  @RequireAnyPermission(...READ_ROSTER)
  @ApiOperation({ summary: 'Shift definitions in this organisation' })
  listShifts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.listShifts(user.organizationId, includeInactive === 'true');
  }

  @Post('shifts')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'Shift' })
  @ApiOperation({ summary: 'Create a shift' })
  createShift(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShiftDto) {
    return this.service.createShift(user.organizationId, dto);
  }

  @Patch('shifts/:id')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'Shift' })
  @ApiOperation({ summary: 'Update a shift' })
  updateShift(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.service.updateShift(user.organizationId, id, dto);
  }

  @Delete('shifts/:id')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: AuditAction.DELETE, entityType: 'Shift' })
  @ApiOperation({ summary: 'Deactivate a shift' })
  deleteShift(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deactivateShift(user.organizationId, id);
  }

  // ---------------------------------------------------------- work schedules

  @Get('work-schedules')
  @RequireAnyPermission(...READ_ROSTER)
  @ApiOperation({ summary: 'Weekly schedule patterns' })
  listSchedules(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.listWorkSchedules(user.organizationId, includeInactive === 'true');
  }

  @Post('work-schedules')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'WorkSchedule' })
  @ApiOperation({ summary: 'Create a weekly schedule' })
  createSchedule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWorkScheduleDto) {
    return this.service.createWorkSchedule(user.organizationId, dto);
  }

  @Patch('work-schedules/:id')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'WorkSchedule' })
  @ApiOperation({ summary: 'Update a weekly schedule' })
  updateSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkScheduleDto,
  ) {
    return this.service.updateWorkSchedule(user.organizationId, id, dto);
  }

  @Delete('work-schedules/:id')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: AuditAction.DELETE, entityType: 'WorkSchedule' })
  @ApiOperation({ summary: 'Deactivate a weekly schedule' })
  deleteSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deactivateWorkSchedule(user.organizationId, id);
  }

  // ----------------------------------------------------- schedule assignments

  @Get('schedule-assignments')
  @RequireAnyPermission(...READ_ROSTER)
  @ApiOperation({ summary: 'Schedule assignments for the caller’s visible employees' })
  listAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.listScheduleAssignments(user, employeeId);
  }

  @Post('schedule-assignments')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'ScheduleAssignment' })
  @ApiOperation({ summary: 'Assign a schedule to an employee over a date range' })
  assignSchedule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateScheduleAssignmentDto) {
    return this.service.createScheduleAssignment(user, dto);
  }

  @Post('schedule-assignments/bulk')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'ScheduleAssignment' })
  @ApiOperation({ summary: 'Assign a schedule to many employees, a department or a location' })
  bulkAssign(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkScheduleAssignmentDto) {
    return this.service.bulkAssignSchedule(user, dto);
  }

  @Delete('schedule-assignments/:id')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: AuditAction.DELETE, entityType: 'ScheduleAssignment' })
  @ApiOperation({ summary: 'Remove a schedule assignment' })
  deleteAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteScheduleAssignment(user, id);
  }

  // ------------------------------------------------------------- roster edits

  @Get('roster')
  @RequireAnyPermission(...READ_ROSTER)
  @ApiOperation({ summary: 'Who is on which shift each day, for the calendar view' })
  roster(@CurrentUser() user: AuthenticatedUser, @Query() query: RosterQueryDto) {
    return this.service.getRoster(user, query);
  }

  @Post('roster')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'ShiftAssignment' })
  @ApiOperation({ summary: 'Set or replace one employee’s shift for one day' })
  setRosterDay(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetRosterDayDto) {
    return this.service.setRosterDay(user, dto);
  }

  @Delete('roster/:id')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: AuditAction.DELETE, entityType: 'ShiftAssignment' })
  @ApiOperation({ summary: 'Remove a per-day roster override' })
  deleteRosterDay(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRosterDay(user, id);
  }
}
