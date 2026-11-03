// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Permission } from '../../core/security/permissions';
import { MFA_REQUIRED_PERMISSIONS } from './mfa.service';

describe('Permissions that need a second factor', () => {
  it.each([
    ['reading everyone’s pay', Permission.PAYROLL_READ],
    ['exporting payroll', Permission.PAYROLL_EXPORT],
    ['reading the audit trail', Permission.AUDIT_READ],
    ['running payroll', Permission.PAYROLL_RUN],
    ['approving payroll', Permission.PAYROLL_APPROVE],
    ['reading sensitive employee data', Permission.EMPLOYEE_READ_SENSITIVE],
    ['managing roles', Permission.ROLE_MANAGE],
  ])('includes %s', (_what, permission) => {
    expect(MFA_REQUIRED_PERMISSIONS).toContain(permission);
  });
});
