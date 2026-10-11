// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { SYSTEM_ROLE_DEFINITIONS, SystemRole } from '../../core/security/roles';
import { canHandOut, departmentScopeApplies, readScopeDepartments } from './role-grants';

const permissionsOf = (key: string): string[] =>
  SYSTEM_ROLE_DEFINITIONS.find((role) => role.key === key)!.permissions;

describe('canHandOut', () => {
  it('lets a super administrator hand out every system role', () => {
    const all = permissionsOf(SystemRole.SUPER_ADMIN);
    for (const role of SYSTEM_ROLE_DEFINITIONS) {
      expect(canHandOut(all, role.permissions)).toBe(true);
    }
  });

  it('stops an HR manager, who holds role:manage, from making anyone a super administrator', () => {
    const hrAdmin = permissionsOf(SystemRole.HR_ADMIN);
    expect(canHandOut(hrAdmin, permissionsOf(SystemRole.SUPER_ADMIN))).toBe(false);
    expect(canHandOut(hrAdmin, permissionsOf(SystemRole.HR_OFFICER))).toBe(true);
    expect(canHandOut(hrAdmin, permissionsOf(SystemRole.PAYROLL_OFFICER))).toBe(true);
  });
});

describe('departmentScopeApplies', () => {
  it('applies to roles that read every employee and manage nothing organisation-wide', () => {
    expect(departmentScopeApplies(permissionsOf(SystemRole.HR_OFFICER))).toBe(true);
    expect(departmentScopeApplies(permissionsOf(SystemRole.SUPER_ADMIN))).toBe(false);
    expect(departmentScopeApplies(permissionsOf(SystemRole.HR_ADMIN))).toBe(false);
    expect(departmentScopeApplies(permissionsOf(SystemRole.EMPLOYEE))).toBe(false);
  });
});

describe('readScopeDepartments', () => {
  const officer = permissionsOf(SystemRole.HR_OFFICER);
  const manager = permissionsOf(SystemRole.MANAGER);

  it('narrows to the departments of the grants that read every employee', () => {
    expect(
      readScopeDepartments([
        { departmentId: 'd1', permissions: officer },
        { departmentId: null, permissions: manager },
      ]),
    ).toEqual(['d1']);
  });

  it('is not narrowed by a department limit on a role without employee:read', () => {
    expect(
      readScopeDepartments([
        { departmentId: null, permissions: officer },
        { departmentId: 'd1', permissions: manager },
      ]),
    ).toEqual([]);
  });

  it('is lifted by one grant of employee:read without a department', () => {
    expect(
      readScopeDepartments([
        { departmentId: 'd1', permissions: officer },
        { departmentId: null, permissions: officer },
      ]),
    ).toEqual([]);
  });
});
