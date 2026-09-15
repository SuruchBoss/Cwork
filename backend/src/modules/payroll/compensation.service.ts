import { Injectable } from '@nestjs/common';
import { AuditAction, EmploymentEventType, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { toDateOnly } from '../../core/utils/date.util';
import { AuditService } from '../audit/audit.service';
import type {
  CreateRecurringItemDto,
  SetCompensationDto,
  UpsertTaxProfileDto,
} from './dto/payroll.dto';

@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records a salary change.
   *
   * Compensation is effective-dated and append-only: the previous record is
   * closed the day before the new one starts, so historical payslips can always
   * be recomputed from the salary that actually applied at the time.
   */
  async setCompensation(user: AuthenticatedUser, dto: SetCompensationDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundError('Employee', dto.employeeId);

    const effectiveFrom = toDateOnly(dto.effectiveFrom);

    const duplicate = await this.prisma.employeeCompensation.findUnique({
      where: { employeeId_effectiveFrom: { employeeId: dto.employeeId, effectiveFrom } },
    });
    if (duplicate) {
      throw new BusinessRuleError(
        'COMPENSATION_ALREADY_EXISTS',
        'A compensation record already starts on that date',
      );
    }

    const previous = await this.prisma.employeeCompensation.findFirst({
      where: { employeeId: dto.employeeId, effectiveFrom: { lt: effectiveFrom } },
      orderBy: { effectiveFrom: 'desc' },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      if (previous && (previous.effectiveTo === null || previous.effectiveTo >= effectiveFrom)) {
        await tx.employeeCompensation.update({
          where: { id: previous.id },
          data: { effectiveTo: new Date(effectiveFrom.getTime() - 86_400_000) },
        });
      }

      const record = await tx.employeeCompensation.create({
        data: {
          employeeId: dto.employeeId,
          effectiveFrom,
          baseSalary: new Prisma.Decimal(dto.baseSalary),
          payFrequency: dto.payFrequency,
          isOvertimeEligible: dto.isOvertimeEligible,
          isSsoEligible: dto.isSsoEligible,
          pvdEmployeeRate: new Prisma.Decimal(dto.pvdEmployeeRate ?? 0),
          pvdEmployerRate: new Prisma.Decimal(dto.pvdEmployerRate ?? 0),
          reason: dto.reason,
          approvedById: user.userId,
        },
      });

      await tx.employmentEvent.create({
        data: {
          employeeId: dto.employeeId,
          type: EmploymentEventType.SALARY_CHANGE,
          effectiveDate: effectiveFrom,
          previousValue: previous ? { baseSalary: Number(previous.baseSalary) } : Prisma.DbNull,
          newValue: { baseSalary: dto.baseSalary } as Prisma.InputJsonValue,
          reason: dto.reason,
          recordedById: user.userId,
        },
      });

      return record;
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.UPDATE,
      entityType: 'EmployeeCompensation',
      entityId: created.id,
      summary: `Salary set effective ${dto.effectiveFrom}`,
      changes: {
        employeeId: dto.employeeId,
        from: previous ? Number(previous.baseSalary) : null,
        to: dto.baseSalary,
      },
    });

    return created;
  }

  async getCurrentCompensation(organizationId: string, employeeId: string, asOf = new Date()) {
    const date = toDateOnly(asOf);
    const record = await this.prisma.employeeCompensation.findFirst({
      where: {
        employeeId,
        employee: { organizationId },
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!record) throw new NotFoundError('EmployeeCompensation', employeeId);
    return record;
  }

  listCompensationHistory(organizationId: string, employeeId: string) {
    return this.prisma.employeeCompensation.findMany({
      where: { employeeId, employee: { organizationId } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  // ------------------------------------------------------------ recurring items

  listRecurringItems(organizationId: string, employeeId: string) {
    return this.prisma.employeeRecurringItem.findMany({
      where: { employeeId, employee: { organizationId } },
      orderBy: { effectiveFrom: 'desc' },
      include: { component: { select: { code: true, name: true, type: true } } },
    });
  }

  async addRecurringItem(user: AuthenticatedUser, dto: CreateRecurringItemDto) {
    const component = await this.prisma.payComponent.findFirst({
      where: { id: dto.componentId, organizationId: user.organizationId, isActive: true },
    });
    if (!component) throw new NotFoundError('PayComponent', dto.componentId);

    return this.prisma.employeeRecurringItem.create({
      data: {
        employeeId: dto.employeeId,
        componentId: dto.componentId,
        amount: new Prisma.Decimal(dto.amount),
        effectiveFrom: toDateOnly(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? toDateOnly(dto.effectiveTo) : null,
        note: dto.note,
      },
      include: { component: { select: { code: true, name: true, type: true } } },
    });
  }

  async endRecurringItem(organizationId: string, id: string, effectiveTo: string) {
    const item = await this.prisma.employeeRecurringItem.findFirst({
      where: { id, employee: { organizationId } },
    });
    if (!item) throw new NotFoundError('EmployeeRecurringItem', id);

    return this.prisma.employeeRecurringItem.update({
      where: { id },
      data: { effectiveTo: toDateOnly(effectiveTo) },
    });
  }

  // ------------------------------------------------------------- pay components

  listPayComponents(organizationId: string) {
    return this.prisma.payComponent.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ type: 'asc' }, { orderIndex: 'asc' }],
    });
  }

  // ---------------------------------------------------------------- tax profile

  async upsertTaxProfile(organizationId: string, dto: UpsertTaxProfileDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundError('Employee', dto.employeeId);

    if ((dto.childrenBorn2018OrLater ?? 0) > (dto.childrenCount ?? 0)) {
      throw new BusinessRuleError(
        'INVALID_CHILDREN_COUNT',
        'Children born 2018 or later cannot exceed the total number of children',
      );
    }

    const { employeeId, taxYear, ...values } = dto;
    const data = {
      spouseAllowance: values.spouseAllowance ?? false,
      childrenCount: values.childrenCount ?? 0,
      childrenBorn2018OrLater: values.childrenBorn2018OrLater ?? 0,
      parentCareCount: values.parentCareCount ?? 0,
      disabledCareCount: values.disabledCareCount ?? 0,
      lifeInsurancePremium: new Prisma.Decimal(values.lifeInsurancePremium ?? 0),
      healthInsurancePremium: new Prisma.Decimal(values.healthInsurancePremium ?? 0),
      parentHealthInsurancePremium: new Prisma.Decimal(values.parentHealthInsurancePremium ?? 0),
      rmfContribution: new Prisma.Decimal(values.rmfContribution ?? 0),
      ssfContribution: new Prisma.Decimal(values.ssfContribution ?? 0),
      mortgageInterest: new Prisma.Decimal(values.mortgageInterest ?? 0),
      donation: new Prisma.Decimal(values.donation ?? 0),
      educationDonation: new Prisma.Decimal(values.educationDonation ?? 0),
    };

    return this.prisma.employeeTaxProfile.upsert({
      where: { employeeId_taxYear: { employeeId, taxYear } },
      create: { employeeId, taxYear, ...data },
      update: data,
    });
  }

  getTaxProfile(organizationId: string, employeeId: string, taxYear: number) {
    return this.prisma.employeeTaxProfile.findFirst({
      where: { employeeId, taxYear, employee: { organizationId } },
    });
  }
}
