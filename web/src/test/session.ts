// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useAuthStore } from '@/stores/auth.store';

/** Signs a test in with exactly these permissions, as the session would carry them. */
export function signInWith(...permissions: string[]): void {
  useAuthStore.setState({
    user: {
      id: 'u1',
      email: 'u1@example.com',
      displayName: 'Test',
      roles: [],
      permissions,
    },
  } as never);
}

/** The sort of person `/employees` returns, with only what a test cares about. */
export function person(code: string, department: { id: string; name: string } | null) {
  return {
    id: `e-${code}`,
    employeeCode: code,
    firstNameTh: 'ทดสอบ',
    lastNameTh: code,
    firstNameEn: null,
    lastNameEn: null,
    nickname: null,
    workEmail: null,
    phone: null,
    photoFileId: null,
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    hireDate: '2025-01-01',
    department: department ? { ...department, code: department.id.toUpperCase() } : null,
    position: null,
    workLocation: null,
    manager: null,
  };
}
