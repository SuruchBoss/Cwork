import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ApprovalEntityType,
  ApprovalStatus,
  DocumentRequestStatus,
  DocumentRequestType,
} from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { formatDateOnly, toDateOnly, yearsOfService } from '../../core/utils/date.util';
import { formatMoney } from '../../core/utils/money.util';
import { SequenceService } from '../../core/utils/sequence.service';
import {
  ApprovalOutcomeRegistry,
  type ApprovalOutcome,
} from '../approvals/approval-outcome.registry';
import { ApprovalService } from '../approvals/approval.service';
import { employeeVisibilityFilter, requireEmployeeId } from '../employees/domain/employee-access';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateDocumentRequestDto } from './dto/document.dto';

/** Human-readable labels used in notifications and the assistant's replies. */
export const DOCUMENT_TYPE_LABELS: Record<DocumentRequestType, string> = {
  EMPLOYMENT_CERTIFICATE: 'หนังสือรับรองการทำงาน',
  SALARY_CERTIFICATE: 'หนังสือรับรองเงินเดือน',
  PAYSLIP_COPY: 'สำเนาสลิปเงินเดือน',
  TAX_WITHHOLDING_50BIS: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)',
  VISA_SUPPORT_LETTER: 'จดหมายรับรองเพื่อขอวีซ่า',
  BANK_LOAN_LETTER: 'หนังสือรับรองเพื่อขอสินเชื่อ',
  SOCIAL_SECURITY_LETTER: 'หนังสือรับรองประกันสังคม',
  OTHER: 'เอกสารอื่น ๆ',
};

/** Types that always disclose pay, so the salary flag is implied. */
const SALARY_BEARING_TYPES: DocumentRequestType[] = [
  DocumentRequestType.SALARY_CERTIFICATE,
  DocumentRequestType.PAYSLIP_COPY,
  DocumentRequestType.TAX_WITHHOLDING_50BIS,
  DocumentRequestType.BANK_LOAN_LETTER,
];

