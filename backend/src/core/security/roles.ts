import { ALL_PERMISSIONS, Permission, PermissionKey } from './permissions';

export const SystemRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  HR_ADMIN: 'HR_ADMIN',
  HR_OFFICER: 'HR_OFFICER',
  PAYROLL_OFFICER: 'PAYROLL_OFFICER',
  RECRUITER: 'RECRUITER',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  AUDITOR: 'AUDITOR',
} as const;

export type SystemRoleKey = (typeof SystemRole)[keyof typeof SystemRole];

/** Baseline every employee gets. Other roles are strictly additive on top. */
const EMPLOYEE_PERMISSIONS: PermissionKey[] = [
  Permission.EMPLOYEE_READ_SELF,
  Permission.EMPLOYEE_UPDATE_SELF,
  Permission.LEAVE_READ_SELF,
  Permission.LEAVE_REQUEST_SELF,
  Permission.ATTENDANCE_CLOCK_SELF,
  Permission.ATTENDANCE_READ_SELF,
  Permission.OVERTIME_REQUEST_SELF,
  Permission.PAYSLIP_READ_SELF,
  Permission.EXPENSE_SUBMIT_SELF,
  Permission.BENEFIT_READ,
  Permission.PERFORMANCE_READ_SELF,
  Permission.REVIEW_SUBMIT,
  Permission.DOCUMENT_REQUEST_SELF,
  Permission.RESIGNATION_SUBMIT_SELF,
  Permission.ASSISTANT_USE,
];

const MANAGER_PERMISSIONS: PermissionKey[] = [
  ...EMPLOYEE_PERMISSIONS,
  Permission.EMPLOYEE_READ_TEAM,
  Permission.LEAVE_READ_TEAM,
  Permission.ATTENDANCE_READ_TEAM,
  Permission.APPROVAL_ACT,
  Permission.KPI_MANAGE_TEAM,
  Permission.PERFORMANCE_READ,
  Permission.INTERVIEW_CONDUCT,
  Permission.RECRUITMENT_READ,
];

const RECRUITER_PERMISSIONS: PermissionKey[] = [
  ...EMPLOYEE_PERMISSIONS,
  Permission.RECRUITMENT_READ,
  Permission.RECRUITMENT_MANAGE,
  Permission.ASSESSMENT_MANAGE,
  Permission.ASSESSMENT_GRADE,
  Permission.INTERVIEW_CONDUCT,
  Permission.OFFER_MANAGE,
  Permission.EMPLOYEE_READ,
  Permission.EMPLOYEE_CREATE,
];

const PAYROLL_PERMISSIONS: PermissionKey[] = [
  ...EMPLOYEE_PERMISSIONS,
  Permission.EMPLOYEE_READ,
  Permission.PAYROLL_READ,
  Permission.PAYROLL_RUN,
  Permission.COMPENSATION_READ,
  Permission.COMPENSATION_MANAGE,
  Permission.BENEFIT_READ,
  Permission.BENEFIT_MANAGE,
  Permission.EXPENSE_READ,
  Permission.EXPENSE_MANAGE,
  Permission.ATTENDANCE_READ,
  Permission.OVERTIME_MANAGE,
  Permission.EMPLOYEE_READ_SENSITIVE,
];

const HR_OFFICER_PERMISSIONS: PermissionKey[] = [
  ...EMPLOYEE_PERMISSIONS,
  Permission.ORG_READ,
  Permission.EMPLOYEE_READ,
  Permission.EMPLOYEE_CREATE,
  Permission.EMPLOYEE_UPDATE,
  Permission.EMPLOYEE_READ_TEAM,
  Permission.LEAVE_READ,
  Permission.LEAVE_MANAGE,
  Permission.ATTENDANCE_READ,
  Permission.ATTENDANCE_MANAGE,
  Permission.OVERTIME_MANAGE,
  Permission.PERFORMANCE_READ,
  Permission.PERFORMANCE_MANAGE,
  Permission.RECRUITMENT_READ,
  Permission.RECRUITMENT_MANAGE,
  Permission.ASSESSMENT_MANAGE,
  Permission.OFFBOARDING_READ,
  Permission.OFFBOARDING_MANAGE,
  Permission.DOCUMENT_ISSUE,
  Permission.APPROVAL_ACT,
  Permission.EXPENSE_READ,
];

