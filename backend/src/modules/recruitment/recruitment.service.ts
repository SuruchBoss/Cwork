import { Injectable } from '@nestjs/common';
import {
  ApplicationStage,
  AssessmentInvitationStatus,
  EmployeeStatus,
  InterviewStatus,
  OfferStatus,
  PostingStatus,
  Prisma,
  QuestionType,
  RequisitionStatus,
} from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PageDto } from '../../core/http/pagination.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/security/crypto.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { toDateOnly } from '../../core/utils/date.util';
import { SequenceService } from '../../core/utils/sequence.service';
import { computeScorecardScore, gradeAssessment } from './domain/assessment-grader';
import type {
  ApplicationQueryDto,
  ApplyDto,
  CreateAssessmentTemplateDto,
  CreateOfferDto,
  CreatePostingDto,
  CreateRequisitionDto,
  InviteAssessmentDto,
  MoveStageDto,
  ScheduleInterviewDto,
  SubmitAssessmentDto,
  SubmitScorecardDto,
} from './dto/recruitment.dto';

/** Question types whose correctness is provable, so they must declare answers. */
const CHOICE_QUESTION_TYPES: QuestionType[] = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
];

/** Candidate records are purged this long after consent, unless re-consented. */
const CANDIDATE_RETENTION_MONTHS = 12;

