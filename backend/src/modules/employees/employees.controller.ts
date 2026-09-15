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
import { EmployeesService } from './employees.service';
import { OffboardingService } from './offboarding.service';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

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
