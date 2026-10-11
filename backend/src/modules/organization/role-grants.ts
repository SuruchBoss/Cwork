// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Permission } from '../../core/security/permissions';

/**
 * Rules for handing roles to accounts from the console (CW-079). Plain
 * functions, so the guard-rails are tested without a database.
 */

/**
 * Whether someone holding `actorPermissions` may grant or remove a role made of
 * `rolePermissions`. `role:manage` alone is not enough: an HR manager holds it
 * but not every permission, and must not be able to make anyone, themselves
 * included, a super administrator. A role can only be handed out, or taken
 * away, by someone who already holds everything in it.
 */
export function canHandOut(
  actorPermissions: readonly string[],
  rolePermissions: readonly string[],
): boolean {
  const held = new Set(actorPermissions);
  return rolePermissions.every((permission) => held.has(permission));
}

/**
 * A department limit narrows `employee:read` to that department. It means
 * nothing on a role without `employee:read`, and it is misleading on one that
 * manages roles or the organisation, which reach past any department.
 */
export function departmentScopeApplies(rolePermissions: readonly string[]): boolean {
  const held = new Set(rolePermissions);
  return (
    held.has(Permission.EMPLOYEE_READ) &&
    !held.has(Permission.ROLE_MANAGE) &&
    !held.has(Permission.ORG_MANAGE)
  );
}

/**
 * What a department limit does not narrow (CW-083). The limit is a filter on
 * employee queries, so it reaches employees and what hangs off them (leave,
 * attendance, overtime, expenses, performance, documents). These are read for
 * the whole organisation by whoever holds the permission, department limit or
 * not, so a role carrying one still shows the other departments' data. The
 * console names the areas when a limit is chosen; the list is the one place to
 * add to when a permission is found to sit outside the filter.
 */
export const OUTSIDE_THE_DEPARTMENT_LIMIT = [
  {
    area: 'PAY',
    permissions: [
      Permission.PAYROLL_READ,
      Permission.PAYROLL_RUN,
      Permission.PAYROLL_APPROVE,
      Permission.PAYROLL_EXPORT,
      Permission.COMPENSATION_READ,
      Permission.COMPENSATION_MANAGE,
    ],
  },
  {
    area: 'RESIGNATIONS',
    permissions: [Permission.OFFBOARDING_READ, Permission.OFFBOARDING_MANAGE],
  },
  { area: 'AUDIT_LOG', permissions: [Permission.AUDIT_READ] },
] as const;

export type UnlimitedArea = (typeof OUTSIDE_THE_DEPARTMENT_LIMIT)[number]['area'];

/**
 * The areas a role with these permissions still reads across every department
 * when it is limited to one, in a fixed order. Empty for a role the limit does
 * not apply to, or one that carries nothing outside it.
 */
export function unlimitedAreas(rolePermissions: readonly string[]): UnlimitedArea[] {
  if (!departmentScopeApplies(rolePermissions)) return [];
  const held = new Set(rolePermissions);
  return OUTSIDE_THE_DEPARTMENT_LIMIT.filter(({ permissions }) =>
    permissions.some((permission) => held.has(permission)),
  ).map(({ area }) => area);
}

export interface ScopedGrant {
  departmentId: string | null;
  permissions: readonly string[];
}

/**
 * The departments an account's `employee:read` is narrowed to; empty means the
 * whole organisation. Only grants that carry `employee:read` count, and one of
 * them without a department lifts the limit: an HR officer for everyone who is
 * also a manager limited to one department still sees everyone.
 */
export function readScopeDepartments(grants: readonly ScopedGrant[]): string[] {
  const reading = grants.filter((grant) => grant.permissions.includes(Permission.EMPLOYEE_READ));
  if (reading.length === 0 || reading.some((grant) => grant.departmentId === null)) return [];
  return [...new Set(reading.map((grant) => grant.departmentId as string))];
}
