// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { ApplicationStage, InterviewStatus, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { computeScorecardScore } from './domain/assessment-grader';
import type { ScheduleInterviewDto, SubmitScorecardDto } from './dto/recruitment.dto';

/**
 * Scheduling interviews and recording what the panel thought of the candidate.
 */
@Injectable()
export class InterviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async scheduleInterview(organizationId: string, dto: ScheduleInterviewDto) {
    const application = await this.prisma.application.findFirst({
      where: { id: dto.applicationId, posting: { organizationId } },
    });
    if (!application) throw new NotFoundError('Application', dto.applicationId);

    if (new Date(dto.scheduledAt) < new Date()) {
      throw new BusinessRuleError(
        'INTERVIEW_IN_PAST',
        'An interview cannot be scheduled in the past',
      );
    }
    if (dto.interviewerEmployeeIds.length === 0) {
      throw new BusinessRuleError('NO_INTERVIEWERS', 'At least one interviewer is required');
    }

    const interview = await this.prisma.interview.create({
      data: {
        applicationId: dto.applicationId,
        round: dto.round ?? 1,
        title: dto.title,
        mode: dto.mode,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes,
        locationText: dto.locationText,
        meetingUrl: dto.meetingUrl,
        participants: {
          create: dto.interviewerEmployeeIds.map((employeeId, index) => ({
            employeeId,
            isLead: index === 0,
          })),
        },
      },
      include: { participants: true },
    });

    await this.prisma.application.update({
      where: { id: dto.applicationId },
      data: {
        stage: ApplicationStage.INTERVIEW,
        stageChangedAt: new Date(),
        activities: {
          create: { type: 'INTERVIEW_SCHEDULED', note: dto.title ?? `Round ${dto.round ?? 1}` },
        },
      },
    });

    return interview;
  }

  async submitScorecard(user: AuthenticatedUser, interviewId: string, dto: SubmitScorecardDto) {
    if (!user.employeeId) {
      throw new BusinessRuleError(
        'NOT_AN_EMPLOYEE',
        'Only employees can submit interview scorecards',
      );
    }

    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, application: { posting: { organizationId: user.organizationId } } },
      include: { participants: true },
    });
    if (!interview) throw new NotFoundError('Interview', interviewId);

    const isParticipant = interview.participants.some((p) => p.employeeId === user.employeeId);
    if (!isParticipant) {
      throw new BusinessRuleError(
        'NOT_AN_INTERVIEWER',
        'Only the assigned interviewers can score this interview',
      );
    }

    const overallScore = computeScorecardScore(dto.criteria);

    const scorecard = await this.prisma.interviewScorecard.upsert({
      where: {
        interviewId_reviewerEmployeeId: { interviewId, reviewerEmployeeId: user.employeeId },
      },
      create: {
        interviewId,
        reviewerEmployeeId: user.employeeId,
        criteria: dto.criteria as unknown as Prisma.InputJsonValue,
        overallScore: new Prisma.Decimal(overallScore.toFixed(2)),
        recommendation: dto.recommendation,
        strengths: dto.strengths,
        concerns: dto.concerns,
        notes: dto.notes,
        submittedAt: new Date(),
      },
      update: {
        criteria: dto.criteria as unknown as Prisma.InputJsonValue,
        overallScore: new Prisma.Decimal(overallScore.toFixed(2)),
        recommendation: dto.recommendation,
        strengths: dto.strengths,
        concerns: dto.concerns,
        notes: dto.notes,
        submittedAt: new Date(),
      },
    });

    await this.prisma.interview.update({
      where: { id: interviewId },
      data: { status: InterviewStatus.COMPLETED },
    });

    return scorecard;
  }

  listMyInterviews(employeeId: string) {
    return this.prisma.interview.findMany({
      where: {
        participants: { some: { employeeId } },
        status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] },
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        application: {
          select: {
            id: true,
            candidate: { select: { firstName: true, lastName: true, resumeFileId: true } },
            posting: { select: { title: true } },
          },
        },
        scorecards: { where: { reviewerEmployeeId: employeeId } },
      },
    });
  }
}
