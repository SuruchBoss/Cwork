// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { employeeVisibilityFilter } from '../../core/security/employee-access';
import { Permission } from '../../core/security/permissions';
import { formatDateOnly, formatThaiDate, toDateOnly } from '../../core/utils/date.util';
import { NotificationsService } from '../notifications/notifications.service';
import { organizationToday } from '../organization/organization-today';
import { daysLeft, windowOf, type ExpiringDocument } from './domain/document-expiry';

/** Nobody who has left is listed or told about. */
const LEFT: EmployeeStatus[] = [
  EmployeeStatus.RESIGNED,
  EmployeeStatus.TERMINATED,
  EmployeeStatus.RETIRED,
];

const DOCUMENT_TH: Record<ExpiringDocument, string> = {
  PASSPORT: 'พาสปอร์ต',
  WORK_PERMIT: 'ใบอนุญาตทำงาน',
};

export interface ExpiringDocumentItem {
  employeeId: string;
  employeeCode: string;
  name: string;
  document: ExpiringDocument;
  expiresOn: string;
  daysLeft: number;
  /** 90, 60, 30, or 0 once the date has passed. */
  window: number;
}

export interface ExpiringDocumentsReport {
  today: string;
  within: number;
  items: ExpiringDocumentItem[];
}

interface Found extends ExpiringDocumentItem {
  departmentId: string | null;
}

/**
 * Passports and work permits that are about to lapse, or have (CW-073). Dates and
 * names only: this service never reads a document number, so neither the list nor
 * a notice can carry one.
 */
@Injectable()
export class DocumentExpiryService {
  private readonly logger = new Logger(DocumentExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** What HR can see, soonest first: expired, then expiring within 30, 60 or 90 days. */
  async list(user: AuthenticatedUser, within = 90): Promise<ExpiringDocumentsReport> {
    const today = formatDateOnly(await organizationToday(this.prisma, user.organizationId));
    const found = await this.find(employeeVisibilityFilter(user), today, within);
    return {
      today,
      within,
      items: found.map((f) => ({
        employeeId: f.employeeId,
        employeeCode: f.employeeCode,
        name: f.name,
        document: f.document,
        expiresOn: f.expiresOn,
        daysLeft: f.daysLeft,
        window: f.window,
      })),
    };
  }

  /**
   * Tells HR about every document that has entered a new window since the last
   * run. A window is announced once, however often this runs; a document first
   * seen already inside a window is announced for that window only, not for the
   * ones it has passed. Returns how many documents were announced.
   */
  async sendDueNotices(organizationId: string, now: Date = new Date()): Promise<number> {
    const today = formatDateOnly(await organizationToday(this.prisma, organizationId, now));
    const documents = await this.find({ organizationId }, today, 90);
    if (documents.length === 0) return 0;

    const recipients = await this.recipients(organizationId);
    let sent = 0;
    for (const doc of documents) {
      const userIds = [
        ...new Set(
          recipients
            .filter((r) => r.departmentId === null || r.departmentId === doc.departmentId)
            .map((r) => r.userId),
        ),
      ];
      // No one to tell: leave it unrecorded, so the next run tells whoever is HR by then.
      if (userIds.length === 0) continue;

      const announced = await this.prisma.$transaction(async (tx) => {
        const made = await tx.employeeDocumentNotice.createMany({
          data: [
            {
              organizationId,
              employeeId: doc.employeeId,
              document: doc.document,
              expiresOn: toDateOnly(doc.expiresOn),
              window: doc.window,
            },
          ],
          skipDuplicates: true,
        });
        if (made.count === 0) return false;

        const what = DOCUMENT_TH[doc.document];
        const date = formatThaiDate(doc.expiresOn);
        await this.notifications.notifyManyIn(tx, organizationId, userIds, {
          type: 'employee.document.expiring',
          title: doc.window === 0 ? 'เอกสารของพนักงานหมดอายุแล้ว' : 'เอกสารของพนักงานใกล้หมดอายุ',
          body:
            doc.window === 0
              ? `${what}ของ ${doc.name} (${doc.employeeCode}) หมดอายุเมื่อ ${date}`
              : `${what}ของ ${doc.name} (${doc.employeeCode}) จะหมดอายุใน ${doc.daysLeft} วัน (${date})`,
          data: {
            employeeId: doc.employeeId,
            document: doc.document,
            expiresOn: doc.expiresOn,
            window: doc.window,
          },
        });
        return true;
      });
      if (announced) sent += 1;
    }
    if (sent > 0) this.logger.log(`Told HR about ${sent} expiring document(s)`);
    return sent;
  }

  /** Every document, of someone who has not left, that is inside the 90-day span or past it. */
  private async find(
    scope: Prisma.EmployeeWhereInput,
    today: string,
    within: number,
  ): Promise<Found[]> {
    const limit = new Date(toDateOnly(today).getTime() + within * 86_400_000);
    const employees = await this.prisma.employee.findMany({
      where: {
        AND: [
          scope,
          {
            deletedAt: null,
            status: { notIn: LEFT },
            OR: [{ passportExpiresOn: { lte: limit } }, { workPermitExpiresOn: { lte: limit } }],
          },
        ],
      },
      select: {
        id: true,
        employeeCode: true,
        firstNameTh: true,
        lastNameTh: true,
        departmentId: true,
        passportExpiresOn: true,
        workPermitExpiresOn: true,
      },
    });

    const found: Found[] = [];
    for (const e of employees) {
      const dates: Array<[ExpiringDocument, Date | null]> = [
        ['PASSPORT', e.passportExpiresOn],
        ['WORK_PERMIT', e.workPermitExpiresOn],
      ];
      for (const [document, date] of dates) {
        if (!date) continue;
        const expiresOn = formatDateOnly(date);
        const left = daysLeft(expiresOn, today);
        const window = windowOf(left);
        if (window === null || left > within) continue;
        found.push({
          employeeId: e.id,
          employeeCode: e.employeeCode,
          name: `${e.firstNameTh} ${e.lastNameTh}`.trim(),
          document,
          expiresOn,
          daysLeft: left,
          window,
          departmentId: e.departmentId,
        });
      }
    }
    return found.sort(
      (a, b) =>
        a.expiresOn.localeCompare(b.expiresOn) || a.employeeCode.localeCompare(b.employeeCode),
    );
  }

  /**
   * People who maintain employee records (may update them), who are active and
   * whose grant has not lapsed; a grant over one department covers only that
   * department's people.
   */
  private async recipients(
    organizationId: string,
  ): Promise<Array<{ userId: string; departmentId: string | null }>> {
    const grants = await this.prisma.userRole.findMany({
      where: {
        role: { organizationId, permissions: { has: Permission.EMPLOYEE_UPDATE } },
        user: { organizationId, status: 'ACTIVE', deletedAt: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { userId: true, departmentId: true },
    });
    return grants.map((g) => ({ userId: g.userId, departmentId: g.departmentId }));
  }
}
