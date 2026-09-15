import { Injectable } from '@nestjs/common';
import { ApplicationStage, EmployeeStatus, OfferStatus, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { toDateOnly } from '../../core/utils/date.util';
import { SequenceService } from '../../core/utils/sequence.service';
import type { CreateOfferDto } from './dto/recruitment.dto';

/**
 * Making an offer, the candidate's answer to it, and turning a yes into an
 * employee record.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
  ) {}

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
}
