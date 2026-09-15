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
    heading: 'ภาพรวม',
    items: [
      { to: '/', label: 'แดชบอร์ด', icon: '◎' },
      { to: '/approvals', label: 'รออนุมัติ', icon: '✓', badge: 'approvals' },
      {
        to: '/assistant',
        label: 'ผู้ช่วย HR',
        icon: '✦',
        permissions: [P.ASSISTANT_USE],
        feature: 'assistantEnabled',
      },
    ],
  },
  {
    heading: 'พนักงาน',
    items: [
      {
        to: '/employees',
        label: 'ทะเบียนพนักงาน',
        icon: '☰',
        permissions: [P.EMPLOYEE_READ, P.EMPLOYEE_READ_TEAM],
      },
      { to: '/offboarding', label: 'การลาออก', icon: '↪', permissions: [P.OFFBOARDING_READ] },
      {
        to: '/performance',
        label: 'ประเมินผล / KPI',
        icon: '◈',
        permissions: [P.PERFORMANCE_READ, P.KPI_MANAGE_TEAM],
      },
    ],
  },
  {
    heading: 'เวลาและการลา',
    items: [
      { to: '/leave', label: 'การลา', icon: '⏸', permissions: [P.LEAVE_READ, P.LEAVE_READ_TEAM] },
      {
        to: '/attendance',
        label: 'ลงเวลาทำงาน',
        icon: '◔',
        permissions: [P.ATTENDANCE_READ, P.ATTENDANCE_READ_TEAM],
      },
    ],
  },
  {
    heading: 'ค่าตอบแทน',
    items: [
      { to: '/payroll', label: 'เงินเดือน', icon: '฿', permissions: [P.PAYROLL_READ] },
      { to: '/expenses', label: 'เบิกค่าใช้จ่าย', icon: '▤', permissions: [P.EXPENSE_READ] },
    ],
  },
  {
    heading: 'สรรหา',
    items: [
      { to: '/recruitment', label: 'ผู้สมัครงาน', icon: '⚑', permissions: [P.RECRUITMENT_READ] },
    ],
  },
  {
    heading: 'จัดการระบบ',
    items: [
      { to: '/documents', label: 'คำขอเอกสาร', icon: '▣', permissions: [P.DOCUMENT_ISSUE] },
      {
        to: '/knowledge',
        label: 'ฐานความรู้ HR',
        icon: '◫',
        permissions: [P.ASSISTANT_KNOWLEDGE_MANAGE],
      },
      { to: '/organization', label: 'โครงสร้างองค์กร', icon: '⌗', permissions: [P.ORG_READ] },
      { to: '/audit', label: 'บันทึกการใช้งาน', icon: '⎙', permissions: [P.AUDIT_READ] },
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
