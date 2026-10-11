// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, Prisma, UserStatus } from '@prisma/client';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  ErrorCode,
  NotFoundError,
} from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { employeeVisibilityFilter } from '../../core/security/employee-access';
import { Permission } from '../../core/security/permissions';
import { SystemRole } from '../../core/security/roles';
import { formatDateOnly, toDateOnly, workDateFor, zonedInstant } from '../../core/utils/date.util';
import { AuditService } from '../audit/audit.service';
import { MFA_REQUIRED_PERMISSIONS } from '../auth/mfa.service';
import { UserContextService } from '../auth/user-context.service';
import type { GrantRoleDto } from './dto/user-roles.dto';
import { canHandOut, departmentScopeApplies } from './role-grants';

export interface RoleChangeMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

const grantInclude = {
  role: { select: { key: true, name: true, permissions: true } },
  department: { select: { id: true, name: true, code: true } },
} satisfies Prisma.UserRoleInclude;

type GrantRow = Prisma.UserRoleGetPayload<{ include: typeof grantInclude }>;

/**
 * Hands system roles to an employee's account from the console (CW-079).
 *
 * Until this existed, only setup gave anyone more than `EMPLOYEE`, so a pilot's
 * HR person could only be made an officer in SQL. Every change is audited, and
 * the account it touches is signed out of every device so its next session
 * starts from the new set of roles, and enrols a second factor if a new role
 * needs one.
 */
