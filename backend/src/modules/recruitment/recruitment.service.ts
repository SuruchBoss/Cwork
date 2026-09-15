import { Injectable } from '@nestjs/common';
import { PostingStatus, Prisma, RequisitionStatus } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { toDateOnly } from '../../core/utils/date.util';
import { SequenceService } from '../../core/utils/sequence.service';
import type { CreatePostingDto, CreateRequisitionDto } from './dto/recruitment.dto';

/**
 * Job requisitions and the postings they become.
 *
 * The public careers endpoints live here too: a posting is the only part of
 * recruitment a stranger ever sees, and what it may show them is a property of
 * the posting rather than of the people who applied to it.
 */
@Injectable()
export class RecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
  ) {}

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

  listPostings(organizationId: string, status?: PostingStatus) {
    return this.prisma.jobPosting.findMany({
      where: { organizationId, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { applications: true } } },
    });
  }

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
}
