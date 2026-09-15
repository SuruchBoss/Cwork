import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  EmployeeStatus,
  EmploymentEventType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../core/errors/domain.errors';
import { PageDto } from '../../core/http/pagination.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/security/crypto.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { Permission } from '../../core/security/permissions';
import { SystemRole } from '../../core/security/roles';
import { toDateOnly } from '../../core/utils/date.util';
import { SequenceService } from '../../core/utils/sequence.service';
import { AuditService } from '../audit/audit.service';
import { employeeVisibilityFilter } from '../../core/security/employee-access';
import type {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
  UpdateOwnProfileDto,
} from './dto/employee.dto';

/** Columns safe to return in a list view — no encrypted PII. */
const LIST_SELECT = {
  id: true,
  employeeCode: true,
  firstNameTh: true,
  lastNameTh: true,
  firstNameEn: true,
  lastNameEn: true,
  nickname: true,
  workEmail: true,
  phone: true,
  photoFileId: true,
  status: true,
  employmentType: true,
  hireDate: true,
  department: { select: { id: true, name: true, code: true } },
  position: { select: { id: true, title: true, level: true } },
  workLocation: { select: { id: true, name: true } },
  manager: { select: { id: true, firstNameTh: true, lastNameTh: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser, query: EmployeeQueryDto) {
    const where: Prisma.EmployeeWhereInput = {
      AND: [
        employeeVisibilityFilter(user),
        { deletedAt: null },
        query.status?.length ? { status: { in: query.status } } : {},
        query.departmentId ? { departmentId: query.departmentId } : {},
        query.positionId ? { positionId: query.positionId } : {},
        query.managerId ? { managerId: query.managerId } : {},
        query.employmentType ? { employmentType: query.employmentType } : {},
        query.search ? searchFilter(query.search) : {},
      ],
    };

    const orderBy = buildOrderBy(query.sortBy, query.sortOrder);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: LIST_SELECT,
        orderBy,
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return PageDto.of(data, total, query.page, query.limit);
  }

  /**
   * Full profile. Encrypted identifiers are decrypted only for callers holding
   * `employee:read:sensitive`, and that read is written to the audit log.
   */
  async findOne(user: AuthenticatedUser, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { AND: [employeeVisibilityFilter(user), { id, deletedAt: null }] },
      include: {
        department: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, title: true, level: true } },
        workLocation: { select: { id: true, name: true } },
        manager: { select: { id: true, firstNameTh: true, lastNameTh: true, employeeCode: true } },
        directReports: {
          select: { id: true, firstNameTh: true, lastNameTh: true, employeeCode: true },
        },
        contacts: true,
        user: { select: { id: true, email: true, status: true, lastLoginAt: true } },
      },
    });
    if (!employee) throw new NotFoundError('Employee', id);

    const canSeeSensitive =
      user.permissions.includes(Permission.EMPLOYEE_READ_SENSITIVE) || user.employeeId === id;

    const { nationalIdEnc, passportNoEnc, taxIdEnc, socialSecurityNoEnc, ...rest } = employee;

    if (!canSeeSensitive) {
      return {
        ...rest,
        nationalIdMasked: employee.nationalIdLast4 ? `•••• ${employee.nationalIdLast4}` : null,
      };
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.READ,
      entityType: 'Employee',
      entityId: id,
      summary: 'Viewed sensitive identifiers',
    });

    return {
      ...rest,
      nationalId: this.crypto.decrypt(nationalIdEnc),
      passportNo: this.crypto.decrypt(passportNoEnc),
      taxId: this.crypto.decrypt(taxIdEnc),
      socialSecurityNo: this.crypto.decrypt(socialSecurityNoEnc),
    };
  }

  async create(user: AuthenticatedUser, dto: CreateEmployeeDto) {
    const employeeCode =
      dto.employeeCode ?? (await this.sequences.next(user.organizationId, 'EMPLOYEE'));

    const existing = await this.prisma.employee.findFirst({
      where: { organizationId: user.organizationId, employeeCode },
      select: { id: true },
    });
    if (existing)
      throw new ConflictError('DUPLICATE_EMPLOYEE_CODE', `Employee code ${employeeCode} is taken`);

    if (dto.managerId) await this.assertEmployeeInOrg(user.organizationId, dto.managerId);

    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          organizationId: user.organizationId,
          employeeCode,
          firstNameTh: dto.firstNameTh,
          lastNameTh: dto.lastNameTh,
          firstNameEn: dto.firstNameEn,
          lastNameEn: dto.lastNameEn,
          nickname: dto.nickname,
          dateOfBirth: dto.dateOfBirth ? toDateOnly(dto.dateOfBirth) : null,
          gender: dto.gender,
          maritalStatus: dto.maritalStatus,
          nationalIdEnc: this.crypto.encrypt(dto.nationalId),
          nationalIdLast4: dto.nationalId ? CryptoService.lastChars(dto.nationalId) : null,
          taxIdEnc: this.crypto.encrypt(dto.taxId),
          socialSecurityNoEnc: this.crypto.encrypt(dto.socialSecurityNo),
          personalEmail: dto.personalEmail,
          workEmail: dto.workEmail,
          phone: dto.phone,
          addressLine: dto.addressLine,
          province: dto.province,
          postalCode: dto.postalCode,
          departmentId: dto.departmentId,
          positionId: dto.positionId,
          workLocationId: dto.workLocationId,
          managerId: dto.managerId,
          employmentType: dto.employmentType,
          hireDate: toDateOnly(dto.hireDate),
          probationEndDate: dto.probationEndDate ? toDateOnly(dto.probationEndDate) : null,
          status: dto.probationEndDate ? EmployeeStatus.PROBATION : EmployeeStatus.ACTIVE,
        },
      });

      await tx.employmentEvent.create({
        data: {
          employeeId: created.id,
          type: EmploymentEventType.HIRE,
          effectiveDate: created.hireDate,
          newValue: { employeeCode, hireDate: dto.hireDate } as Prisma.InputJsonValue,
          recordedById: user.userId,
        },
      });

      if (dto.createUserAccount) {
        const email = dto.workEmail ?? dto.personalEmail;
        if (!email) {
          throw new BusinessRuleError(
            'EMAIL_REQUIRED_FOR_ACCOUNT',
            'A work or personal email is required to create a login',
          );
        }
        const employeeRole = await tx.role.findUnique({
          where: {
            organizationId_key: { organizationId: user.organizationId, key: SystemRole.EMPLOYEE },
          },
        });
        const account = await tx.user.create({
          data: {
            organizationId: user.organizationId,
            email,
            // Invited: no password yet, so the account cannot be signed into
            // until the invitation flow sets one.
            status: UserStatus.INVITED,
            ...(employeeRole ? { roles: { create: { roleId: employeeRole.id } } } : {}),
          },
        });
        await tx.employee.update({ where: { id: created.id }, data: { userId: account.id } });
      }

      return created;
    });

    return this.findOne(user, employee.id);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEmployeeDto) {
    const before = await this.prisma.employee.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!before) throw new NotFoundError('Employee', id);

    if (dto.managerId) {
      if (dto.managerId === id) {
        throw new BusinessRuleError('SELF_MANAGER', 'An employee cannot report to themselves');
      }
      await this.assertEmployeeInOrg(user.organizationId, dto.managerId);
      await this.assertNoReportingCycle(id, dto.managerId);
    }

    const {
      nationalId,
      taxId,
      socialSecurityNo,
      hireDate,
      dateOfBirth,
      probationEndDate,
      ...rest
    } = dto;

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        ...rest,
        ...(hireDate ? { hireDate: toDateOnly(hireDate) } : {}),
        ...(dateOfBirth ? { dateOfBirth: toDateOnly(dateOfBirth) } : {}),
        ...(probationEndDate ? { probationEndDate: toDateOnly(probationEndDate) } : {}),
        ...(nationalId !== undefined
          ? {
              nationalIdEnc: this.crypto.encrypt(nationalId),
              nationalIdLast4: nationalId ? CryptoService.lastChars(nationalId) : null,
            }
          : {}),
        ...(taxId !== undefined ? { taxIdEnc: this.crypto.encrypt(taxId) } : {}),
        ...(socialSecurityNo !== undefined
          ? { socialSecurityNoEnc: this.crypto.encrypt(socialSecurityNo) }
          : {}),
      },
    });

    await this.recordStructuralChanges(user, before, updated);

    await this.audit.recordChange(
      {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: AuditAction.UPDATE,
        entityType: 'Employee',
        entityId: id,
      },
      before as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    return this.findOne(user, id);
  }

  /** Self-service profile edit: a strict subset of fields, own record only. */
  async updateOwnProfile(user: AuthenticatedUser, dto: UpdateOwnProfileDto) {
    if (!user.employeeId) {
      throw new BusinessRuleError(
        'NOT_AN_EMPLOYEE',
        'This account is not linked to an employee record',
      );
    }
    await this.prisma.employee.update({ where: { id: user.employeeId }, data: dto });
    return this.findOne(user, user.employeeId);
  }

  async listDirectReports(user: AuthenticatedUser, managerEmployeeId: string) {
    return this.prisma.employee.findMany({
      where: {
        AND: [
          employeeVisibilityFilter(user),
          {
            managerId: managerEmployeeId,
            deletedAt: null,
            status: { notIn: [EmployeeStatus.RESIGNED, EmployeeStatus.TERMINATED] },
          },
        ],
      },
      select: LIST_SELECT,
      orderBy: { firstNameTh: 'asc' },
    });
  }

  listEmploymentEvents(organizationId: string, employeeId: string) {
    return this.prisma.employmentEvent.findMany({
      where: { employeeId, employee: { organizationId } },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async softDelete(user: AuthenticatedUser, id: string): Promise<void> {
    await this.assertEmployeeInOrg(user.organizationId, id);
    await this.prisma.$transaction([
      this.prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } }),
      // Disabling the login is the part that actually revokes access.
      this.prisma.user.updateMany({
        where: { employee: { id } },
        data: { status: UserStatus.DISABLED, sessionsValidFrom: new Date() },
      }),
    ]);
  }

  // ------------------------------------------------------------------ helpers

  private async assertEmployeeInOrg(organizationId: string, employeeId: string): Promise<void> {
    const found = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundError('Employee', employeeId);
  }

  /** A reporting line must stay a tree; cycles break approval routing. */
  private async assertNoReportingCycle(employeeId: string, managerId: string): Promise<void> {
    const seen = new Set<string>([employeeId]);
    let cursor: string | null = managerId;
    while (cursor) {
      if (seen.has(cursor)) {
        throw new BusinessRuleError(
          'REPORTING_CYCLE',
          'That manager reports (directly or indirectly) to this employee',
        );
      }
      seen.add(cursor);
      const next: { managerId: string | null } | null = await this.prisma.employee.findUnique({
        where: { id: cursor },
        select: { managerId: true },
      });
      cursor = next?.managerId ?? null;
    }
  }

  /** Writes an EmploymentEvent for changes people care about historically. */
  private async recordStructuralChanges(
    user: AuthenticatedUser,
    before: { positionId: string | null; departmentId: string | null; managerId: string | null },
    after: {
      positionId: string | null;
      departmentId: string | null;
      managerId: string | null;
      id: string;
    },
  ): Promise<void> {
    const events: Array<{ type: EmploymentEventType; previousValue: unknown; newValue: unknown }> =
      [];

    if (before.positionId !== after.positionId) {
      events.push({
        type: EmploymentEventType.PROMOTION,
        previousValue: { positionId: before.positionId },
        newValue: { positionId: after.positionId },
      });
    }
    if (before.departmentId !== after.departmentId) {
      events.push({
        type: EmploymentEventType.TRANSFER,
        previousValue: { departmentId: before.departmentId },
        newValue: { departmentId: after.departmentId },
      });
    }
    if (before.managerId !== after.managerId) {
      events.push({
        type: EmploymentEventType.MANAGER_CHANGE,
        previousValue: { managerId: before.managerId },
        newValue: { managerId: after.managerId },
      });
    }

    if (events.length === 0) return;

    await this.prisma.employmentEvent.createMany({
      data: events.map((event) => ({
        employeeId: after.id,
        type: event.type,
        effectiveDate: toDateOnly(new Date()),
        previousValue: event.previousValue as Prisma.InputJsonValue,
        newValue: event.newValue as Prisma.InputJsonValue,
        recordedById: user.userId,
      })),
    });
  }
}

function searchFilter(term: string): Prisma.EmployeeWhereInput {
  return {
    OR: [
      { firstNameTh: { contains: term, mode: 'insensitive' } },
      { lastNameTh: { contains: term, mode: 'insensitive' } },
      { firstNameEn: { contains: term, mode: 'insensitive' } },
      { lastNameEn: { contains: term, mode: 'insensitive' } },
      { nickname: { contains: term, mode: 'insensitive' } },
      { employeeCode: { contains: term, mode: 'insensitive' } },
      { workEmail: { contains: term, mode: 'insensitive' } },
    ],
  };
}

/** Allow-list of sortable columns — never interpolate a client string. */
const SORTABLE = new Set([
  'employeeCode',
  'firstNameTh',
  'lastNameTh',
  'hireDate',
  'status',
  'createdAt',
]);

function buildOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc',
): Prisma.EmployeeOrderByWithRelationInput {
  if (sortBy && SORTABLE.has(sortBy)) {
    return { [sortBy]: sortOrder } as Prisma.EmployeeOrderByWithRelationInput;
  }
  return { employeeCode: 'asc' };
}
