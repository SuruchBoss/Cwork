import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, OvertimeStatus, PunchType } from '@prisma/client';
import type { Request } from 'express';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequireAnyPermission, RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { requireEmployeeId } from '../../core/security/employee-access';
import { AttendanceService } from './attendance.service';
import {
  AttendanceQueryDto,
  CreateCorrectionDto,
  CreateOvertimeDto,
  DecideOvertimeDto,
  PunchDto,
} from './dto/attendance.dto';
import { OvertimeService } from './overtime.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('punch')
  @RequirePermissions(Permission.ATTENDANCE_CLOCK_SELF)
  @Audited({ action: AuditAction.CREATE, entityType: 'AttendancePunch' })
  @ApiOperation({
    summary: 'Record a clock in/out or break punch',
    description:
      'Send `clientPunchId` so an offline queue can retry safely — replays return the same result.',
  })
  punch(@CurrentUser() user: AuthenticatedUser, @Body() dto: PunchDto, @Req() req: Request) {
    return this.attendance.punch(user, dto, req.ip);
  }

  @Post('clock-in')
  @RequirePermissions(Permission.ATTENDANCE_CLOCK_SELF)
  @Audited({ action: AuditAction.CREATE, entityType: 'AttendancePunch', summary: 'Clock in' })
  @ApiOperation({ summary: 'Shorthand for a CLOCK_IN punch' })
  clockIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: PunchDto, @Req() req: Request) {
    return this.attendance.punch(user, { ...dto, type: PunchType.CLOCK_IN }, req.ip);
  }

  @Post('clock-out')
  @RequirePermissions(Permission.ATTENDANCE_CLOCK_SELF)
  @Audited({ action: AuditAction.CREATE, entityType: 'AttendancePunch', summary: 'Clock out' })
  @ApiOperation({ summary: 'Shorthand for a CLOCK_OUT punch' })
  clockOut(@CurrentUser() user: AuthenticatedUser, @Body() dto: PunchDto, @Req() req: Request) {
    return this.attendance.punch(user, { ...dto, type: PunchType.CLOCK_OUT }, req.ip);
  }

  @Get('today')
  @RequirePermissions(Permission.ATTENDANCE_READ_SELF)
  @ApiOperation({ summary: 'My attendance status for today' })
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.attendance.getToday(user);
  }

  @Get('days/:date')
  @RequirePermissions(Permission.ATTENDANCE_READ_SELF)
  @ApiOperation({ summary: 'My attendance for one date (yyyy-MM-dd)' })
  myDay(@CurrentUser() user: AuthenticatedUser, @Param('date') date: string) {
    return this.attendance.getDay(user, requireEmployeeId(user), date);
  }

  @Get('records')
  @RequireAnyPermission(
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_READ_TEAM,
    Permission.ATTENDANCE_READ_SELF,
  )
  @ApiOperation({ summary: 'Attendance records visible to the caller' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AttendanceQueryDto) {
    return this.attendance.list(user, query);
  }

  @Get('summary/me')
  @RequirePermissions(Permission.ATTENDANCE_READ_SELF)
  @ApiOperation({ summary: 'My monthly timesheet summary' })
  mySummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.attendance.monthlySummary(
      user.organizationId,
      requireEmployeeId(user),
      year,
      month,
    );
  }

  @Get('summary/:employeeId')
  @RequireAnyPermission(Permission.ATTENDANCE_READ, Permission.ATTENDANCE_READ_TEAM)
  @ApiOperation({ summary: 'Monthly timesheet summary for an employee' })
  employeeSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.attendance.monthlySummary(user.organizationId, employeeId, year, month);
  }

  // --------------------------------------------------------------- corrections

  @Post('corrections')
  @RequirePermissions(Permission.ATTENDANCE_READ_SELF)
  @Audited({ action: AuditAction.CREATE, entityType: 'AttendanceCorrection' })
  @ApiOperation({ summary: 'Request a correction to a punch' })
  requestCorrection(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCorrectionDto) {
    return this.attendance.requestCorrection(user, dto);
  }

  @Get('corrections')
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @ApiOperation({ summary: 'List correction requests' })
  listCorrections(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
  ) {
    return this.attendance.listCorrections(user.organizationId, status);
  }

  @Post('corrections/:id/decide')
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @Audited({ action: AuditAction.APPROVE, entityType: 'AttendanceCorrection' })
  @ApiOperation({ summary: 'Approve or reject a correction' })
  decideCorrection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT'; note?: string },
  ) {
    return this.attendance.decideCorrection(user, id, body.decision, body.note);
  }
}

@ApiTags('Overtime')
@ApiBearerAuth()
@Controller('overtime')
export class OvertimeController {
  constructor(private readonly overtime: OvertimeService) {}

  @Post('requests')
  @RequirePermissions(Permission.OVERTIME_REQUEST_SELF)
  @Audited({ action: AuditAction.CREATE, entityType: 'OvertimeRequest' })
  @ApiOperation({ summary: 'Request overtime' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOvertimeDto) {
    return this.overtime.create(user, dto);
  }

  @Get('requests')
  @RequireAnyPermission(
    Permission.OVERTIME_MANAGE,
    Permission.ATTENDANCE_READ_TEAM,
    Permission.OVERTIME_REQUEST_SELF,
  )
  @ApiOperation({ summary: 'List overtime requests' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: OvertimeStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.overtime.list(user, { status, from, to, employeeId });
  }

  @Get('requests/:id')
  @RequireAnyPermission(Permission.OVERTIME_MANAGE, Permission.OVERTIME_REQUEST_SELF)
  @ApiOperation({ summary: 'Overtime request detail' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.overtime.findOne(user, id);
  }

  @Post('requests/:id/decide')
  @RequirePermissions(Permission.OVERTIME_MANAGE)
  @Audited({ action: AuditAction.APPROVE, entityType: 'OvertimeRequest' })
  @ApiOperation({ summary: 'Approve or reject overtime' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideOvertimeDto,
  ) {
    return this.overtime.decide(user, id, dto);
  }

  @Post('requests/:id/cancel')
  @RequirePermissions(Permission.OVERTIME_REQUEST_SELF)
  @ApiOperation({ summary: 'Cancel my overtime request' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.overtime.cancel(user, id);
  }
}
