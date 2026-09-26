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
      return 'success';
    case 'PENDING':
    case 'PENDING_APPROVAL':
    case 'PROBATION':
    case 'LATE':
    case 'CALCULATING':
    case 'INCOMPLETE':
    case 'SCREENING':
    case 'ASSESSMENT':
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
      return 'info';
    case 'DRAFT':
    case 'CANCELLED':
    case 'WITHDRAWN':
    case 'HOLIDAY':
    case 'DAY_OFF':
    case 'NOT_STARTED':
      return 'neutral';
    default:
      return 'brand';
  }
}
