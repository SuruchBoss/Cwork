import { Prisma } from '@prisma/client';
import { AccessDeniedError } from '../../../core/errors/domain.errors';
import type { AuthenticatedUser } from '../../../core/security/current-user';
import { Permission } from '../../../core/security/permissions';

/**
 * Turns a principal into a Prisma filter describing *which employees they may
 * see*. Every employee query composes this, so a missing check cannot widen
 * access by accident.
 *
 * Precedence, widest first:
 *   1. `employee:read`            → everyone in the organisation
 *      (narrowed to their departments when the role grant is department-scoped)
 *   2. `employee:read:team`       → their direct reports, plus themselves
 *   3. `employee:read:self`       → only themselves
 */
export function employeeVisibilityFilter(user: AuthenticatedUser): Prisma.EmployeeWhereInput {
  const held = new Set<string>(user.permissions);

  if (held.has(Permission.EMPLOYEE_READ)) {
    if (user.scopedDepartmentIds.length > 0) {
      return {
        organizationId: user.organizationId,
        departmentId: { in: user.scopedDepartmentIds },
      };
    }
    return { organizationId: user.organizationId };
  }

  if (held.has(Permission.EMPLOYEE_READ_TEAM) && user.employeeId) {
    return {
      organizationId: user.organizationId,
      OR: [{ managerId: user.employeeId }, { id: user.employeeId }],
    };
  }

  if (held.has(Permission.EMPLOYEE_READ_SELF) && user.employeeId) {
    return { organizationId: user.organizationId, id: user.employeeId };
  }

  // Match nothing rather than everything: an unknown principal sees no people.
  return { organizationId: user.organizationId, id: '00000000-0000-0000-0000-000000000000' };
}

/** Throws unless the principal is linked to an employee record. */
export function requireEmployeeId(user: AuthenticatedUser): string {
  if (!user.employeeId) {
    throw new AccessDeniedError('This account is not linked to an employee record');
  }
  return user.employeeId;
}

/** True when the caller may act on `employeeId` as themselves. */
export function isSelf(user: AuthenticatedUser, employeeId: string): boolean {
  return user.employeeId === employeeId;
}
