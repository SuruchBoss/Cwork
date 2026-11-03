// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Permission } from './permissions';
import { SYSTEM_ROLE_DEFINITIONS } from './roles';

describe('system roles', () => {
  const holding = (permission: string) =>
    SYSTEM_ROLE_DEFINITIONS.filter((role) =>
      (role.permissions as readonly string[]).includes(permission),
    );

  it('give whoever approves a payroll run the right to decide the days it pays', () => {
    const approvers = holding(Permission.PAYROLL_APPROVE);

    expect(approvers.length).toBeGreaterThan(0);
    for (const role of approvers) {
      expect({ role: role.key, attendance: role.permissions }).toEqual({
        role: role.key,
        attendance: expect.arrayContaining([Permission.ATTENDANCE_MANAGE]),
      });
    }
  });

  it('give whoever approves a payroll run the right to record leave', () => {
    for (const role of holding(Permission.PAYROLL_APPROVE)) {
      expect(role.permissions).toContain(Permission.LEAVE_RECORD);
    }
  });
});
