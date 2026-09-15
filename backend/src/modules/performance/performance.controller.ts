import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, ReviewCycleStatus } from '@prisma/client';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequireAnyPermission, RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import {
  CalibrateReviewDto,
  CreateKpiGoalDto,
  CreateReviewCycleDto,
  KpiCheckInDto,
  SubmitReviewDto,
} from './dto/performance.dto';
import { PerformanceService } from './performance.service';

@ApiTags('Performance')
@ApiBearerAuth()
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  // -------------------------------------------------------------------- cycles

  @Get('cycles')
  @RequireAnyPermission(Permission.PERFORMANCE_READ, Permission.PERFORMANCE_READ_SELF)
  @ApiOperation({ summary: 'List review cycles' })
  listCycles(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: ReviewCycleStatus) {
    return this.performance.listCycles(user.organizationId, status);
  }

  @Post('cycles')
  @RequirePermissions(Permission.PERFORMANCE_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'ReviewCycle' })
  @ApiOperation({ summary: 'Create a review cycle' })
  createCycle(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReviewCycleDto) {
    return this.performance.createCycle(user.organizationId, dto);
  }

  @Patch('cycles/:id/status')
  @RequirePermissions(Permission.PERFORMANCE_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'ReviewCycle' })
  @ApiOperation({ summary: 'Advance a cycle through its stages' })
  updateCycleStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: ReviewCycleStatus },
  ) {
    return this.performance.updateCycleStatus(user.organizationId, id, body.status);
  }

  // --------------------------------------------------------------------- goals

  @Post('goals')
  @RequireAnyPermission(Permission.KPI_MANAGE_TEAM, Permission.PERFORMANCE_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'KpiGoal' })
  @ApiOperation({ summary: 'Set a KPI goal (weights must total 100 per cycle)' })
  createGoal(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateKpiGoalDto) {
    return this.performance.createGoal(user, dto);
  }

  @Get('cycles/:cycleId/goals')
  @RequireAnyPermission(
    Permission.PERFORMANCE_READ,
    Permission.PERFORMANCE_READ_SELF,
    Permission.KPI_MANAGE_TEAM,
  )
  @ApiOperation({ summary: 'KPI goals and running score for a cycle' })
  listGoals(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.performance.listGoals(user, cycleId, employeeId);
  }

  @Post('goals/:id/check-in')
  @RequireAnyPermission(Permission.PERFORMANCE_READ_SELF, Permission.KPI_MANAGE_TEAM)
  @Audited({ action: AuditAction.CREATE, entityType: 'KpiCheckIn' })
  @ApiOperation({ summary: 'Record progress against a KPI goal' })
  checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KpiCheckInDto,
  ) {
    return this.performance.checkIn(user, id, dto);
  }

  @Get('cycles/:cycleId/team-progress')
  @RequirePermissions(Permission.KPI_MANAGE_TEAM)
  @ApiOperation({ summary: 'KPI progress across my direct reports' })
  teamProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ) {
    return this.performance.teamProgress(user, cycleId);
  }

  // ------------------------------------------------------------------- reviews

  @Post('reviews')
  @RequirePermissions(Permission.REVIEW_SUBMIT)
  @Audited({ action: AuditAction.CREATE, entityType: 'PerformanceReview' })
  @ApiOperation({ summary: 'Submit a self, manager or peer review' })
  submitReview(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitReviewDto) {
    return this.performance.submitReview(user, dto);
  }

  @Get('reviews/mine')
  @RequirePermissions(Permission.PERFORMANCE_READ_SELF)
  @ApiOperation({ summary: 'Reviews written about me' })
  myReviews(@CurrentUser() user: AuthenticatedUser) {
    return this.performance.myReviews(user);
  }

  @Get('cycles/:cycleId/reviews')
  @RequirePermissions(Permission.PERFORMANCE_READ)
  @ApiOperation({ summary: 'Reviews in a cycle' })
  listReviews(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.performance.listReviews(user, cycleId, employeeId);
  }

  @Post('reviews/:id/acknowledge')
  @RequirePermissions(Permission.PERFORMANCE_READ_SELF)
  @Audited({ action: AuditAction.UPDATE, entityType: 'PerformanceReview', summary: 'Acknowledged' })
  @ApiOperation({ summary: 'Acknowledge my review' })
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { comment?: string },
  ) {
    return this.performance.acknowledgeReview(user, id, body?.comment);
  }

  @Post('reviews/:id/calibrate')
  @RequirePermissions(Permission.REVIEW_CALIBRATE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'PerformanceReview', summary: 'Calibrated' })
  @ApiOperation({ summary: 'Adjust a grade after the calibration meeting' })
  calibrate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CalibrateReviewDto,
  ) {
    return this.performance.calibrate(user, id, dto);
  }
}
