import { Injectable } from '@nestjs/common';
import { KpiGoalStatus, Prisma, ReviewCycleStatus, ReviewStatus, ReviewType } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { Permission } from '../../core/security/permissions';
import { toDateOnly } from '../../core/utils/date.util';
import { employeeVisibilityFilter, requireEmployeeId } from '../employees/domain/employee-access';
import { NotificationsService } from '../notifications/notifications.service';
import {
  computeAchievement,
  computeCompetencyScore,
  computeKpiScore,
  computeOverallScore,
  resolveGrade,
  type RatingBand,
} from './domain/kpi-scoring';
import type {
  CalibrateReviewDto,
  CreateKpiGoalDto,
  CreateReviewCycleDto,
  KpiCheckInDto,
  SubmitReviewDto,
} from './dto/performance.dto';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------- cycles

  listCycles(organizationId: string, status?: ReviewCycleStatus) {
    return this.prisma.reviewCycle.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      orderBy: { periodStart: 'desc' },
      include: { _count: { select: { goals: true, reviews: true } } },
    });
  }

  createCycle(organizationId: string, dto: CreateReviewCycleDto) {
    const kpiWeight = dto.kpiWeight ?? 70;
    const competencyWeight = dto.competencyWeight ?? 30;

    if (kpiWeight + competencyWeight !== 100) {
      throw new BusinessRuleError(
        'INVALID_CYCLE_WEIGHTS',
        'kpiWeight and competencyWeight must total 100',
      );
    }

    return this.prisma.reviewCycle.create({
      data: {
        organizationId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        periodStart: toDateOnly(dto.periodStart),
        periodEnd: toDateOnly(dto.periodEnd),
        goalSettingDue: dto.goalSettingDue ? toDateOnly(dto.goalSettingDue) : null,
        selfReviewDue: dto.selfReviewDue ? toDateOnly(dto.selfReviewDue) : null,
        managerReviewDue: dto.managerReviewDue ? toDateOnly(dto.managerReviewDue) : null,
        kpiWeight,
        competencyWeight,
        ratingScale: (dto.ratingScale ?? DEFAULT_RATING_SCALE) as unknown as Prisma.InputJsonValue,
        includeSelfReview: dto.includeSelfReview,
      },
    });
  }

  async updateCycleStatus(organizationId: string, cycleId: string, status: ReviewCycleStatus) {
    const cycle = await this.requireCycle(organizationId, cycleId);
    return this.prisma.reviewCycle.update({ where: { id: cycle.id }, data: { status } });
  }

  // --------------------------------------------------------------------- goals

  async createGoal(user: AuthenticatedUser, dto: CreateKpiGoalDto) {
    await this.requireCycle(user.organizationId, dto.cycleId);
    await this.assertCanManageEmployee(user, dto.employeeId);

    const existing = await this.prisma.kpiGoal.findMany({
      where: {
        cycleId: dto.cycleId,
        employeeId: dto.employeeId,
        status: { not: KpiGoalStatus.CANCELLED },
      },
      select: { weight: true },
    });

    const totalWeight = existing.reduce((acc, g) => acc + Number(g.weight), dto.weight);
    if (totalWeight > 100) {
      throw new BusinessRuleError(
        'KPI_WEIGHT_EXCEEDED',
        `Goal weights for this cycle would total ${totalWeight}%, which exceeds 100%`,
        { currentTotal: totalWeight - dto.weight, requested: dto.weight },
      );
    }

    return this.prisma.kpiGoal.create({
      data: {
        cycleId: dto.cycleId,
        employeeId: dto.employeeId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        weight: new Prisma.Decimal(dto.weight),
        unit: dto.unit,
        direction: dto.direction,
        baselineValue:
          dto.baselineValue !== undefined ? new Prisma.Decimal(dto.baselineValue) : null,
        targetValue: new Prisma.Decimal(dto.targetValue),
        stretchValue: dto.stretchValue !== undefined ? new Prisma.Decimal(dto.stretchValue) : null,
        dueDate: dto.dueDate ? toDateOnly(dto.dueDate) : null,
        status: KpiGoalStatus.ACTIVE,
        orderIndex: existing.length,
      },
    });
  }

  async listGoals(user: AuthenticatedUser, cycleId: string, employeeId?: string) {
    const targetEmployeeId = employeeId ?? requireEmployeeId(user);
    if (targetEmployeeId !== user.employeeId) {
      await this.assertCanViewEmployee(user, targetEmployeeId);
    }

    const goals = await this.prisma.kpiGoal.findMany({
      where: { cycleId, employeeId: targetEmployeeId },
      orderBy: { orderIndex: 'asc' },
      include: { checkIns: { orderBy: { recordedAt: 'desc' }, take: 5 } },
    });

    const summary = computeKpiScore(
      goals.map((g) => ({
        weight: Number(g.weight),
        achievement: g.achievement ? Number(g.achievement) : null,
      })),
    );

    return { goals, summary };
  }

  /** Records progress and recomputes the goal's achievement. */
  async checkIn(user: AuthenticatedUser, goalId: string, dto: KpiCheckInDto) {
    const goal = await this.prisma.kpiGoal.findFirst({
      where: { id: goalId, cycle: { organizationId: user.organizationId } },
    });
    if (!goal) throw new NotFoundError('KpiGoal', goalId);

    const isOwner = goal.employeeId === user.employeeId;
    if (!isOwner) await this.assertCanManageEmployee(user, goal.employeeId);

    const achievement = computeAchievement({
      direction: goal.direction,
      targetValue: Number(goal.targetValue),
      actualValue: dto.value,
      baselineValue: goal.baselineValue ? Number(goal.baselineValue) : null,
    });

    const weightedScore = achievement
      ? achievement.times(Number(goal.weight)).dividedBy(100).toDecimalPlaces(2)
      : null;

    await this.prisma.$transaction([
      this.prisma.kpiCheckIn.create({
        data: {
          goalId,
          value: new Prisma.Decimal(dto.value),
          note: dto.note,
          evidenceFileIds: dto.evidenceFileIds ?? [],
          recordedById: user.userId,
        },
      }),
      this.prisma.kpiGoal.update({
        where: { id: goalId },
        data: {
          actualValue: new Prisma.Decimal(dto.value),
          achievement: achievement ? new Prisma.Decimal(achievement.toFixed(2)) : null,
          weightedScore: weightedScore ? new Prisma.Decimal(weightedScore.toFixed(2)) : null,
        },
      }),
    ]);

    return this.prisma.kpiGoal.findUniqueOrThrow({
      where: { id: goalId },
      include: { checkIns: { orderBy: { recordedAt: 'desc' }, take: 10 } },
    });
  }

  /** Team KPI dashboard for a manager. */
  async teamProgress(user: AuthenticatedUser, cycleId: string) {
    const managerEmployeeId = requireEmployeeId(user);

    const reports = await this.prisma.employee.findMany({
      where: { managerId: managerEmployeeId, deletedAt: null },
      select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true },
    });

    return Promise.all(
      reports.map(async (employee) => {
        const goals = await this.prisma.kpiGoal.findMany({
          where: { cycleId, employeeId: employee.id },
          select: { weight: true, achievement: true, status: true },
        });

        const summary = computeKpiScore(
          goals.map((g) => ({
            weight: Number(g.weight),
            achievement: g.achievement ? Number(g.achievement) : null,
          })),
        );

        return {
          employee,
          goalCount: goals.length,
          ...summary,
          weightedScore: summary.weightedScore.toNumber(),
        };
      }),
    );
  }

  // ------------------------------------------------------------------- reviews

  /**
   * Submits a review and computes the resulting score.
   *
   * KPI achievement is read from the goals, not re-entered by the reviewer, so
   * the number on the review always matches the tracked evidence.
   */
  async submitReview(user: AuthenticatedUser, dto: SubmitReviewDto) {
    const reviewerEmployeeId = requireEmployeeId(user);
    const cycle = await this.requireCycle(user.organizationId, dto.cycleId);

    if (dto.type === ReviewType.SELF && dto.employeeId !== reviewerEmployeeId) {
      throw new BusinessRuleError('INVALID_SELF_REVIEW', 'A self review must be about yourself');
    }
    if (dto.type === ReviewType.MANAGER) {
      const subject = await this.prisma.employee.findUnique({
        where: { id: dto.employeeId },
        select: { managerId: true },
      });
      const canOverride = user.permissions.includes(Permission.PERFORMANCE_MANAGE);
      if (subject?.managerId !== reviewerEmployeeId && !canOverride) {
        throw new BusinessRuleError(
          'NOT_THEIR_MANAGER',
          'Only the employee’s manager can submit a manager review',
        );
      }
    }

    const goals = await this.prisma.kpiGoal.findMany({
      where: {
        cycleId: dto.cycleId,
        employeeId: dto.employeeId,
        status: { not: KpiGoalStatus.CANCELLED },
      },
      select: { weight: true, achievement: true },
    });

    const kpiResult = computeKpiScore(
      goals.map((g) => ({
        weight: Number(g.weight),
        achievement: g.achievement ? Number(g.achievement) : null,
      })),
    );
    const kpiScore = kpiResult.scoredGoals > 0 ? kpiResult.weightedScore : null;

    const competencyScore = dto.competencyScores?.length
      ? computeCompetencyScore(
          dto.competencyScores.map((c) => ({ weight: c.weight, score: c.score })),
        )
      : null;

    const overallScore = computeOverallScore({
      kpiScore,
      competencyScore,
      kpiWeight: cycle.kpiWeight,
      competencyWeight: cycle.competencyWeight,
    });

    const grade = resolveGrade(overallScore, (cycle.ratingScale as unknown as RatingBand[]) ?? []);

    const review = await this.prisma.$transaction(async (tx) => {
      const submitted = await tx.performanceReview.upsert({
        where: {
          cycleId_employeeId_reviewerEmployeeId_type: {
            cycleId: dto.cycleId,
            employeeId: dto.employeeId,
            reviewerEmployeeId,
            type: dto.type,
          },
        },
        create: {
          cycleId: dto.cycleId,
          employeeId: dto.employeeId,
          reviewerEmployeeId,
          type: dto.type,
          status: ReviewStatus.SUBMITTED,
          kpiScore: kpiScore ? new Prisma.Decimal(kpiScore.toFixed(2)) : null,
          competencyScore: competencyScore ? new Prisma.Decimal(competencyScore.toFixed(2)) : null,
          overallScore: overallScore ? new Prisma.Decimal(overallScore.toFixed(2)) : null,
          grade,
          strengths: dto.strengths,
          improvements: dto.improvements,
          developmentPlan: dto.developmentPlan,
          managerComment: dto.managerComment,
          employeeComment: dto.employeeComment,
          submittedAt: new Date(),
          competencyScores: {
            create: (dto.competencyScores ?? []).map((c, index) => ({
              competency: c.competency,
              weight: new Prisma.Decimal(c.weight),
              score: new Prisma.Decimal(c.score),
              comment: c.comment,
              orderIndex: index,
            })),
          },
        },
        update: {
          status: ReviewStatus.SUBMITTED,
          kpiScore: kpiScore ? new Prisma.Decimal(kpiScore.toFixed(2)) : null,
          competencyScore: competencyScore ? new Prisma.Decimal(competencyScore.toFixed(2)) : null,
          overallScore: overallScore ? new Prisma.Decimal(overallScore.toFixed(2)) : null,
          grade,
          strengths: dto.strengths,
          improvements: dto.improvements,
          developmentPlan: dto.developmentPlan,
          managerComment: dto.managerComment,
          employeeComment: dto.employeeComment,
          submittedAt: new Date(),
          competencyScores: {
            deleteMany: {},
            create: (dto.competencyScores ?? []).map((c, index) => ({
              competency: c.competency,
              weight: new Prisma.Decimal(c.weight),
              score: new Prisma.Decimal(c.score),
              comment: c.comment,
              orderIndex: index,
            })),
          },
        },
        include: { competencyScores: true },
      });

      // A manager review the subject is never told about is the one thing this
      // feature must not do, so the telling commits with the review.
      if (dto.type === ReviewType.MANAGER) {
        const subject = await tx.employee.findUnique({
          where: { id: dto.employeeId },
          select: { userId: true },
        });

        if (subject?.userId) {
          await this.notifications.notifyIn(tx, user.organizationId, subject.userId, {
            type: 'performance.review.submitted',
            title: 'ผลการประเมินพร้อมให้รับทราบ',
            body: `รอบ ${cycle.name} — กรุณาเข้าดูและรับทราบผลการประเมิน`,
            data: { reviewId: submitted.id, cycleId: cycle.id },
          });
        }
      }

      return submitted;
    });

    return review;
  }

  async acknowledgeReview(user: AuthenticatedUser, reviewId: string, comment?: string) {
    const employeeId = requireEmployeeId(user);
    const review = await this.prisma.performanceReview.findFirst({
      where: { id: reviewId, employeeId, cycle: { organizationId: user.organizationId } },
    });
    if (!review) throw new NotFoundError('PerformanceReview', reviewId);

    return this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: {
        status: ReviewStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        employeeComment: comment ?? review.employeeComment,
      },
    });
  }

  async calibrate(user: AuthenticatedUser, reviewId: string, dto: CalibrateReviewDto) {
    const review = await this.prisma.performanceReview.findFirst({
      where: { id: reviewId, cycle: { organizationId: user.organizationId } },
    });
    if (!review) throw new NotFoundError('PerformanceReview', reviewId);

    return this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: {
        calibratedGrade: dto.calibratedGrade,
        status: ReviewStatus.CALIBRATED,
        managerComment: dto.note ?? review.managerComment,
      },
    });
  }

  async listReviews(user: AuthenticatedUser, cycleId: string, employeeId?: string) {
    return this.prisma.performanceReview.findMany({
      where: {
        cycleId,
        cycle: { organizationId: user.organizationId },
        employee: employeeVisibilityFilter(user),
        ...(employeeId ? { employeeId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true } },
        reviewer: { select: { id: true, firstNameTh: true, lastNameTh: true } },
        competencyScores: { orderBy: { orderIndex: 'asc' } },
      },
    });
  }

  async myReviews(user: AuthenticatedUser) {
    const employeeId = requireEmployeeId(user);
    return this.prisma.performanceReview.findMany({
      where: {
        employeeId,
        status: {
          in: [
            ReviewStatus.SUBMITTED,
            ReviewStatus.ACKNOWLEDGED,
            ReviewStatus.CALIBRATED,
            ReviewStatus.CLOSED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        cycle: { select: { id: true, name: true, periodStart: true, periodEnd: true } },
        reviewer: { select: { firstNameTh: true, lastNameTh: true } },
        competencyScores: { orderBy: { orderIndex: 'asc' } },
      },
    });
  }

  // ------------------------------------------------------------------ internals

  private async requireCycle(organizationId: string, cycleId: string) {
    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: cycleId, organizationId },
    });
    if (!cycle) throw new NotFoundError('ReviewCycle', cycleId);
    return cycle;
  }

  private async assertCanManageEmployee(
    user: AuthenticatedUser,
    employeeId: string,
  ): Promise<void> {
    if (user.permissions.includes(Permission.PERFORMANCE_MANAGE)) return;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: user.organizationId },
      select: { managerId: true },
    });
    if (!employee) throw new NotFoundError('Employee', employeeId);

    if (employee.managerId !== user.employeeId) {
      throw new BusinessRuleError(
        'NOT_YOUR_REPORT',
        'You can only manage KPIs for your own direct reports',
      );
    }
  }

  private async assertCanViewEmployee(user: AuthenticatedUser, employeeId: string): Promise<void> {
    const visible = await this.prisma.employee.findFirst({
      where: { AND: [employeeVisibilityFilter(user), { id: employeeId }] },
      select: { id: true },
    });
    if (!visible) throw new NotFoundError('Employee', employeeId);
  }
}

const DEFAULT_RATING_SCALE = [
  { grade: 'A', min: 90, label: 'ดีเยี่ยม' },
  { grade: 'B', min: 75, label: 'ดี' },
  { grade: 'C', min: 60, label: 'ตามเป้าหมาย' },
  { grade: 'D', min: 40, label: 'ต้องปรับปรุง' },
  { grade: 'E', min: 0, label: 'ไม่ผ่านเกณฑ์' },
];