@Injectable()
export class RecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly sequences: SequenceService,
  ) {}

  // -------------------------------------------------------------- requisitions

  listRequisitions(organizationId: string, status?: RequisitionStatus) {
    return this.prisma.jobRequisition.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        department: { select: { id: true, name: true } },
        position: { select: { id: true, title: true } },
        _count: { select: { postings: true } },
      },
    });
  }

  async createRequisition(user: AuthenticatedUser, dto: CreateRequisitionDto) {
    if (
      dto.salaryMin !== undefined &&
      dto.salaryMax !== undefined &&
      dto.salaryMin > dto.salaryMax
    ) {
      throw new BusinessRuleError(
        'INVALID_SALARY_RANGE',
        'The minimum salary cannot exceed the maximum',
      );
    }

    const code = await this.sequences.next(user.organizationId, 'JOB_REQUISITION');

    return this.prisma.jobRequisition.create({
      data: {
        organizationId: user.organizationId,
        code,
        title: dto.title,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        employmentType: dto.employmentType,
        headcount: dto.headcount ?? 1,
        isReplacement: dto.isReplacement ?? false,
        replacingEmployeeId: dto.replacingEmployeeId,
        salaryMin: dto.salaryMin !== undefined ? new Prisma.Decimal(dto.salaryMin) : null,
        salaryMax: dto.salaryMax !== undefined ? new Prisma.Decimal(dto.salaryMax) : null,
        targetStartDate: dto.targetStartDate ? toDateOnly(dto.targetStartDate) : null,
        justification: dto.justification,
        requestedByEmployeeId: user.employeeId,
        status: RequisitionStatus.PENDING_APPROVAL,
      },
    });
  }

  // ------------------------------------------------------------------ postings

  listPostings(organizationId: string, status?: PostingStatus) {
    return this.prisma.jobPosting.findMany({
      where: { organizationId, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { applications: true } } },
    });
  }

  /** Public careers-page listing: only published, non-internal postings. */
  listPublicPostings(organizationCode: string) {
    return this.prisma.jobPosting.findMany({
      where: {
        organization: { code: organizationCode, isActive: true },
        status: PostingStatus.PUBLISHED,
        isInternalOnly: false,
        deletedAt: null,
        OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
      },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        locationText: true,
        isRemote: true,
        showSalary: true,
        salaryMin: true,
        salaryMax: true,
        publishedAt: true,
        closesAt: true,
      },
    });
  }

  async getPublicPosting(organizationCode: string, slug: string) {
    const posting = await this.prisma.jobPosting.findFirst({
      where: {
        organization: { code: organizationCode, isActive: true },
        slug,
        status: PostingStatus.PUBLISHED,
        isInternalOnly: false,
        deletedAt: null,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        description: true,
        requirements: true,
        benefits: true,
        locationText: true,
        isRemote: true,
        showSalary: true,
        salaryMin: true,
        salaryMax: true,
        formSchema: true,
        closesAt: true,
      },
    });
    if (!posting) throw new NotFoundError('JobPosting', slug);

    await this.prisma.jobPosting.update({
      where: { id: posting.id },
      data: { viewCount: { increment: 1 } },
    });

    // Salary is only disclosed when the posting opted in.
    return posting.showSalary ? posting : { ...posting, salaryMin: null, salaryMax: null };
  }

  createPosting(organizationId: string, dto: CreatePostingDto) {
    return this.prisma.jobPosting.create({
      data: {
        ...dto,
        organizationId,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
        formSchema: (dto.formSchema ?? []) as Prisma.InputJsonValue,
      },
    });
  }

  async updatePostingStatus(organizationId: string, id: string, status: PostingStatus) {
    const posting = await this.prisma.jobPosting.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!posting) throw new NotFoundError('JobPosting', id);

    return this.prisma.jobPosting.update({
      where: { id },
      data: {
        status,
        publishedAt:
          status === PostingStatus.PUBLISHED && !posting.publishedAt
            ? new Date()
            : posting.publishedAt,
      },
    });
  }

  // -------------------------------------------------------------- applications

  /**
   * Public application intake.
   *
   * PDPA: consent is mandatory and timestamped, and a retention deadline is set
   * so `purgeExpiredCandidates` can erase the record automatically.
   */
  async apply(organizationCode: string, slug: string, dto: ApplyDto) {
    if (!dto.consent) {
      throw new BusinessRuleError(
        'CONSENT_REQUIRED',
        'Consent to process your data is required to apply',
      );
    }

    const posting = await this.prisma.jobPosting.findFirst({
      where: {
        organization: { code: organizationCode, isActive: true },
        slug,
        status: PostingStatus.PUBLISHED,
        deletedAt: null,
        OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
      },
      select: { id: true, organizationId: true, title: true },
    });
    if (!posting) throw new NotFoundError('JobPosting', slug);

    const consentAt = new Date();
    const consentExpiresAt = new Date(consentAt);
    consentExpiresAt.setMonth(consentExpiresAt.getMonth() + CANDIDATE_RETENTION_MONTHS);

    const candidate = await this.prisma.candidate.upsert({
      where: { organizationId_email: { organizationId: posting.organizationId, email: dto.email } },
      create: {
        organizationId: posting.organizationId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        currentTitle: dto.currentTitle,
        currentCompany: dto.currentCompany,
        expectedSalary:
          dto.expectedSalary !== undefined ? new Prisma.Decimal(dto.expectedSalary) : null,
        noticePeriodDays: dto.noticePeriodDays,
        resumeFileId: dto.resumeFileId,
        portfolioUrl: dto.portfolioUrl,
        source: 'CAREERS_PAGE',
        consentAt,
        consentExpiresAt,
      },
      update: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? undefined,
        currentTitle: dto.currentTitle ?? undefined,
        currentCompany: dto.currentCompany ?? undefined,
        resumeFileId: dto.resumeFileId ?? undefined,
        // Re-applying renews consent rather than extending the old one silently.
        consentAt,
        consentExpiresAt,
        erasureRequestedAt: null,
      },
    });

    const existing = await this.prisma.application.findUnique({
      where: { candidateId_postingId: { candidateId: candidate.id, postingId: posting.id } },
      select: { id: true },
    });
    if (existing) {
      throw new BusinessRuleError('ALREADY_APPLIED', 'You have already applied for this position');
    }

    const application = await this.prisma.application.create({
      data: {
        candidateId: candidate.id,
        postingId: posting.id,
        coverLetter: dto.coverLetter,
        formAnswers: (dto.formAnswers ?? {}) as Prisma.InputJsonValue,
        activities: {
          create: {
            type: 'APPLIED',
            toStage: ApplicationStage.APPLIED,
            note: 'Applied via careers page',
          },
        },
      },
    });

    // Deliberately minimal: the public response must not leak internal ids or
    // reveal anything about other applications.
    return {
      applicationId: application.id,
      position: posting.title,
      submittedAt: application.appliedAt,
    };
  }

  async listApplications(organizationId: string, query: ApplicationQueryDto) {
    const where: Prisma.ApplicationWhereInput = {
      posting: { organizationId, deletedAt: null },
      ...(query.postingId ? { postingId: query.postingId } : {}),
      ...(query.stage?.length ? { stage: { in: query.stage } } : {}),
      ...(query.search
        ? {
            candidate: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        orderBy: { appliedAt: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              currentTitle: true,
              expectedSalary: true,
              resumeFileId: true,
            },
          },
          posting: { select: { id: true, title: true, slug: true } },
          _count: { select: { interviews: true, assessments: true } },
        },
      }),
      this.prisma.application.count({ where }),
    ]);

    return PageDto.of(data, total, query.page, query.limit);
  }

  async getApplication(organizationId: string, id: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, posting: { organizationId } },
      include: {
        candidate: true,
        posting: { select: { id: true, title: true, slug: true } },
        activities: { orderBy: { createdAt: 'desc' } },
        assessments: {
          include: { template: { select: { id: true, title: true, passingScore: true } } },
        },
        interviews: {
          orderBy: { round: 'asc' },
          include: {
            participants: {
              include: { employee: { select: { id: true, firstNameTh: true, lastNameTh: true } } },
            },
            scorecards: true,
          },
        },
        offers: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!application) throw new NotFoundError('Application', id);
    return application;
  }

  async moveStage(user: AuthenticatedUser, id: string, dto: MoveStageDto) {
    const application = await this.prisma.application.findFirst({
      where: { id, posting: { organizationId: user.organizationId } },
    });
    if (!application) throw new NotFoundError('Application', id);

    if (dto.stage === ApplicationStage.REJECTED && !dto.rejectReason) {
      throw new BusinessRuleError(
        'REJECT_REASON_REQUIRED',
        'A reason is required when rejecting a candidate',
      );
    }
    if (application.stage === ApplicationStage.HIRED) {
      throw new BusinessRuleError('ALREADY_HIRED', 'This candidate has already been hired');
    }

    return this.prisma.application.update({
      where: { id },
      data: {
        stage: dto.stage,
        stageChangedAt: new Date(),
        ...(dto.stage === ApplicationStage.REJECTED
          ? { rejectReason: dto.rejectReason, rejectedAt: new Date() }
          : {}),
        activities: {
          create: {
            type: 'STAGE_CHANGED',
            fromStage: application.stage,
            toStage: dto.stage,
            note: dto.note ?? dto.rejectReason,
            actorUserId: user.userId,
          },
        },
      },
    });
  }

  // --------------------------------------------------------------- assessments

  listTemplates(organizationId: string) {
    return this.prisma.assessmentTemplate.findMany({
      where: { organizationId, isActive: true },
      orderBy: { title: 'asc' },
      include: { _count: { select: { questions: true } } },
    });
  }

  createTemplate(organizationId: string, dto: CreateAssessmentTemplateDto) {
    const needsAnswers = dto.questions.filter(
      (q) => CHOICE_QUESTION_TYPES.includes(q.type) && (q.correctKeys ?? []).length === 0,
    );
    if (needsAnswers.length > 0) {
      throw new BusinessRuleError(
        'MISSING_CORRECT_ANSWER',
        'Choice questions must declare at least one correct answer',
        { orderIndexes: needsAnswers.map((q) => q.orderIndex) },
      );
    }

    return this.prisma.assessmentTemplate.create({
      data: {
        organizationId,
        code: dto.code,
        title: dto.title,
        description: dto.description,
        kind: dto.kind,
        durationMinutes: dto.durationMinutes,
        passingScore:
          dto.passingScore !== undefined ? new Prisma.Decimal(dto.passingScore) : undefined,
        questions: {
          create: dto.questions.map((q) => ({
            orderIndex: q.orderIndex,
            type: q.type,
            prompt: q.prompt,
            options: (q.options ?? []) as Prisma.InputJsonValue,
            correctKeys: q.correctKeys ?? [],
            points: q.points !== undefined ? new Prisma.Decimal(q.points) : undefined,
            explanation: q.explanation,
          })),
        },
      },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  /**
   * Issues a single-use assessment link. The raw token is returned exactly once
   * — only its hash is stored, so a leaked database cannot be used to sit a test.
   */
  async inviteToAssessment(organizationId: string, dto: InviteAssessmentDto) {
    const [application, template] = await Promise.all([
      this.prisma.application.findFirst({
        where: { id: dto.applicationId, posting: { organizationId } },
        include: { candidate: { select: { email: true, firstName: true } } },
      }),
      this.prisma.assessmentTemplate.findFirst({
        where: { id: dto.templateId, organizationId, isActive: true },
      }),
    ]);
    if (!application) throw new NotFoundError('Application', dto.applicationId);
    if (!template) throw new NotFoundError('AssessmentTemplate', dto.templateId);

    const token = this.crypto.generateToken(32);
    const expiresAt = new Date(Date.now() + (dto.validForDays ?? 7) * 86_400_000);

    const invitation = await this.prisma.assessmentInvitation.create({
      data: {
        applicationId: dto.applicationId,
        templateId: dto.templateId,
        tokenHash: this.crypto.hashToken(token),
        expiresAt,
      },
    });

    await this.prisma.application.update({
      where: { id: dto.applicationId },
      data: {
        stage: ApplicationStage.ASSESSMENT,
        stageChangedAt: new Date(),
        activities: { create: { type: 'ASSESSMENT_SENT', note: template.title } },
      },
    });

    return {
      invitationId: invitation.id,
      candidateEmail: application.candidate.email,
      expiresAt,
      /** Present only in this response — it is never retrievable again. */
      token,
    };
  }

  /** Candidate-facing: resolves the token into the question set, answers hidden. */
  async startAssessment(token: string) {
    const invitation = await this.requireInvitation(token);

    if (invitation.status === AssessmentInvitationStatus.SUBMITTED || invitation.submittedAt) {
      throw new BusinessRuleError(
        'ASSESSMENT_ALREADY_SUBMITTED',
        'This assessment has already been submitted',
      );
    }

    const startedAt = invitation.startedAt ?? new Date();
    const deadlineAt =
      invitation.deadlineAt ??
      new Date(startedAt.getTime() + invitation.template.durationMinutes * 60_000);

    if (!invitation.startedAt) {
      await this.prisma.assessmentInvitation.update({
        where: { id: invitation.id },
        data: { status: AssessmentInvitationStatus.IN_PROGRESS, startedAt, deadlineAt },
      });
    }

    const questions = invitation.template.shuffleQuestions
      ? shuffle(invitation.template.questions)
      : invitation.template.questions;

    return {
      title: invitation.template.title,
      description: invitation.template.description,
      durationMinutes: invitation.template.durationMinutes,
      deadlineAt,
      questions: questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        // `correctKeys` is deliberately never serialised here.
        options: q.options,
        points: q.points,
        isRequired: q.isRequired,
      })),
    };
  }

  async submitAssessment(dto: SubmitAssessmentDto) {
    const invitation = await this.requireInvitation(dto.token);

    if (invitation.submittedAt) {
      throw new BusinessRuleError(
        'ASSESSMENT_ALREADY_SUBMITTED',
        'This assessment has already been submitted',
      );
    }
    // The deadline is enforced server-side; a tampered client clock cannot extend it.
    if (invitation.deadlineAt && invitation.deadlineAt < new Date()) {
      await this.prisma.assessmentInvitation.update({
        where: { id: invitation.id },
        data: { status: AssessmentInvitationStatus.EXPIRED },
      });
      throw new BusinessRuleError(
        'ASSESSMENT_TIME_EXPIRED',
        'The time limit for this assessment has passed',
      );
    }

    const grading = gradeAssessment(
      invitation.template.questions.map((q) => ({
        id: q.id,
        type: q.type,
        correctKeys: q.correctKeys,
        points: Number(q.points),
      })),
      dto.answers,
      Number(invitation.template.passingScore),
    );

    const answersByQuestion = new Map(dto.answers.map((a) => [a.questionId, a]));

    await this.prisma.$transaction(async (tx) => {
      for (const graded of grading.answers) {
        const submitted = answersByQuestion.get(graded.questionId);
        await tx.assessmentAnswer.upsert({
          where: {
            invitationId_questionId: { invitationId: invitation.id, questionId: graded.questionId },
          },
          create: {
            invitationId: invitation.id,
            questionId: graded.questionId,
            selectedKeys: submitted?.selectedKeys ?? [],
            textAnswer: submitted?.textAnswer,
            score: new Prisma.Decimal(graded.score.toFixed(2)),
            isCorrect: graded.isCorrect,
          },
          update: {
            selectedKeys: submitted?.selectedKeys ?? [],
            textAnswer: submitted?.textAnswer,
            score: new Prisma.Decimal(graded.score.toFixed(2)),
            isCorrect: graded.isCorrect,
          },
        });
      }

      await tx.assessmentInvitation.update({
        where: { id: invitation.id },
        data: {
          status: grading.pendingManualPoints.greaterThan(0)
            ? AssessmentInvitationStatus.SUBMITTED
            : AssessmentInvitationStatus.GRADED,
          submittedAt: new Date(),
          score: new Prisma.Decimal(grading.autoScore.toFixed(2)),
          maxScore: new Prisma.Decimal(grading.maxScore.toFixed(2)),
          percentage: new Prisma.Decimal(grading.percentage.toFixed(2)),
          isPassed: grading.isPassed,
        },
      });
    });

    // The candidate is told it was received, not how they scored.
    return {
      submitted: true,
      awaitingManualReview: grading.pendingManualPoints.greaterThan(0),
    };
  }

  // ---------------------------------------------------------------- interviews

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

  // -------------------------------------------------------------------- offers

  async createOffer(organizationId: string, dto: CreateOfferDto) {
    const application = await this.prisma.application.findFirst({
      where: { id: dto.applicationId, posting: { organizationId } },
    });
    if (!application) throw new NotFoundError('Application', dto.applicationId);

    const offer = await this.prisma.jobOffer.create({
      data: {
        applicationId: dto.applicationId,
        baseSalary: new Prisma.Decimal(dto.baseSalary),
        allowances: (dto.allowances ?? []) as Prisma.InputJsonValue,
        signOnBonus: dto.signOnBonus !== undefined ? new Prisma.Decimal(dto.signOnBonus) : null,
        probationMonths: dto.probationMonths,
        startDate: toDateOnly(dto.startDate),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        note: dto.note,
      },
    });

    await this.prisma.application.update({
      where: { id: dto.applicationId },
      data: {
        stage: ApplicationStage.OFFER,
        stageChangedAt: new Date(),
        activities: { create: { type: 'OFFER_CREATED' } },
      },
    });

    return offer;
  }

  async respondToOffer(
    organizationId: string,
    offerId: string,
    accepted: boolean,
    reason?: string,
  ) {
    const offer = await this.prisma.jobOffer.findFirst({
      where: { id: offerId, application: { posting: { organizationId } } },
    });
    if (!offer) throw new NotFoundError('JobOffer', offerId);
    if (offer.status === OfferStatus.ACCEPTED || offer.status === OfferStatus.DECLINED) {
      throw new BusinessRuleError('OFFER_ALREADY_ANSWERED', 'This offer has already been answered');
    }

    return this.prisma.jobOffer.update({
      where: { id: offerId },
      data: {
        status: accepted ? OfferStatus.ACCEPTED : OfferStatus.DECLINED,
        respondedAt: new Date(),
        declineReason: accepted ? null : reason,
      },
    });
  }

  /**
   * Converts an accepted offer into an employee record, linking the two so the
   * hiring history survives on the employee's profile.
   */
  async convertToEmployee(user: AuthenticatedUser, offerId: string, employeeCode?: string) {
    const offer = await this.prisma.jobOffer.findFirst({
      where: { id: offerId, application: { posting: { organizationId: user.organizationId } } },
      include: {
        application: {
          include: {
            candidate: true,
            posting: {
              select: {
                requisition: { select: { id: true, departmentId: true, positionId: true } },
              },
            },
          },
        },
      },
    });
    if (!offer) throw new NotFoundError('JobOffer', offerId);
    if (offer.status !== OfferStatus.ACCEPTED) {
      throw new BusinessRuleError('OFFER_NOT_ACCEPTED', 'Only an accepted offer can be converted');
    }
    if (offer.application.hiredEmployeeId) {
      throw new BusinessRuleError('ALREADY_CONVERTED', 'This candidate has already been onboarded');
    }

    const candidate = offer.application.candidate;
    const requisition = offer.application.posting.requisition;
    const code = employeeCode ?? (await this.sequences.next(user.organizationId, 'EMPLOYEE'));

    const probationEnd = new Date(offer.startDate);
    probationEnd.setMonth(probationEnd.getMonth() + offer.probationMonths);

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          organizationId: user.organizationId,
          employeeCode: code,
          firstNameTh: candidate.firstName,
          lastNameTh: candidate.lastName,
          personalEmail: candidate.email,
          phone: candidate.phone,
          departmentId: requisition?.departmentId,
          positionId: requisition?.positionId,
          hireDate: offer.startDate,
          probationEndDate: offer.probationMonths > 0 ? toDateOnly(probationEnd) : null,
          status: offer.probationMonths > 0 ? EmployeeStatus.PRE_BOARDING : EmployeeStatus.ACTIVE,
        },
      });

      await tx.employeeCompensation.create({
        data: {
          employeeId: employee.id,
          effectiveFrom: offer.startDate,
          baseSalary: offer.baseSalary,
        },
      });

      await tx.application.update({
        where: { id: offer.applicationId },
        data: {
          stage: ApplicationStage.HIRED,
          stageChangedAt: new Date(),
          hiredEmployeeId: employee.id,
          activities: { create: { type: 'HIRED', toStage: ApplicationStage.HIRED } },
        },
      });

      if (requisition) {
        await tx.jobRequisition.update({
          where: { id: requisition.id },
          data: { filledCount: { increment: 1 } },
        });
      }

      return employee;
    });
  }

  /**
   * PDPA retention job: scrubs candidates whose consent has expired or who
   * asked to be forgotten, keeping the application row for hiring statistics
   * but stripping everything that identifies a person.
   */
  async purgeExpiredCandidates(organizationId: string, now = new Date()): Promise<number> {
    const expired = await this.prisma.candidate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ consentExpiresAt: { lt: now } }, { erasureRequestedAt: { not: null } }],
        // Anyone actually hired is an employee now; their record stays.
        applications: { none: { stage: ApplicationStage.HIRED } },
      },
      select: { id: true },
    });

    for (const candidate of expired) {
      await this.prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          firstName: 'ผู้สมัคร',
          lastName: '(ลบข้อมูลแล้ว)',
          email: `erased-${candidate.id}@invalid.local`,
          phone: null,
          currentTitle: null,
          currentCompany: null,
          resumeFileId: null,
          portfolioUrl: null,
          linkedinUrl: null,
          notes: null,
          tags: [],
          deletedAt: now,
        },
      });
    }

    return expired.length;
  }

  // ------------------------------------------------------------------ internals

  private async requireInvitation(token: string) {
    const invitation = await this.prisma.assessmentInvitation.findUnique({
      where: { tokenHash: this.crypto.hashToken(token) },
      include: { template: { include: { questions: { orderBy: { orderIndex: 'asc' } } } } },
    });

    if (!invitation) throw new NotFoundError('AssessmentInvitation');
    if (invitation.status === AssessmentInvitationStatus.CANCELLED) {
      throw new BusinessRuleError(
        'ASSESSMENT_CANCELLED',
        'This assessment invitation was cancelled',
      );
    }
    if (invitation.expiresAt < new Date()) {
      throw new BusinessRuleError('ASSESSMENT_EXPIRED', 'This assessment invitation has expired');
    }
    return invitation;
  }
}

/** Fisher–Yates; used to vary question order per candidate. */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