@Injectable()
export class DocumentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly outcomes: ApprovalOutcomeRegistry,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
  ) {}

  onModuleInit(): void {
    this.outcomes.register(ApprovalEntityType.DOCUMENT_REQUEST, (outcome) =>
      this.onApprovalOutcome(outcome),
    );
  }

  async create(user: AuthenticatedUser, dto: CreateDocumentRequestDto, viaAssistant = false) {
    const employeeId = requireEmployeeId(user);

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { firstNameTh: true, lastNameTh: true, employeeCode: true, departmentId: true },
    });

    const referenceNo = await this.sequences.next(user.organizationId, 'DOCUMENT_REQUEST');
    const includeSalary = dto.includeSalary || SALARY_BEARING_TYPES.includes(dto.type);

    const request = await this.prisma.documentRequest.create({
      data: {
        organizationId: user.organizationId,
        referenceNo,
        employeeId,
        type: dto.type,
        language: dto.language ?? 'th',
        purpose: dto.purpose,
        addressedTo: dto.addressedTo,
        includeSalary,
        copies: dto.copies ?? 1,
        needByDate: dto.needByDate ? toDateOnly(dto.needByDate) : null,
        status: DocumentRequestStatus.PENDING,
        createdViaAssistant: viaAssistant,
      },
    });

    const approval = await this.approvals.start({
      organizationId: user.organizationId,
      entityType: ApprovalEntityType.DOCUMENT_REQUEST,
      entityId: request.id,
      submittedByUserId: user.userId,
      subjectEmployeeId: employeeId,
      snapshot: {
        employeeId,
        departmentId: employee.departmentId,
        type: dto.type,
        includeSalary,
      },
      notification: {
        title: 'คำขอเอกสารรออนุมัติ',
        body: `${employee.firstNameTh} ${employee.lastNameTh} ขอ${DOCUMENT_TYPE_LABELS[dto.type]}`,
      },
    });

    if (approval.instanceId) {
      await this.prisma.documentRequest.update({
        where: { id: request.id },
        data: { approvalInstanceId: approval.instanceId },
      });
    }
    if (approval.autoApproved) {
      await this.prisma.documentRequest.update({
        where: { id: request.id },
        data: { status: DocumentRequestStatus.APPROVED },
      });
    }

    return this.findOne(user, request.id);
  }

  async list(
    user: AuthenticatedUser,
    filters: { status?: DocumentRequestStatus; employeeId?: string },
  ) {
    return this.prisma.documentRequest.findMany({
      where: {
        AND: [
          { organizationId: user.organizationId },
          { employee: employeeVisibilityFilter(user) },
          filters.status ? { status: filters.status } : {},
          filters.employeeId ? { employeeId: filters.employeeId } : {},
        ],
      },
      orderBy: { requestedAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstNameTh: true,
            lastNameTh: true,
            department: { select: { name: true } },
          },
        },
      },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: { id, organizationId: user.organizationId, employee: employeeVisibilityFilter(user) },
      include: {
        employee: { select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true } },
      },
    });
    if (!request) throw new NotFoundError('DocumentRequest', id);
    return request;
  }

  async issue(user: AuthenticatedUser, id: string, fileId?: string, note?: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!request) throw new NotFoundError('DocumentRequest', id);
    if (request.status !== DocumentRequestStatus.APPROVED) {
      throw new BusinessRuleError(
        'DOCUMENT_NOT_APPROVED',
        'Only an approved request can be issued',
      );
    }

    const issued = await this.prisma.$transaction(async (tx) => {
      const record = await tx.documentRequest.update({
        where: { id },
        data: {
          status: DocumentRequestStatus.ISSUED,
          issuedAt: new Date(),
          issuedById: user.userId,
          fileId,
          purpose: note ? `${request.purpose ?? ''}\n${note}`.trim() : request.purpose,
        },
        include: { employee: { select: { userId: true } } },
      });

      // Issuing and saying so commit together: a document marked issued that
      // the employee was never told about is a request that looks answered and
      // is not.
      if (record.employee.userId) {
        await this.notifications.notifyIn(tx, user.organizationId, record.employee.userId, {
          type: 'document.issued',
          title: 'เอกสารของคุณพร้อมแล้ว',
          body: `${DOCUMENT_TYPE_LABELS[record.type]} (${record.referenceNo}) ออกให้เรียบร้อยแล้ว`,
          data: { documentRequestId: id, fileId },
        });
      }

      return record;
    });

    return issued;
  }

  async reject(user: AuthenticatedUser, id: string, reason: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!request) throw new NotFoundError('DocumentRequest', id);

    if (request.approvalInstanceId) {
      await this.approvals.cancel(request.approvalInstanceId, reason);
    }

    return this.prisma.documentRequest.update({
      where: { id },
      data: { status: DocumentRequestStatus.REJECTED, rejectReason: reason },
    });
  }

  /**
   * The data a certificate template needs, assembled in one place.
   *
   * Salary is included only when the request explicitly asked for it, so HR
   * cannot leak pay into a document that did not need it.
   */
  async buildCertificateData(organizationId: string, requestId: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: { id: requestId, organizationId },
      include: {
        employee: {
          include: {
            position: { select: { title: true, titleEn: true } },
            department: { select: { name: true, nameEn: true } },
            organization: { select: { name: true, legalName: true, taxId: true, currency: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundError('DocumentRequest', requestId);

    const employee = request.employee;
    let compensation: { baseSalary: string; currency: string } | null = null;

    if (request.includeSalary) {
      const record = await this.prisma.employeeCompensation.findFirst({
        where: {
          employeeId: employee.id,
          effectiveFrom: { lte: toDateOnly(new Date()) },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: toDateOnly(new Date()) } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (record) {
        compensation = {
          baseSalary: formatMoney(Number(record.baseSalary), record.currency),
          currency: record.currency,
        };
      }
    }

    return {
      referenceNo: request.referenceNo,
      type: request.type,
      typeLabel: DOCUMENT_TYPE_LABELS[request.type],
      language: request.language,
      addressedTo: request.addressedTo,
      purpose: request.purpose,
      issuedOn: formatDateOnly(new Date()),
      organization: employee.organization,
      employee: {
        employeeCode: employee.employeeCode,
        nameTh: `${employee.firstNameTh} ${employee.lastNameTh}`,
        nameEn: [employee.firstNameEn, employee.lastNameEn].filter(Boolean).join(' ') || null,
        position: employee.position?.title ?? null,
        positionEn: employee.position?.titleEn ?? null,
        department: employee.department?.name ?? null,
        hireDate: formatDateOnly(employee.hireDate),
        yearsOfService: yearsOfService(employee.hireDate),
        status: employee.status,
      },
      compensation,
    };
  }

  private async onApprovalOutcome(outcome: ApprovalOutcome): Promise<void> {
    const request = await this.prisma.documentRequest.findUnique({
      where: { id: outcome.entityId },
    });
    if (!request || request.status !== DocumentRequestStatus.PENDING) return;

    await this.prisma.documentRequest.update({
      where: { id: request.id },
      data: {
        status:
          outcome.status === ApprovalStatus.APPROVED
            ? DocumentRequestStatus.APPROVED
            : DocumentRequestStatus.REJECTED,
        rejectReason: outcome.status === ApprovalStatus.REJECTED ? outcome.comment : null,
      },
    });
  }
}