@Injectable()
export class UserRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
  ) {}

  async list(actor: AuthenticatedUser, employeeId: string) {
    const { account, timezone } = await this.accountOf(actor, employeeId);
    const roles = await this.prisma.role.findMany({
      where: { organizationId: actor.organizationId, isSystem: true },
      select: { key: true, name: true, description: true, permissions: true },
    });
    const order = Object.values(SystemRole) as string[];
    roles.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

    const grants = account
      ? await this.prisma.userRole.findMany({
          where: { userId: account.id },
          include: grantInclude,
          orderBy: { grantedAt: 'asc' },
        })
      : [];

    return {
      account: account
        ? {
            id: account.id,
            email: account.email,
            status: account.status,
            mfaEnabled: account.mfaEnabled,
          }
        : null,
      isSelf: account?.id === actor.userId,
      grants: grants.map((grant) => this.present(grant, timezone)),
      roles: roles.map((role) => ({
        key: role.key,
        name: role.name,
        description: role.description,
        requiresSecondFactor: requiresSecondFactor(role.permissions),
        departmentScopeApplies: departmentScopeApplies(role.permissions),
        grantable: canHandOut(actor.permissions, role.permissions),
      })),
    };
  }

  async grant(
    actor: AuthenticatedUser,
    employeeId: string,
    dto: GrantRoleDto,
    meta: RoleChangeMeta,
  ) {
    const { account, timezone } = await this.accountOf(actor, employeeId);
    if (!account) {
      throw new BusinessRuleError(
        ErrorCode.EMPLOYEE_HAS_NO_ACCOUNT,
        'This employee has no account to give a role to',
      );
    }
    if (account.status === UserStatus.DISABLED) {
      throw new BusinessRuleError(ErrorCode.ACCOUNT_DISABLED, 'This account is disabled');
    }

    const role = await this.prisma.role.findFirst({
      where: { organizationId: actor.organizationId, key: dto.roleKey, isSystem: true },
    });
    if (!role) throw new NotFoundError('Role', dto.roleKey);
    assertCanHandOut(actor, role.permissions);

    const departmentId = dto.departmentId ?? null;
    let departmentName: string | null = null;
    if (departmentId) {
      if (!departmentScopeApplies(role.permissions)) {
        throw new BusinessRuleError(
          ErrorCode.DEPARTMENT_SCOPE_NOT_APPLICABLE,
          `${role.key} cannot be limited to a department`,
        );
      }
      const department = await this.prisma.department.findFirst({
        where: { id: departmentId, organizationId: actor.organizationId, deletedAt: null },
        select: { name: true },
      });
      if (!department) throw new NotFoundError('Department', departmentId);
      departmentName = department.name;
    }

    let expiresAt: Date | null = null;
    if (dto.expiresOn) {
      const lastDay = toDateOnly(dto.expiresOn);
      if (lastDay < workDateFor(new Date(), timezone)) {
        throw new BusinessRuleError(
          ErrorCode.ROLE_EXPIRY_IN_PAST,
          'The last day has already passed',
        );
      }
      // The role applies through the last day, so it lapses at the next local midnight.
      expiresAt = zonedInstant(lastDay, '00:00', timezone, 1);
    }

    const signOut = account.id !== actor.userId;
    const created = await this.prisma.$transaction(async (tx) => {
      await lockRolesOf(tx, actor.organizationId);
      const existing = await tx.userRole.findMany({
        where: { userId: account.id, roleId: role.id, departmentId },
        select: { id: true, expiresAt: true },
      });
      const now = new Date();
      if (existing.some((row) => row.expiresAt === null || row.expiresAt > now)) {
        throw new ConflictError(
          ErrorCode.ROLE_ALREADY_GRANTED,
          `The account already holds ${role.key}`,
        );
      }
      // A lapsed grant of the same role is replaced rather than left beside the new one.
      if (existing.length > 0) {
        await tx.userRole.deleteMany({ where: { id: { in: existing.map((row) => row.id) } } });
      }
      const row = await tx.userRole.create({
        data: {
          userId: account.id,
          roleId: role.id,
          departmentId,
          expiresAt,
          grantedById: actor.userId,
        },
        include: grantInclude,
      });
      if (signOut) await signOutEverywhere(tx, account.id, 'ROLES_CHANGED');
      return row;
    });
    this.userContext.invalidate(account.id);

    const scope = [
      departmentName ? `department ${departmentName}` : null,
      dto.expiresOn ? `until ${dto.expiresOn}` : null,
    ].filter(Boolean);
    await this.audit.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: account.id,
      summary: `Granted ${role.key} to ${account.email}${scope.length ? ` (${scope.join(', ')})` : ''}`,
      changes: { granted: role.key, departmentId, expiresAt: expiresAt?.toISOString() ?? null },
      ...meta,
    });

    return {
      grant: this.present(created, timezone),
      signedOut: signOut,
      secondFactorRequired: requiresSecondFactor(role.permissions) && !account.mfaEnabled,
    };
  }

  async revoke(
    actor: AuthenticatedUser,
    employeeId: string,
    grantId: string,
    meta: RoleChangeMeta,
  ) {
    const { account } = await this.accountOf(actor, employeeId);
    const grant = account
      ? await this.prisma.userRole.findFirst({
          where: { id: grantId, userId: account.id },
          include: grantInclude,
        })
      : null;
    if (!account || !grant) throw new NotFoundError('Role grant', grantId);
    assertCanHandOut(actor, grant.role.permissions);

    const isSelf = account.id === actor.userId;
    if (isSelf && grant.role.permissions.includes(Permission.ROLE_MANAGE)) {
      throw new BusinessRuleError(
        ErrorCode.CANNOT_REMOVE_OWN_ROLE_MANAGE,
        'You cannot take away your own right to manage roles',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await lockRolesOf(tx, actor.organizationId);
      if (grant.role.key === SystemRole.SUPER_ADMIN && grant.departmentId === null) {
        const others = await tx.userRole.count({
          where: {
            id: { not: grant.id },
            departmentId: null,
            expiresAt: null,
            role: { organizationId: actor.organizationId, key: SystemRole.SUPER_ADMIN },
            user: { status: UserStatus.ACTIVE, deletedAt: null },
          },
        });
        if (others === 0) {
          throw new BusinessRuleError(
            ErrorCode.LAST_SUPER_ADMIN,
            'This is the last super administrator; make someone else one first',
          );
        }
      }
      await tx.userRole.delete({ where: { id: grant.id } });
      if (!isSelf) await signOutEverywhere(tx, account.id, 'ROLES_CHANGED');
    });
    this.userContext.invalidate(account.id);

    await this.audit.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: account.id,
      summary: `Removed ${grant.role.key} from ${account.email}${
        grant.department ? ` (department ${grant.department.name})` : ''
      }`,
      changes: { removed: grant.role.key, departmentId: grant.departmentId },
      ...meta,
    });

    return { signedOut: !isSelf };
  }

  private async accountOf(actor: AuthenticatedUser, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { AND: [employeeVisibilityFilter(actor), { id: employeeId, deletedAt: null }] },
      select: {
        organization: { select: { timezone: true } },
        user: {
          select: { id: true, email: true, status: true, mfaEnabled: true, deletedAt: true },
        },
      },
    });
    if (!employee) throw new NotFoundError('Employee', employeeId);
    const account = employee.user && !employee.user.deletedAt ? employee.user : null;
    return { account, timezone: employee.organization.timezone };
  }

  private present(grant: GrantRow, timezone: string) {
    return {
      id: grant.id,
      roleKey: grant.role.key,
      roleName: grant.role.name,
      department: grant.department,
      grantedAt: grant.grantedAt.toISOString(),
      expiresOn: grant.expiresAt
        ? formatDateOnly(workDateFor(new Date(grant.expiresAt.getTime() - 1), timezone))
        : null,
      expired: grant.expiresAt !== null && grant.expiresAt <= new Date(),
    };
  }
}

function requiresSecondFactor(permissions: readonly string[]): boolean {
  return MFA_REQUIRED_PERMISSIONS.some((permission) => permissions.includes(permission));
}

function assertCanHandOut(actor: AuthenticatedUser, rolePermissions: readonly string[]): void {
  if (!canHandOut(actor.permissions, rolePermissions)) {
    throw new DomainError(
      ErrorCode.ROLE_ABOVE_YOUR_OWN,
      'You can only give or take away a role whose permissions you hold yourself',
      HttpStatus.FORBIDDEN,
    );
  }
}

/** One role change at a time per organisation, so two can't remove the last super administrator. */
async function lockRolesOf(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user-roles:${organizationId}`}))`;
}

async function signOutEverywhere(
  tx: Prisma.TransactionClient,
  userId: string,
  reason: string,
): Promise<void> {
  const now = new Date();
  await tx.user.update({ where: { id: userId }, data: { sessionsValidFrom: now } });
  await tx.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
}
