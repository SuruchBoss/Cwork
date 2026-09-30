// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Display labels for API enums, kept in one place for consistency.
 *
 * The values are English message keys (CW-016), not Thai text: each screen runs
 * the looked-up label through `t()` when it renders it, so the same map serves
 * both languages and the Thai wording lives in the i18n catalogue. An enum value
 * missing from a map falls back to the raw value, which `t()` then leaves as-is.
 */

export const employeeStatusLabels: Record<string, string> = {
  PRE_BOARDING: 'Pre-boarding',
  PROBATION: 'Probation',
  ACTIVE: 'Active',
  ON_LEAVE: 'Away on leave',
  SUSPENDED: 'Suspended',
  RESIGNED: 'Resigned',
  TERMINATED: 'Terminated',
  RETIRED: 'Retired',
};

export const leaveStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CANCELLED_AFTER_APPROVAL: 'Cancelled after approval',
};

export const attendanceStatusLabels: Record<string, string> = {
  NOT_STARTED: 'Not started',
  PRESENT: 'Present',
  LATE: 'Late',
  EARLY_LEAVE: 'Early leave',
  ABSENT: 'Absent',
  ON_LEAVE: 'On leave',
  HOLIDAY: 'Public holiday',
  DAY_OFF: 'Weekly day off',
  INCOMPLETE: 'Incomplete',
};

export const payrollStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  CALCULATING: 'Calculating',
  CALCULATED: 'Calculated',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  PAID: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export const applicationStageLabels: Record<string, string> = {
  APPLIED: 'New application',
  SCREENING: 'Screening',
  ASSESSMENT: 'Assessment',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Not selected',
  WITHDRAWN: 'Withdrawn',
};

export const approvalEntityLabels: Record<string, string> = {
  LEAVE_REQUEST: 'Leave request',
  OVERTIME_REQUEST: 'Overtime request',
  EXPENSE_CLAIM: 'Expense claim',
  ATTENDANCE_CORRECTION: 'Attendance correction',
  RESIGNATION: 'Resignation',
  JOB_REQUISITION: 'Job requisition',
  JOB_OFFER: 'Job offer',
  PAYROLL_RUN: 'Payroll run',
  DOCUMENT_REQUEST: 'Document request',
};

export const documentTypeLabels: Record<string, string> = {
  EMPLOYMENT_CERTIFICATE: 'Employment certificate',
  SALARY_CERTIFICATE: 'Salary certificate',
  PAYSLIP_COPY: 'Payslip copy',
  TAX_WITHHOLDING_50BIS: 'Tax withholding certificate (50 bis)',
  VISA_SUPPORT_LETTER: 'Visa support letter',
  BANK_LOAN_LETTER: 'Bank loan letter',
  SOCIAL_SECURITY_LETTER: 'Social security letter',
  OTHER: 'Other document',
};

export const anomalyFlagLabels: Record<string, string> = {
  MOCK_LOCATION: 'Mock location',
  ROOTED_DEVICE: 'Rooted/jailbroken device',
  OUTSIDE_GEOFENCE: 'Outside the area',
  NO_LOCATION: 'No location',
  LOW_GPS_ACCURACY: 'Low GPS accuracy',
  CLOCK_DRIFT: 'Device clock drift',
  NEW_DEVICE: 'New device',
  IMPOSSIBLE_TRAVEL: 'Impossible travel',
};

export const payrollPeriodStatusLabels: Record<string, string> = {
  OPEN: 'Period open',
  LOCKED: 'Period locked',
  CLOSED: 'Period closed',
};

export const reviewCycleStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  GOAL_SETTING: 'Setting goals',
  IN_PROGRESS: 'In progress',
  CALIBRATION: 'Calibrating scores',
  CLOSED: 'Cycle closed',
  CANCELLED: 'Cancelled',
};

export const expenseClaimStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  SCHEDULED: 'Scheduled for payment',
  PAID: 'Paid',
};

export const resignationStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn by employee',
  COMPLETED: 'Offboarding complete',
};

export const offboardingTaskStatusLabels: Record<string, string> = {
  PENDING: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  NOT_APPLICABLE: 'Not needed',
};

export const documentRequestStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ISSUED: 'Issued',
  CANCELLED: 'Cancelled',
};

