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
