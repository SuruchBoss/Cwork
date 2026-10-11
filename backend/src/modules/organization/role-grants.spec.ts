// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { SYSTEM_ROLE_DEFINITIONS, SystemRole } from '../../core/security/roles';
import {
  canHandOut,
  departmentScopeApplies,
  OUTSIDE_THE_DEPARTMENT_LIMIT,
  readScopeDepartments,
  unlimitedAreas,
} from './role-grants';

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

describe('unlimitedAreas', () => {
  it('says a payroll officer limited to a department still reads pay for every department', () => {
    expect(unlimitedAreas(permissionsOf(SystemRole.PAYROLL_OFFICER))).toEqual(['PAY']);
  });

  it('says an HR officer still reads resignations, and pay through compensation, everywhere', () => {
    expect(unlimitedAreas(permissionsOf(SystemRole.HR_OFFICER))).toEqual(['RESIGNATIONS']);
  });

  it('says an auditor still reads pay, resignations and the audit log everywhere', () => {
    // The auditor is limited to a department too, with employee:read only.
    expect(unlimitedAreas(permissionsOf(SystemRole.AUDITOR))).toEqual([
      'PAY',
      'RESIGNATIONS',
      'AUDIT_LOG',
    ]);
  });

  it('says nothing for a role the limit does not apply to', () => {
    // A manager has employee:read:team, not employee:read, and cannot be limited.
    expect(unlimitedAreas(permissionsOf(SystemRole.MANAGER))).toEqual([]);
    // A role that manages roles or the organisation reaches past any department.
    expect(unlimitedAreas(permissionsOf(SystemRole.HR_ADMIN))).toEqual([]);
    expect(unlimitedAreas(permissionsOf(SystemRole.EMPLOYEE))).toEqual([]);
  });

  it('names an area once however many of its permissions the role holds', () => {
    const pay = OUTSIDE_THE_DEPARTMENT_LIMIT[0].permissions;
    expect(unlimitedAreas(['employee:read', ...pay])).toEqual(['PAY']);
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