export const knowledgeStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  INDEXING: 'Preparing for the assistant',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
  FAILED: 'Failed',
};

export const auditActionLabels: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Changed',
  DELETE: 'Deleted',
  READ: 'Viewed',
  LOGIN: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in',
  LOGOUT: 'Signed out',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  EXPORT: 'Exported',
  PERMISSION_CHANGE: 'Permissions changed',
  AI_TOOL_CALL: 'Assistant looked up data',
};

/**
 * What an audit entry was about, in words HR uses. The keys are the entity
 * names the API writes, which are also the values its `entityType` filter takes.
 */
export const auditEntityLabels: Record<string, string> = {
  Employee: 'Employee record',
  EmployeeCompensation: 'Salary',
  EmployeeTaxProfile: 'Tax details',
  EmployeeRecurringItem: 'Recurring pay item',
  EmployeeDevice: 'Phone for clocking in',
  User: 'User account',
  Organization: 'Company settings',
  Department: 'Department',
  Position: 'Position',
  LeaveRequest: 'Leave request',
  LeaveType: 'Leave type',
  LeaveEntitlement: 'Leave entitlement',
  Holiday: 'Public holiday',
  AttendancePunch: 'Clock-in or clock-out',
  AttendanceCorrection: 'Attendance correction',
  OvertimeRequest: 'Overtime request',
  Shift: 'Shift',
  ShiftAssignment: 'Shift assignment',
  WorkSchedule: 'Work schedule',
  ScheduleAssignment: 'Schedule assignment',
  WorkLocation: 'Work location',
  PayrollPeriod: 'Pay period',
  PayrollRun: 'Payroll run',
  BenefitPlan: 'Benefit plan',
  BenefitEnrollment: 'Benefit enrolment',
  ExpenseClaim: 'Expense claim',
  DocumentRequest: 'Document request',
  FileObject: 'Uploaded file',
  ResignationRequest: 'Resignation',
  ReviewCycle: 'Review cycle',
  PerformanceReview: 'Performance review',
  KpiGoal: 'KPI goal',
  KpiCheckIn: 'KPI check-in',
  JobRequisition: 'Job requisition',
  JobPosting: 'Job posting',
  Application: 'Job application',
  Interview: 'Interview',
  InterviewScorecard: 'Interview scorecard',
  AssessmentTemplate: 'Assessment template',
  AssessmentInvitation: 'Assessment invitation',
  JobOffer: 'Job offer',
  ApprovalTask: 'Approval',
  ApprovalPolicy: 'Approval rule',
  KnowledgeDocument: 'HR knowledge document',
  AssistantTool: 'Assistant lookup',
};

/** Role codes the API returns on the signed-in user. */
export const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'System administrator',
  HR_ADMIN: 'HR manager',
  HR_OFFICER: 'HR officer',
  PAYROLL_OFFICER: 'Payroll officer',
  RECRUITER: 'Recruiter',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  AUDITOR: 'Auditor',
};

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'PRESENT':
    case 'PAID':
    case 'HIRED':
    case 'ISSUED':
    case 'PUBLISHED':
    case 'COMPLETED':
    case 'DONE':
      return 'success';
    case 'PENDING':
    case 'PENDING_APPROVAL':
    case 'PROBATION':
    case 'LATE':
    case 'CALCULATING':
    case 'INCOMPLETE':
    case 'SCREENING':
    case 'ASSESSMENT':
    case 'LOCKED':
    case 'CALIBRATION':
    case 'INDEXING':
      return 'warning';
    case 'REJECTED':
    case 'ABSENT':
    case 'FAILED':
    case 'TERMINATED':
    case 'SUSPENDED':
      return 'danger';
    case 'CALCULATED':
    case 'INTERVIEW':
    case 'OFFER':
    case 'ON_LEAVE':
    case 'OPEN':
    case 'SCHEDULED':
    case 'GOAL_SETTING':
    case 'IN_PROGRESS':
      return 'info';
    case 'DRAFT':
    case 'CANCELLED':
    case 'WITHDRAWN':
    case 'HOLIDAY':
    case 'DAY_OFF':
    case 'NOT_STARTED':
    case 'CLOSED':
    case 'ARCHIVED':
    case 'NOT_APPLICABLE':
      return 'neutral';
    default:
      return 'brand';
  }
}
