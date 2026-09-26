// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { P } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Shown when the user holds ANY of these. Omit for "everyone". */
  permissions?: string[];
  /**
   * Shown only when the deployment has this feature switched on.
   *
   * Permissions answer "may this person", which is not the same question as
   * "does this installation have it at all". `ASSISTANT_ENABLED=false` is the
   * default, and every role carries `assistant:use`, so without this the
   * standard install offered an entry point that could only fail.
   */
  feature?: keyof PlatformFeatures;
  badge?: 'approvals';
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

/** The deployment flags navigation cares about. */
export interface PlatformFeatures {
  assistantEnabled: boolean;
}

export const NAV: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: '◎' },
      { to: '/approvals', label: 'Approvals', icon: '✓', badge: 'approvals' },
      {
        to: '/assistant',
        label: 'HR assistant',
        icon: '✦',
        permissions: [P.ASSISTANT_USE],
        feature: 'assistantEnabled',
      },
    ],
  },
  {
    heading: 'Employees',
    items: [
      {
        to: '/employees',
        label: 'Employee directory',
        icon: '☰',
        permissions: [P.EMPLOYEE_READ, P.EMPLOYEE_READ_TEAM],
      },
      { to: '/offboarding', label: 'Offboarding', icon: '↪', permissions: [P.OFFBOARDING_READ] },
      {
        to: '/performance',
        label: 'Performance / KPI',
        icon: '◈',
        permissions: [P.PERFORMANCE_READ, P.KPI_MANAGE_TEAM],
      },
    ],
  },
  {
    heading: 'Time & leave',
    items: [
      { to: '/leave', label: 'Leave', icon: '⏸', permissions: [P.LEAVE_READ, P.LEAVE_READ_TEAM] },
      {
        to: '/attendance',
        label: 'Attendance',
        icon: '◔',
        permissions: [P.ATTENDANCE_READ, P.ATTENDANCE_READ_TEAM],
      },
      {
        to: '/roster',
        label: 'Shifts & roster',
        icon: '◷',
        permissions: [P.SHIFT_MANAGE, P.ATTENDANCE_READ, P.ATTENDANCE_READ_TEAM],
      },
    ],
  },
  {
    heading: 'Compensation',
    items: [
      { to: '/payroll', label: 'Payroll', icon: '฿', permissions: [P.PAYROLL_READ] },
      { to: '/expenses', label: 'Expenses', icon: '▤', permissions: [P.EXPENSE_READ] },
      { to: '/benefits', label: 'Benefits', icon: '❑', permissions: [P.BENEFIT_MANAGE] },
    ],
  },
  {
    heading: 'Recruitment',
    items: [
      { to: '/recruitment', label: 'Candidates', icon: '⚑', permissions: [P.RECRUITMENT_READ] },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { to: '/documents', label: 'Document requests', icon: '▣', permissions: [P.DOCUMENT_ISSUE] },
      {
        to: '/knowledge',
        label: 'HR knowledge base',
        icon: '◫',
        permissions: [P.ASSISTANT_KNOWLEDGE_MANAGE],
      },
      { to: '/organization', label: 'Organisation structure', icon: '⌗', permissions: [P.ORG_READ] },
      { to: '/audit', label: 'Activity log', icon: '⎙', permissions: [P.AUDIT_READ] },
    ],
  },
];

/**
 * The sections this user should see, in order.
 *
 * Kept out of the component and free of React so it can be tested directly —
 * the interesting cases are combinations of permission and feature flag, and
 * pumping a tree to check which links render would test the wrong thing.
 */
export function visibleSectionsFor(
  canAny: (...permissions: string[]) => boolean,
  features: PlatformFeatures,
): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.feature && !features[item.feature]) return false;
      return !item.permissions || canAny(...item.permissions);
    }),
  })).filter((section) => section.items.length > 0);
}
