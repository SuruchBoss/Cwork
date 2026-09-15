import { Injectable } from '@nestjs/common';
import { ApplicationStage, AssessmentInvitationStatus, Prisma, QuestionType } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/security/crypto.service';
import { gradeAssessment } from './domain/assessment-grader';
import type {
  CreateAssessmentTemplateDto,
  InviteAssessmentDto,
  SubmitAssessmentDto,
} from './dto/recruitment.dto';

/** Question types whose correctness is provable, so they must declare answers. */
const CHOICE_QUESTION_TYPES: QuestionType[] = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
];

/**
 * Assessment templates, the invitations that carry them, and grading.
 *
 * An invitation is a single-use token rather than a login, so a candidate can
 * sit an assessment without an account. That is why every entry point here
 * goes through `requireInvitation` before it reads anything.
 */
@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

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
