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
import { AuditAction, ExpenseClaimStatus } from '@prisma/client';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequireAnyPermission, RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { requireEmployeeId } from '../../core/security/employee-access';
import { BenefitsService } from './benefits.service';
import { CompensationService } from './compensation.service';
import {
  CreateBenefitPlanDto,
  CreateExpenseClaimDto,
  CreatePayrollPeriodDto,
  CreatePayrollRunDto,
  CreateRecurringItemDto,
  DecideExpenseClaimDto,
  EnrollBenefitDto,
  SetCompensationDto,
  UpsertTaxProfileDto,
} from './dto/payroll.dto';
import { ExpensesService } from './expenses.service';
import { PayrollService } from './payroll.service';

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly compensation: CompensationService,
  ) {}

  // -------------------------------------------------------------------- periods

  @Get('periods')
  @RequirePermissions(Permission.PAYROLL_READ)
  @ApiOperation({ summary: 'List payroll periods' })
  listPeriods(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.payroll.listPeriods(user.organizationId, year);
  }

  @Post('periods')
  @RequirePermissions(Permission.PAYROLL_RUN)
  @Audited({ action: AuditAction.CREATE, entityType: 'PayrollPeriod' })
  @ApiOperation({ summary: 'Create a payroll period' })
  createPeriod(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollPeriodDto) {
    return this.payroll.createPeriod(user.organizationId, dto);
  }

  @Patch('periods/:id/lock')
  @RequirePermissions(Permission.PAYROLL_RUN)
  @Audited({ action: AuditAction.UPDATE, entityType: 'PayrollPeriod', summary: 'Period locked' })
  @ApiOperation({ summary: 'Lock a period against further input changes' })
  lockPeriod(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.lockPeriod(user.organizationId, id);
  }

  // ----------------------------------------------------------------------- runs

  @Get('runs')
  @RequirePermissions(Permission.PAYROLL_READ)
  @ApiOperation({ summary: 'List payroll runs' })
  listRuns(@CurrentUser() user: AuthenticatedUser, @Query('periodId') periodId?: string) {
    return this.payroll.listRuns(user.organizationId, periodId);
  }

  @Get('runs/:id')
  @RequirePermissions(Permission.PAYROLL_READ)
  @ApiOperation({ summary: 'Payroll run with all payslips' })
  getRun(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.getRun(user.organizationId, id);
  }

  @Post('runs')
  @RequirePermissions(Permission.PAYROLL_RUN)
  @Audited({ action: AuditAction.CREATE, entityType: 'PayrollRun' })
  @ApiOperation({ summary: 'Create a payroll run' })
  createRun(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollRunDto) {
    return this.payroll.createRun(user, dto);
  }

  @Post('runs/:id/calculate')
  @RequirePermissions(Permission.PAYROLL_RUN)
  @Audited({ action: AuditAction.UPDATE, entityType: 'PayrollRun', summary: 'Payroll calculated' })
  @ApiOperation({ summary: 'Calculate every payslip in the run' })
  calculate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.calculateRun(user, id);
  }

  @Post('runs/:id/approve')
  @RequirePermissions(Permission.PAYROLL_APPROVE)
  @Audited({ action: AuditAction.APPROVE, entityType: 'PayrollRun' })
  @ApiOperation({
    summary: 'Approve a calculated run',
    description: 'Separation of duties: the preparer of a run cannot approve it.',
  })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.approveRun(user, id);
  }

  @Post('runs/:id/pay')
  @RequirePermissions(Permission.PAYROLL_APPROVE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'PayrollRun', summary: 'Payroll marked paid' })
  @ApiOperation({ summary: 'Mark paid: publish payslips and lock the period' })
  pay(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.markPaid(user, id);
  }

  @Post('runs/:id/cancel')
  @RequirePermissions(Permission.PAYROLL_RUN)
  @Audited({ action: AuditAction.UPDATE, entityType: 'PayrollRun', summary: 'Payroll cancelled' })
  @ApiOperation({ summary: 'Cancel an unpaid run' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.cancelRun(user, id);
  }

  // ------------------------------------------------------------------- payslips

  @Get('payslips/me')
  @RequirePermissions(Permission.PAYSLIP_READ_SELF)
  @ApiOperation({ summary: 'My published payslips' })
  myPayslips(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.payroll.listMyPayslips(requireEmployeeId(user), year);
  }

  @Get('payslips/:id')
  @RequireAnyPermission(Permission.PAYSLIP_READ_SELF, Permission.PAYROLL_READ)
  @ApiOperation({ summary: 'Payslip detail' })
  getPayslip(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.getPayslip(user, id, user.permissions.includes(Permission.PAYROLL_READ));
  }

  // --------------------------------------------------------------- compensation

  @Get('components')
  @RequirePermissions(Permission.COMPENSATION_READ)
  @ApiOperation({ summary: 'Pay components (earnings and deductions)' })
  listComponents(@CurrentUser() user: AuthenticatedUser) {
    return this.compensation.listPayComponents(user.organizationId);
  }

  @Get('compensation/:employeeId')
  @RequirePermissions(Permission.COMPENSATION_READ)
  @ApiOperation({ summary: 'Compensation history for an employee' })
  compensationHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.compensation.listCompensationHistory(user.organizationId, employeeId);
  }

  @Post('compensation')
  @RequirePermissions(Permission.COMPENSATION_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'EmployeeCompensation' })
  @ApiOperation({ summary: 'Set salary from an effective date' })
  setCompensation(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetCompensationDto) {
    return this.compensation.setCompensation(user, dto);
  }

  @Get('recurring-items/:employeeId')
  @RequirePermissions(Permission.COMPENSATION_READ)
  @ApiOperation({ summary: 'Standing allowances and deductions' })
  listRecurring(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.compensation.listRecurringItems(user.organizationId, employeeId);
  }

  @Post('recurring-items')
  @RequirePermissions(Permission.COMPENSATION_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'EmployeeRecurringItem' })
  @ApiOperation({ summary: 'Add a standing allowance or deduction' })
  addRecurring(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecurringItemDto) {
    return this.compensation.addRecurringItem(user, dto);
  }

  @Patch('recurring-items/:id/end')
  @RequirePermissions(Permission.COMPENSATION_MANAGE)
  @ApiOperation({ summary: 'End a standing item from a date' })
  endRecurring(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { effectiveTo: string },
  ) {
    return this.compensation.endRecurringItem(user.organizationId, id, body.effectiveTo);
  }

  // ---------------------------------------------------------------- tax profile

  @Get('tax-profile/:employeeId')
  @RequireAnyPermission(Permission.COMPENSATION_READ, Permission.PAYSLIP_READ_SELF)
  @ApiOperation({ summary: 'Tax allowances on file for a year' })
  getTaxProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.compensation.getTaxProfile(user.organizationId, employeeId, year);
  }

  @Post('tax-profile')
  @RequireAnyPermission(Permission.COMPENSATION_MANAGE, Permission.PAYSLIP_READ_SELF)
  @Audited({ action: AuditAction.UPDATE, entityType: 'EmployeeTaxProfile' })
  @ApiOperation({ summary: 'Declare tax allowances (ลดหย่อนภาษี)' })
  upsertTaxProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertTaxProfileDto) {
    // Employees may only file their own declaration.
    const employeeId = user.permissions.includes(Permission.COMPENSATION_MANAGE)
      ? dto.employeeId
      : requireEmployeeId(user);
    return this.compensation.upsertTaxProfile(user.organizationId, { ...dto, employeeId });
  }
}

