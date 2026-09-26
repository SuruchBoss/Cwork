// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { createHmac } from 'node:crypto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  ApprovalEntityType,
  ApprovalStatus,
  DocumentRequestStatus,
  DocumentRequestType,
  FileVisibility,
} from '@prisma/client';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { Permission } from '../../core/security/permissions';
import { formatDateOnly, toDateOnly, yearsOfService } from '../../core/utils/date.util';
import { formatMoney } from '../../core/utils/money.util';
import { SequenceService } from '../../core/utils/sequence.service';
import {
  ApprovalOutcomeRegistry,
  type ApprovalOutcome,
} from '../approvals/approval-outcome.registry';
import { ApprovalService } from '../approvals/approval.service';
import { employeeVisibilityFilter, requireEmployeeId } from '../../core/security/employee-access';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CertificateRenderer, type CertificateData } from './certificate-renderer';
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
    @Inject(APP_CONFIG) private readonly config: RootConfig,
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly outcomes: ApprovalOutcomeRegistry,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
    private readonly files: FilesService,
    private readonly renderer: CertificateRenderer,
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

  /**
   * Renders the certificate to a PDF, stores it and marks the request issued.
   *
   * Re-issuing is allowed and supersedes: a fresh PDF is rendered and becomes the
   * request's file, while the previous `FileObject` is left in place — so the
   * old copy is not overwritten, and both issuances are on the audit trail. The
   * verification code the PDF carries is derived from the request id, so anyone
   * holding the document can confirm it is genuine without an account.
   */
  async issue(user: AuthenticatedUser, id: string, note?: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!request) throw new NotFoundError('DocumentRequest', id);
    // Approved is the first issue; issued is a re-issue that supersedes.
    if (
      request.status !== DocumentRequestStatus.APPROVED &&
      request.status !== DocumentRequestStatus.ISSUED
    ) {
      throw new BusinessRuleError(
        'DOCUMENT_NOT_APPROVED',
        'Only an approved request can be issued',
      );
    }

    const certificate: CertificateData = {
      ...(await this.buildCertificateData(user.organizationId, id)),
      verificationCode: this.verificationCodeFor(id),
    };
    const pdf = await this.renderer.render(certificate);
    const file = await this.files.upload(user, {
      originalName: `${request.referenceNo}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdf,
      prefix: `org/${user.organizationId}/documents`,
      visibility: FileVisibility.PRIVATE,
    });

    const issued = await this.prisma.$transaction(async (tx) => {
      const record = await tx.documentRequest.update({
        where: { id },
        data: {
          status: DocumentRequestStatus.ISSUED,
          issuedAt: new Date(),
          issuedById: user.userId,
          fileId: file.id,
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
          data: { documentRequestId: id, fileId: file.id },
        });
      }

      return record;
    });

    return issued;
  }

  /**
   * Streams the issued PDF, to the requester or a `document:issue` holder only.
   *
   * The generic file download is scoped to the organisation, which is too wide
   * for a salary certificate; this narrows it to the two parties who may see it.
   */
  async getPdf(user: AuthenticatedUser, id: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { employeeId: true, fileId: true, referenceNo: true },
    });
    const isOwner = request?.employeeId === user.employeeId;
    const canIssue = user.permissions.includes(Permission.DOCUMENT_ISSUE);
    // Absent rather than forbidden for a request the caller has no business seeing.
    if (!request || (!isOwner && !canIssue)) throw new NotFoundError('DocumentRequest', id);
    if (!request.fileId) {
      throw new BusinessRuleError('DOCUMENT_NOT_ISSUED', 'This document has not been issued yet');
    }

    const { file, content } = await this.files.download(user.organizationId, request.fileId);
    return { file, content, referenceNo: request.referenceNo };
  }

  /**
   * Confirms a document is genuine from its reference number and printed code,
   * for a third party such as a bank. Public, and it discloses only enough to
   * confirm authenticity — never salary.
   */
  async verify(referenceNo: string, code: string) {
    // The reference number is unique per organisation, not globally; the code is
    // an HMAC of the request id, so it disambiguates and cannot be guessed.
    const candidates = await this.prisma.documentRequest.findMany({
      where: { referenceNo, status: DocumentRequestStatus.ISSUED },
      include: { employee: { select: { firstNameTh: true, lastNameTh: true } } },
    });
    const match = candidates.find((r) => this.verificationCodeFor(r.id) === code.toUpperCase());
    if (!match) return { valid: false as const };

    return {
      valid: true as const,
      referenceNo: match.referenceNo,
      type: DOCUMENT_TYPE_LABELS[match.type],
      issuedOn: match.issuedAt ? formatDateOnly(match.issuedAt) : null,
      employeeName: `${match.employee.firstNameTh} ${match.employee.lastNameTh}`,
    };
  }

  /** A short, unguessable code derived from the request id — recomputable, unstored. */
  private verificationCodeFor(requestId: string): string {
    return createHmac('sha256', this.config.auth.accessSecret)
      .update(requestId)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase();
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
