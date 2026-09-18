import { Injectable } from '@nestjs/common';
import { AuditAction, EmployeeStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Employee data retention and purge (CW-015).
 *
 * Candidate records already carry a PDPA retention date and are scrubbed;
 * employee records had no equivalent, and a leaver who asked for erasure had no
 * path. This adds one: once a leaver is far enough past their last working day,
 * their personal identifiers are redacted while the employee row and the payroll
 * history that references it stay intact — the record the law says to keep, minus
 * the personal data it no longer needs.
 *
 * A dry run lists what would be purged and changes nothing, so HR can see the
 * effect before committing to it; the purge itself audits every record it
 * touches.
 */

/**
 * How long an employee record is kept after the person leaves. Thai employment
 * and payroll records are generally retained for years, so five is a safe
 * default; it is a policy value, kept here beside the rule that applies it.
 */
const EMPLOYEE_RETENTION_MONTHS = 60;

/** The statuses that mean the person has left and the clock has started. */
const LEFT_STATUSES: EmployeeStatus[] = [
  EmployeeStatus.RESIGNED,
  EmployeeStatus.TERMINATED,
  EmployeeStatus.RETIRED,
];

export interface PurgeCandidate {
  id: string;
  employeeCode: string;
  name: string;
  lastWorkingDate: string | null;
}

@Injectable()
export class EmployeeRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The employees whose retention has lapsed — not yet redacted, past the window. */
  async preview(organizationId: string, now = new Date()): Promise<PurgeCandidate[]> {
    const rows = await this.prisma.employee.findMany({
      where: this.eligibleWhere(organizationId, now),
      select: {
        id: true,
        employeeCode: true,
        firstNameTh: true,
        lastNameTh: true,
        lastWorkingDate: true,
      },
      orderBy: { lastWorkingDate: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      employeeCode: row.employeeCode,
      name: `${row.firstNameTh} ${row.lastNameTh}`,
      lastWorkingDate: row.lastWorkingDate ? row.lastWorkingDate.toISOString().slice(0, 10) : null,
    }));
  }

  /**
   * Redacts every eligible employee and records each in the audit log.
   *
   * `actorUserId` is the HR user when run from the console and undefined when the
   * nightly job runs it. The employee row survives — payroll history points at it
   * with a restricting foreign key — so this redacts in place rather than
   * deleting, and drops the child records that are pure personal data.
   */
  async purge(
    organizationId: string,
    actorUserId?: string,
    now = new Date(),
  ): Promise<{ purged: number }> {
    const eligible = await this.prisma.employee.findMany({
      where: this.eligibleWhere(organizationId, now),
      select: { id: true, employeeCode: true },
    });

    for (const employee of eligible) {
      await this.prisma.$transaction([
        this.prisma.employeeBankAccount.deleteMany({ where: { employeeId: employee.id } }),
        this.prisma.employeeContact.deleteMany({ where: { employeeId: employee.id } }),
        this.prisma.employeeDependent.deleteMany({ where: { employeeId: employee.id } }),
        this.prisma.employee.update({
          where: { id: employee.id },
          data: {
            titleTh: null,
            firstNameTh: 'พนักงาน',
            lastNameTh: '(ลบข้อมูลแล้ว)',
            firstNameEn: null,
            lastNameEn: null,
            nickname: null,
            photoFileId: null,
            dateOfBirth: null,
            nationality: null,
            nationalIdEnc: null,
            nationalIdLast4: null,
            passportNoEnc: null,
            taxIdEnc: null,
            socialSecurityNoEnc: null,
            personalEmail: null,
            workEmail: null,
            phone: null,
            addressLine: null,
            subDistrict: null,
            district: null,
            province: null,
            postalCode: null,
            deletedAt: now,
          },
        }),
        // A redacted leaver must not retain a way in.
        this.prisma.user.updateMany({
          where: { employee: { id: employee.id } },
          data: { status: UserStatus.DISABLED, sessionsValidFrom: now },
        }),
      ]);

      await this.audit.record({
        organizationId,
        actorUserId,
        action: AuditAction.DELETE,
        entityType: 'Employee',
        entityId: employee.id,
        summary: `PDPA retention purge: redacted ${employee.employeeCode}`,
      });
    }

    return { purged: eligible.length };
  }

  private eligibleWhere(organizationId: string, now: Date): Prisma.EmployeeWhereInput {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - EMPLOYEE_RETENTION_MONTHS);
    return {
      organizationId,
      deletedAt: null,
      status: { in: LEFT_STATUSES },
      lastWorkingDate: { not: null, lt: cutoff },
    };
  }
}