@ApiTags('Benefits')
@ApiBearerAuth()
@Controller('benefits')
export class BenefitsController {
  constructor(
    private readonly benefits: BenefitsService,
    private readonly expenses: ExpensesService,
  ) {}

  @Get('plans')
  @RequirePermissions(Permission.BENEFIT_READ)
  @ApiOperation({ summary: 'List benefit plans' })
  listPlans(@CurrentUser() user: AuthenticatedUser) {
    return this.benefits.listPlans(user.organizationId);
  }

  @Post('plans')
  @RequirePermissions(Permission.BENEFIT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'BenefitPlan' })
  @ApiOperation({ summary: 'Create a benefit plan' })
  createPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBenefitPlanDto) {
    return this.benefits.createPlan(user.organizationId, dto);
  }

  @Get('me')
  @RequirePermissions(Permission.BENEFIT_READ)
  @ApiOperation({ summary: 'My benefits, eligibility and remaining limits' })
  async myBenefits(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    const employeeId = requireEmployeeId(user);
    const [plans, usage] = await Promise.all([
      this.benefits.listEligiblePlans(user.organizationId, employeeId),
      this.expenses.benefitUsage(
        user.organizationId,
        employeeId,
        year ?? new Date().getUTCFullYear(),
      ),
    ]);
    return { plans, usage };
  }

  @Get('enrollments/:employeeId')
  @RequirePermissions(Permission.BENEFIT_MANAGE)
  @ApiOperation({ summary: 'Enrollments for an employee' })
  listEnrollments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.benefits.listEnrollments(user.organizationId, employeeId);
  }

  @Post('enrollments')
  @RequirePermissions(Permission.BENEFIT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'BenefitEnrollment' })
  @ApiOperation({ summary: 'Enroll an employee in a plan' })
  enroll(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnrollBenefitDto) {
    return this.benefits.enroll(user.organizationId, dto);
  }

  @Patch('enrollments/:id/end')
  @RequirePermissions(Permission.BENEFIT_MANAGE)
  @ApiOperation({ summary: 'End an enrollment' })
  endEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { effectiveTo: string },
  ) {
    return this.benefits.endEnrollment(user.organizationId, id, body.effectiveTo);
  }
}

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post('claims')
  @RequirePermissions(Permission.EXPENSE_SUBMIT_SELF)
  @Audited({ action: AuditAction.CREATE, entityType: 'ExpenseClaim' })
  @ApiOperation({ summary: 'Submit an expense claim' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseClaimDto) {
    return this.expenses.create(user, dto);
  }

  @Get('claims')
  @RequireAnyPermission(Permission.EXPENSE_READ, Permission.EXPENSE_SUBMIT_SELF)
  @ApiOperation({ summary: 'List expense claims visible to the caller' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ExpenseClaimStatus,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expenses.list(user, { status, employeeId, from, to });
  }

  @Get('claims/:id')
  @RequireAnyPermission(Permission.EXPENSE_READ, Permission.EXPENSE_SUBMIT_SELF)
  @ApiOperation({ summary: 'Expense claim detail' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.findOne(user, id);
  }

  @Post('claims/:id/decide')
  @RequirePermissions(Permission.EXPENSE_MANAGE)
  @Audited({ action: AuditAction.APPROVE, entityType: 'ExpenseClaim' })
  @ApiOperation({ summary: 'Approve or reject a claim' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideExpenseClaimDto,
  ) {
    return this.expenses.decide(user, id, dto);
  }

  @Post('claims/:id/cancel')
  @RequirePermissions(Permission.EXPENSE_SUBMIT_SELF)
  @ApiOperation({ summary: 'Cancel my claim' })
  cancelClaim(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.cancel(user, id);
  }
}
