// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Permission constants, mirroring the server's `src/core/security/permissions.ts`.
 * The server is the enforcement point; these only decide what the UI offers.
 */
export const P = {
  ORG_READ: 'org:read',
  ORG_MANAGE: 'org:manage',
  ROLE_MANAGE: 'role:manage',
  AUDIT_READ: 'audit:read',

  EMPLOYEE_READ: 'employee:read',
  EMPLOYEE_READ_SELF: 'employee:read:self',
  EMPLOYEE_READ_TEAM: 'employee:read:team',
  EMPLOYEE_CREATE: 'employee:create',
  EMPLOYEE_UPDATE: 'employee:update',
  EMPLOYEE_READ_SENSITIVE: 'employee:read:sensitive',

  OFFBOARDING_READ: 'offboarding:read',
  OFFBOARDING_MANAGE: 'offboarding:manage',

  RECRUITMENT_READ: 'recruitment:read',
  RECRUITMENT_MANAGE: 'recruitment:manage',
  ASSESSMENT_MANAGE: 'assessment:manage',
  OFFER_MANAGE: 'offer:manage',

  PERFORMANCE_READ: 'performance:read',
  PERFORMANCE_MANAGE: 'performance:manage',
  KPI_MANAGE_TEAM: 'kpi:manage:team',
  REVIEW_CALIBRATE: 'review:calibrate',

  LEAVE_READ: 'leave:read',
  LEAVE_READ_SELF: 'leave:read:self',
  LEAVE_READ_TEAM: 'leave:read:team',
  LEAVE_MANAGE: 'leave:manage',
  LEAVE_TYPE_MANAGE: 'leave:type:manage',
  LEAVE_BALANCE_ADJUST: 'leave:balance:adjust',

  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_READ_TEAM: 'attendance:read:team',
  ATTENDANCE_MANAGE: 'attendance:manage',
  OVERTIME_MANAGE: 'overtime:manage',
  SHIFT_MANAGE: 'shift:manage',

  PAYROLL_READ: 'payroll:read',
  PAYROLL_RUN: 'payroll:run',
  PAYROLL_APPROVE: 'payroll:approve',
  PAYROLL_EXPORT: 'payroll:export',
  COMPENSATION_READ: 'compensation:read',
  COMPENSATION_MANAGE: 'compensation:manage',
  BENEFIT_READ: 'benefit:read',
  BENEFIT_MANAGE: 'benefit:manage',
  EXPENSE_READ: 'expense:read',
  EXPENSE_MANAGE: 'expense:manage',

  APPROVAL_ACT: 'approval:act',
  APPROVAL_POLICY_MANAGE: 'approval:policy:manage',
  DOCUMENT_ISSUE: 'document:issue',

  ASSISTANT_USE: 'assistant:use',
  ASSISTANT_KNOWLEDGE_MANAGE: 'assistant:knowledge:manage',
  ASSISTANT_CONVERSATION_AUDIT: 'assistant:conversation:audit',
} as const;
