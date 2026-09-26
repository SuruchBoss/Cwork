// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { BenefitEnrollmentStatus, EmploymentType, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { monthsOfService, toDateOnly } from '../../core/utils/date.util';
import type {
  CreateBenefitPlanDto,
  EnrollBenefitDto,
  UpdateBenefitPlanDto,
} from './dto/payroll.dto';

interface EligibilityRule {
  minServiceMonths?: number;
  employmentTypes?: EmploymentType[];
  departmentIds?: string[];
  positionLevels?: number[];
}

@Injectable()
export class BenefitsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Plans with both their lifetime enrollment total and the count of *active*
   * enrollments — the latter is what the next payroll run actually costs
   * against, so the console can show what each plan adds to the run.
   */
  async listPlans(organizationId: string, includeInactive = false) {
    const plans = await this.prisma.benefitPlan.findMany({
      where: { organizationId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { enrollments: true } } },
    });

    const active = await this.prisma.benefitEnrollment.groupBy({
      by: ['planId'],
      where: { plan: { organizationId }, status: BenefitEnrollmentStatus.ACTIVE },
      _count: true,
    });
    const activeByPlan = new Map(active.map((row) => [row.planId, row._count]));

    return plans.map((plan) => ({ ...plan, activeEnrollments: activeByPlan.get(plan.id) ?? 0 }));
  }

  createPlan(organizationId: string, dto: CreateBenefitPlanDto) {
    return this.prisma.benefitPlan.create({
      data: {
        ...dto,
        organizationId,
        coverageAmount:
          dto.coverageAmount !== undefined ? new Prisma.Decimal(dto.coverageAmount) : null,
        employeeCostPerPeriod: new Prisma.Decimal(dto.employeeCostPerPeriod ?? 0),
        employerCostPerPeriod: new Prisma.Decimal(dto.employerCostPerPeriod ?? 0),
        annualLimit: dto.annualLimit !== undefined ? new Prisma.Decimal(dto.annualLimit) : null,
        eligibilityRule: (dto.eligibilityRule ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async updatePlan(organizationId: string, id: string, dto: UpdateBenefitPlanDto) {
    const existing = await this.prisma.benefitPlan.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundError('BenefitPlan', id);

    return this.prisma.benefitPlan.update({
      where: { id },
      data: {
        ...dto,
        coverageAmount:
          dto.coverageAmount !== undefined ? new Prisma.Decimal(dto.coverageAmount) : undefined,
        employeeCostPerPeriod:
          dto.employeeCostPerPeriod !== undefined
            ? new Prisma.Decimal(dto.employeeCostPerPeriod)
            : undefined,
        employerCostPerPeriod:
          dto.employerCostPerPeriod !== undefined
            ? new Prisma.Decimal(dto.employerCostPerPeriod)
            : undefined,
        annualLimit:
          dto.annualLimit !== undefined ? new Prisma.Decimal(dto.annualLimit) : undefined,
        eligibilityRule: dto.eligibilityRule
          ? (dto.eligibilityRule as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  /** Deactivates rather than deletes: a plan may have live and historical enrollments. */
  async deactivatePlan(organizationId: string, id: string): Promise<void> {
    const result = await this.prisma.benefitPlan.updateMany({
      where: { id, organizationId },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundError('BenefitPlan', id);
  }

  /** Plans this employee is eligible for, with their enrollment state. */
  async listEligiblePlans(organizationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId, deletedAt: null },
      select: {
        id: true,
        hireDate: true,
        employmentType: true,
        departmentId: true,
        position: { select: { level: true } },
      },
    });
    if (!employee) throw new NotFoundError('Employee', employeeId);

    const [plans, enrollments] = await Promise.all([
      this.prisma.benefitPlan.findMany({ where: { organizationId, isActive: true } }),
      this.prisma.benefitEnrollment.findMany({ where: { employeeId } }),
    ]);

    const byPlan = new Map(enrollments.map((e) => [e.planId, e]));

    return plans.map((plan) => {
      const eligibility = this.checkEligibility(plan.eligibilityRule as EligibilityRule, employee);
      return {
        plan,
        isEligible: eligibility.eligible,
        ineligibleReason: eligibility.reason,
        enrollment: byPlan.get(plan.id) ?? null,
      };
    });
  }

  async enroll(organizationId: string, dto: EnrollBenefitDto) {
    const plan = await this.prisma.benefitPlan.findFirst({
      where: { id: dto.planId, organizationId, isActive: true },
    });
    if (!plan) throw new NotFoundError('BenefitPlan', dto.planId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId, deletedAt: null },
      select: {
        id: true,
        hireDate: true,
        employmentType: true,
        departmentId: true,
        position: { select: { level: true } },
      },
    });
    if (!employee) throw new NotFoundError('Employee', dto.employeeId);

    const eligibility = this.checkEligibility(plan.eligibilityRule as EligibilityRule, employee);
    if (!eligibility.eligible) {
      throw new BusinessRuleError('NOT_ELIGIBLE_FOR_BENEFIT', eligibility.reason ?? 'Not eligible');
    }

    if (dto.dependentIds?.length && !plan.allowsDependents) {
      throw new BusinessRuleError(
        'DEPENDENTS_NOT_ALLOWED',
        `${plan.name} does not cover dependents`,
      );
    }

    const active = await this.prisma.benefitEnrollment.findFirst({
      where: {
        employeeId: dto.employeeId,
        planId: dto.planId,
        status: BenefitEnrollmentStatus.ACTIVE,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: toDateOnly(dto.effectiveFrom) } }],
      },
    });
    if (active) {
      throw new BusinessRuleError('ALREADY_ENROLLED', `Already enrolled in ${plan.name}`);
    }

    return this.prisma.benefitEnrollment.create({
      data: {
        employeeId: dto.employeeId,
        planId: dto.planId,
        status: BenefitEnrollmentStatus.ACTIVE,
        effectiveFrom: toDateOnly(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? toDateOnly(dto.effectiveTo) : null,
        dependentIds: dto.dependentIds ?? [],
      },
      include: { plan: true },
    });
  }

  async endEnrollment(organizationId: string, enrollmentId: string, effectiveTo: string) {
    const enrollment = await this.prisma.benefitEnrollment.findFirst({
      where: { id: enrollmentId, employee: { organizationId } },
    });
    if (!enrollment) throw new NotFoundError('BenefitEnrollment', enrollmentId);

    return this.prisma.benefitEnrollment.update({
      where: { id: enrollmentId },
      data: { status: BenefitEnrollmentStatus.ENDED, effectiveTo: toDateOnly(effectiveTo) },
    });
  }

  listEnrollments(organizationId: string, employeeId: string) {
    return this.prisma.benefitEnrollment.findMany({
      where: { employeeId, employee: { organizationId } },
      orderBy: { effectiveFrom: 'desc' },
      include: { plan: true },
    });
  }

  /** Returns a reason, not just a boolean, so the UI can explain the refusal. */
  private checkEligibility(
    rule: EligibilityRule | null,
    employee: {
      hireDate: Date;
      employmentType: EmploymentType;
      departmentId: string | null;
      position: { level: number } | null;
    },
  ): { eligible: boolean; reason?: string } {
    if (!rule || Object.keys(rule).length === 0) return { eligible: true };

    if (rule.minServiceMonths !== undefined) {
      const served = monthsOfService(employee.hireDate);
      if (served < rule.minServiceMonths) {
        return {
          eligible: false,
          reason: `ต้องมีอายุงานอย่างน้อย ${rule.minServiceMonths} เดือน (ปัจจุบัน ${served} เดือน)`,
        };
      }
    }

    if (rule.employmentTypes?.length && !rule.employmentTypes.includes(employee.employmentType)) {
      return { eligible: false, reason: 'ประเภทการจ้างงานไม่เข้าเกณฑ์' };
    }

    if (
      rule.departmentIds?.length &&
      (!employee.departmentId || !rule.departmentIds.includes(employee.departmentId))
    ) {
      return { eligible: false, reason: 'ไม่อยู่ในแผนกที่กำหนด' };
    }

    if (
      rule.positionLevels?.length &&
      (!employee.position || !rule.positionLevels.includes(employee.position.level))
    ) {
      return { eligible: false, reason: 'ระดับตำแหน่งไม่เข้าเกณฑ์' };
    }

    return { eligible: true };
  }
}
