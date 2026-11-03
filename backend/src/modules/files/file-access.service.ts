// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import type { FileObject, Prisma } from '@prisma/client';
import { NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { employeeVisibilityFilter } from '../../core/security/employee-access';
import { Permission, type PermissionKey } from '../../core/security/permissions';

/** What a caller wants to do with a stored file. */
export type FileAction = 'read' | 'delete';

/**
 * Who may open or remove a stored file.
 *
 * A file is not public to everyone in the organisation just because the caller
 * has its id. It belongs to the person who uploaded it, and, once it is
 * attached to something, to the people who may see that thing: an employee's
 * document to those who may see the employee, a receipt to the person who
 * claimed and to those who handle claims, and so on. A caller with no such
 * standing is told the file does not exist, the same answer as for an id that
 * was never issued, so nothing reveals which ids are real.
 *
 * Deleting is narrower than reading: the uploader, or someone who manages the
 * thing the file is attached to.
 */
@Injectable()
export class FileAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The file, if the caller may do `action` with it; otherwise a 404. */
  async require(user: AuthenticatedUser, id: string, action: FileAction): Promise<FileObject> {
    const file = await this.prisma.fileObject.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!file || !(await this.may(user, file, action))) throw new NotFoundError('File', id);
    return file;
  }

  /**
   * Whether `files` can all be attached by the caller: each exists in their
   * organisation and was uploaded by them. Attaching is how a file comes to
   * belong to something, so it cannot be a way to claim a file someone else
   * uploaded.
   */
  async assertAttachable(user: AuthenticatedUser, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const found = await this.prisma.fileObject.findMany({
      where: {
        id: { in: unique },
        organizationId: user.organizationId,
        uploadedById: user.userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    const known = new Set(found.map((f) => f.id));
    const missing = unique.find((id) => !known.has(id));
    if (missing) throw new NotFoundError('File', missing);
  }

  private async may(user: AuthenticatedUser, file: FileObject, action: FileAction) {
    if (file.uploadedById === user.userId) return true;

    const held = new Set<PermissionKey>(user.permissions);
    const has = (...wanted: PermissionKey[]) => wanted.some((p) => held.has(p));
    const read = action === 'read';
    const visible: Prisma.EmployeeWhereInput = employeeVisibilityFilter(user);
    const self = user.employeeId;
    const id = file.id;

    // Each check below is "is this file attached to something the caller has
    // standing over". They are independent, so any one grants.
    const checks: Array<Promise<unknown>> = [];

    // An employee's photo: the employee, and whoever may see the employee.
    // Changing it is the employee's own profile edit, or HR's.
    if (read || has(Permission.EMPLOYEE_UPDATE, Permission.EMPLOYEE_UPDATE_SELF)) {
      checks.push(
        this.prisma.employee.findFirst({
          where: {
            photoFileId: id,
            ...(read
              ? { AND: [visible] }
              : has(Permission.EMPLOYEE_UPDATE)
                ? { AND: [visible] }
                : { id: self ?? '' }),
          },
          select: { id: true },
        }),
      );
    }

    // A document in an employee's file.
    if (read || has(Permission.EMPLOYEE_UPDATE)) {
      checks.push(
        this.prisma.employeeDocument.findFirst({
          where: { fileId: id, deletedAt: null, employee: visible },
          select: { id: true },
        }),
      );
    }

    // A receipt on an expense claim: the claimant, and those who handle claims.
    if (read ? true : has(Permission.EXPENSE_MANAGE)) {
      const handlers = read
        ? has(Permission.EXPENSE_READ, Permission.EXPENSE_MANAGE, Permission.APPROVAL_ACT)
        : true;
      checks.push(
        this.prisma.expenseClaimItem.findFirst({
          where: {
            receiptFileId: id,
            claim: {
              OR: [
                ...(read && self ? [{ employeeId: self }] : []),
                ...(handlers ? [{ employee: visible }] : []),
              ],
            },
          },
          select: { id: true },
        }),
      );
    }

    // A document HR issued to an employee, or that they asked for.
    if (read || has(Permission.DOCUMENT_ISSUE)) {
      checks.push(
        this.prisma.documentRequest.findFirst({
          where: {
            fileId: id,
            OR: [
              ...(read && self ? [{ employeeId: self }] : []),
              ...(has(Permission.DOCUMENT_ISSUE) ? [{ organizationId: user.organizationId }] : []),
            ],
          },
          select: { id: true },
        }),
      );
    }

    // A document the assistant answers from.
    if (
      read
        ? has(Permission.ASSISTANT_USE, Permission.ASSISTANT_KNOWLEDGE_MANAGE)
        : has(Permission.ASSISTANT_KNOWLEDGE_MANAGE)
    ) {
      checks.push(
        this.prisma.knowledgeDocument.findFirst({
          where: { fileId: id, organizationId: user.organizationId },
          select: { id: true },
        }),
      );
    }

    // A certificate or other paper on a leave request.
    if (read || has(Permission.LEAVE_MANAGE)) {
      const handlers = read
        ? has(
            Permission.LEAVE_READ,
            Permission.LEAVE_READ_TEAM,
            Permission.LEAVE_MANAGE,
            Permission.LEAVE_RECORD,
            Permission.APPROVAL_ACT,
          )
        : true;
      checks.push(
        this.prisma.leaveRequest.findFirst({
          where: {
            attachmentIds: { has: id },
            OR: [
              ...(read && self ? [{ employeeId: self }] : []),
              ...(handlers ? [{ employee: visible }] : []),
            ],
          },
          select: { id: true },
        }),
      );
    }

    // A candidate's résumé and an offer letter.
    if (has(Permission.RECRUITMENT_READ, Permission.RECRUITMENT_MANAGE, Permission.OFFER_MANAGE)) {
      const manage = has(Permission.RECRUITMENT_MANAGE);
      if (read || manage) {
        checks.push(
          this.prisma.candidate.findFirst({
            where: { resumeFileId: id, organizationId: user.organizationId },
            select: { id: true },
          }),
        );
      }
      if (read || manage || has(Permission.OFFER_MANAGE)) {
        checks.push(
          this.prisma.jobOffer.findFirst({
            where: {
              letterFileId: id,
              application: { candidate: { organizationId: user.organizationId } },
            },
            select: { id: true },
          }),
        );
      }
    }

    // A payslip's PDF: the employee, and payroll.
    if (read ? true : has(Permission.PAYROLL_RUN)) {
      const payroll = read ? has(Permission.PAYROLL_READ) : true;
      checks.push(
        this.prisma.payslip.findFirst({
          where: {
            pdfFileId: id,
            run: { organizationId: user.organizationId },
            OR: [
              ...(read && self && has(Permission.PAYSLIP_READ_SELF) ? [{ employeeId: self }] : []),
              ...(payroll ? [{ run: { organizationId: user.organizationId } }] : []),
            ],
          },
          select: { id: true },
        }),
      );
    }

    return (await Promise.all(checks)).some(Boolean);
  }
}
