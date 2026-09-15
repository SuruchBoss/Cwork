import { Injectable } from '@nestjs/common';
import { ApplicationStage, PostingStatus, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PageDto } from '../../core/http/pagination.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import type { ApplicationQueryDto, ApplyDto, MoveStageDto } from './dto/recruitment.dto';

/** Candidate records are purged this long after consent, unless re-consented. */
const CANDIDATE_RETENTION_MONTHS = 12;

/**
 * Candidates: applying, and moving through the pipeline afterwards.
 *
 * PDPA retention lives here rather than with the scheduled job that triggers
 * it, because the rule is about the candidate record — consent given at
 * application, expiring a year later unless renewed — and the nightly sweep
 * only decides when to ask.
 */
@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