const HR_ADMIN_PERMISSIONS: PermissionKey[] = [
  ...HR_OFFICER_PERMISSIONS,
  ...PAYROLL_PERMISSIONS,
  ...RECRUITER_PERMISSIONS,
  Permission.ORG_MANAGE,
  Permission.ROLE_MANAGE,
  Permission.LEAVE_TYPE_MANAGE,
  Permission.LEAVE_BALANCE_ADJUST,
  Permission.SHIFT_MANAGE,
  Permission.APPROVAL_POLICY_MANAGE,
  Permission.PAYROLL_APPROVE,
  Permission.EMPLOYEE_DELETE,
  Permission.EMPLOYEE_EXPORT,
  Permission.REVIEW_CALIBRATE,
  Permission.ASSISTANT_KNOWLEDGE_MANAGE,
  Permission.AUDIT_READ,
];

/** Read-only oversight: sees records and the audit trail, changes nothing. */
const AUDITOR_PERMISSIONS: PermissionKey[] = [
  Permission.ORG_READ,
  Permission.EMPLOYEE_READ,
  Permission.LEAVE_READ,
  Permission.ATTENDANCE_READ,
  Permission.PAYROLL_READ,
  Permission.EXPENSE_READ,
  Permission.PERFORMANCE_READ,
  Permission.RECRUITMENT_READ,
  Permission.OFFBOARDING_READ,
  Permission.AUDIT_READ,
  Permission.ASSISTANT_CONVERSATION_AUDIT,
];

const unique = (perms: PermissionKey[]): PermissionKey[] => [...new Set(perms)].sort();

export interface RoleDefinition {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export const SYSTEM_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: SystemRole.SUPER_ADMIN,
    name: 'ผู้ดูแลระบบสูงสุด',
    description: 'Full access including configuration and roles. Grant sparingly.',
    permissions: unique(ALL_PERMISSIONS),
  },
  {
    key: SystemRole.HR_ADMIN,
    name: 'ผู้จัดการฝ่ายบุคคล',
    description: 'Runs the whole HR function: people, payroll, policy and approvals.',
    permissions: unique(HR_ADMIN_PERMISSIONS),
  },
  {
    key: SystemRole.HR_OFFICER,
    name: 'เจ้าหน้าที่ฝ่ายบุคคล',
    description: 'Day-to-day HR operations without payroll or configuration rights.',
    permissions: unique(HR_OFFICER_PERMISSIONS),
  },
  {
    key: SystemRole.PAYROLL_OFFICER,
    name: 'เจ้าหน้าที่เงินเดือน',
    description: 'Calculates payroll and manages compensation, benefits and claims.',
    permissions: unique(PAYROLL_PERMISSIONS),
  },
  {
    key: SystemRole.RECRUITER,
    name: 'เจ้าหน้าที่สรรหา',
    description: 'Owns the hiring pipeline from requisition through offer.',
    permissions: unique(RECRUITER_PERMISSIONS),
  },
  {
    key: SystemRole.MANAGER,
    name: 'หัวหน้างาน',
    description: 'Approves their team’s requests and manages their KPIs.',
    permissions: unique(MANAGER_PERMISSIONS),
  },
  {
    key: SystemRole.EMPLOYEE,
    name: 'พนักงาน',
    description: 'Self-service only: own profile, leave, attendance and payslips.',
    permissions: unique(EMPLOYEE_PERMISSIONS),
  },
  {
    key: SystemRole.AUDITOR,
    name: 'ผู้ตรวจสอบ',
    description: 'Read-only access across the organisation plus the audit log.',
    permissions: unique(AUDITOR_PERMISSIONS),
  },
];
