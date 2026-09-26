// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Every protected endpoint declares the permissions it needs with
 * `@RequirePermissions(...)`. Roles are just named bundles of these strings, so
 * a customer can build their own role without a code change.
 *
 * Naming: `<resource>:<action>`. `:self` variants let an employee act on their
 * own record only; the guard plus an ownership check in the service enforce it.
 */
export const Permission = {
  // Organisation & configuration
  ORG_READ: 'org:read',
  ORG_MANAGE: 'org:manage',
  ROLE_MANAGE: 'role:manage',
  AUDIT_READ: 'audit:read',

  // Employees
  EMPLOYEE_READ: 'employee:read',
  EMPLOYEE_READ_SELF: 'employee:read:self',
  EMPLOYEE_READ_TEAM: 'employee:read:team',
  EMPLOYEE_CREATE: 'employee:create',
  EMPLOYEE_UPDATE: 'employee:update',
  EMPLOYEE_UPDATE_SELF: 'employee:update:self',
  EMPLOYEE_DELETE: 'employee:delete',
  /** Decrypting national ID / bank account is a separate, audited privilege. */
  EMPLOYEE_READ_SENSITIVE: 'employee:read:sensitive',
  EMPLOYEE_EXPORT: 'employee:export',

  // Offboarding
  OFFBOARDING_READ: 'offboarding:read',
  OFFBOARDING_MANAGE: 'offboarding:manage',
  RESIGNATION_SUBMIT_SELF: 'resignation:submit:self',

  // Recruitment
  RECRUITMENT_READ: 'recruitment:read',
  RECRUITMENT_MANAGE: 'recruitment:manage',
  ASSESSMENT_MANAGE: 'assessment:manage',
  ASSESSMENT_GRADE: 'assessment:grade',
  INTERVIEW_CONDUCT: 'interview:conduct',
  OFFER_MANAGE: 'offer:manage',

  // Performance
  PERFORMANCE_READ: 'performance:read',
  PERFORMANCE_READ_SELF: 'performance:read:self',
  PERFORMANCE_MANAGE: 'performance:manage',
  KPI_MANAGE_TEAM: 'kpi:manage:team',
  REVIEW_SUBMIT: 'review:submit',
  REVIEW_CALIBRATE: 'review:calibrate',

  // Leave
  LEAVE_READ: 'leave:read',
  LEAVE_READ_SELF: 'leave:read:self',
  LEAVE_READ_TEAM: 'leave:read:team',
  LEAVE_REQUEST_SELF: 'leave:request:self',
  LEAVE_MANAGE: 'leave:manage',
  LEAVE_TYPE_MANAGE: 'leave:type:manage',
  LEAVE_BALANCE_ADJUST: 'leave:balance:adjust',

  // Attendance
  ATTENDANCE_CLOCK_SELF: 'attendance:clock:self',
  ATTENDANCE_READ_SELF: 'attendance:read:self',
  ATTENDANCE_READ_TEAM: 'attendance:read:team',
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_MANAGE: 'attendance:manage',
  OVERTIME_REQUEST_SELF: 'overtime:request:self',
  OVERTIME_MANAGE: 'overtime:manage',
  SHIFT_MANAGE: 'shift:manage',

  // Payroll & money
  PAYROLL_READ: 'payroll:read',
  PAYROLL_RUN: 'payroll:run',
  PAYROLL_APPROVE: 'payroll:approve',
  PAYROLL_EXPORT: 'payroll:export',
  PAYSLIP_READ_SELF: 'payslip:read:self',
  COMPENSATION_READ: 'compensation:read',
  COMPENSATION_MANAGE: 'compensation:manage',
  BENEFIT_READ: 'benefit:read',
  BENEFIT_MANAGE: 'benefit:manage',
  EXPENSE_SUBMIT_SELF: 'expense:submit:self',
  EXPENSE_READ: 'expense:read',
  EXPENSE_MANAGE: 'expense:manage',

  // Approvals & documents
  APPROVAL_ACT: 'approval:act',
  APPROVAL_POLICY_MANAGE: 'approval:policy:manage',
  DOCUMENT_REQUEST_SELF: 'document:request:self',
  DOCUMENT_ISSUE: 'document:issue',

  // Assistant
  ASSISTANT_USE: 'assistant:use',
  ASSISTANT_KNOWLEDGE_MANAGE: 'assistant:knowledge:manage',
  ASSISTANT_CONVERSATION_AUDIT: 'assistant:conversation:audit',
} as const;

export type PermissionKey = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(Permission);
