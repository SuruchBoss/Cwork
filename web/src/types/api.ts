/**
 * Shapes returned by the Cwork API.
 *
 * Hand-written rather than generated so the console depends on the documented
 * contract, not on Prisma's internals. Regenerate from /api/docs (OpenAPI) if
 * you prefer codegen — the names match the DTOs.
 */

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  path: string;
  requestId?: string;
  timestamp: string;
}

export interface SessionUser {
  id: string;
  email: string;
  organizationId: string;
  employeeId: string | null;
  displayName: string | null;
  roles: string[];
  permissions: string[];
  locale: string;
  photoUrl: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface LoginSession extends AuthTokens {
  mfaRequired: false;
  user: SessionUser;
}

/**
 * Returned when the password was right but the account still owes a second
 * factor — either because it has one enrolled, or because it holds privileges
 * that demand one and has not enrolled yet.
 */
export interface MfaChallenge {
  mfaRequired: true;
  mfaEnrolled: boolean;
  challengeToken: string;
  expiresIn: number;
}

/** Branch on `mfaRequired`; the two halves share no fields worth guessing at. */
export type LoginResponse = LoginSession | MfaChallenge;

export interface MfaEnrolment {
  secret: string;
  otpauthUri: string;
}

export interface MfaStatus {
  required: boolean;
  enrolled: boolean;
  enrolledAt: string | null;
  recoveryCodesRemaining: number;
}

export type EmployeeStatus =
  | 'PRE_BOARDING'
  | 'PROBATION'
  | 'ACTIVE'
  | 'ON_LEAVE'
  | 'SUSPENDED'
  | 'RESIGNED'
  | 'TERMINATED'
  | 'RETIRED';

export interface EmployeeSummary {
  id: string;
  employeeCode: string;
  firstNameTh: string;
  lastNameTh: string;
  firstNameEn: string | null;
  lastNameEn: string | null;
  nickname: string | null;
  workEmail: string | null;
  phone: string | null;
  photoFileId: string | null;
  status: EmployeeStatus;
  employmentType: string;
  hireDate: string;
  department: { id: string; name: string; code: string } | null;
  position: { id: string; title: string; level: number } | null;
  workLocation: { id: string; name: string } | null;
  manager: { id: string; firstNameTh: string; lastNameTh: string } | null;
}

export interface EmployeeDetail extends EmployeeSummary {
  dateOfBirth: string | null;
  gender: string;
  maritalStatus: string;
  personalEmail: string | null;
  addressLine: string | null;
  province: string | null;
  postalCode: string | null;
  probationEndDate: string | null;
  lastWorkingDate: string | null;
  nationalId?: string | null;
  nationalIdMasked?: string | null;
  directReports: Array<{ id: string; firstNameTh: string; lastNameTh: string; employeeCode: string }>;
  contacts: Array<{ id: string; name: string; relation: string; phone: string; isPrimary: boolean }>;
  user: { id: string; email: string; status: string; lastLoginAt: string | null } | null;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  unit: 'DAY' | 'HOUR';
  isPaid: boolean;
  allowHalfDay: boolean;
  requiresAttachment: boolean;
  minNoticeDays: number;
  colorHex: string;
  isActive: boolean;
}

export interface LeaveBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  colorHex: string;
  unit: 'DAY' | 'HOUR';
  year: number;
  granted: number;
  carriedOver: number;
  adjusted: number;
  used: number;
  pending: number;
  available: number;
  isPaid: boolean;
}

export type LeaveRequestStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CANCELLED_AFTER_APPROVAL';

export interface LeaveRequest {
  id: string;
  requestNo: string;
  startDate: string;
  endDate: string;
  startPortion: string;
  endPortion: string;
  totalDays: string;
  reason: string | null;
  status: LeaveRequestStatus;
  submittedAt: string | null;
  createdViaAssistant: boolean;
  leaveType: { id: string; code: string; name: string; colorHex: string; isPaid: boolean };
  employee: {
    id: string;
    employeeCode: string;
    firstNameTh: string;
    lastNameTh: string;
    photoFileId?: string | null;
    department: { id: string; name: string } | null;
  };
}

export interface LeavePreview {
  leaveType: { id: string; code: string; name: string; isPaid: boolean };
  employee: { id: string; name: string };
  days: Array<{ date: string; portion: string; dayValue: number }>;
  totalDays: number;
  totalHours: number | null;
  balanceBefore: number;
  balanceAfter: number;
  warnings: string[];
}

export type AttendanceStatus =
  | 'NOT_STARTED'
  | 'PRESENT'
  | 'LATE'
  | 'EARLY_LEAVE'
  | 'ABSENT'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'DAY_OFF'
  | 'INCOMPLETE';

export interface AttendanceRecord {
  id: string;
  workDate: string;
  firstClockInAt: string | null;
  lastClockOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  approvedOvertimeMinutes: number;
  status: AttendanceStatus;
  isOutsideGeofence: boolean;
  anomalyFlags: string[];
  lockedAt: string | null;
  employee: {
    id: string;
    employeeCode: string;
    firstNameTh: string;
    lastNameTh: string;
    department: { id: string; name: string } | null;
  };
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
}

export interface ApprovalTask {
  id: string;
  stepIndex: number;
  status: string;
  dueAt: string | null;
  createdAt: string;
  instance: {
    id: string;
    entityType: string;
    entityId: string;
    snapshot: Record<string, unknown>;
    submittedAt: string;
    submittedBy: {
      id: string;
      email: string;
      employee: { firstNameTh: string; lastNameTh: string; employeeCode: string } | null;
    };
  };
}

export interface PayrollPeriod {
  id: string;
  code: string;
  year: number;
  month: number;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: 'OPEN' | 'LOCKED' | 'CLOSED';
  _count?: { runs: number };
}

export type PayrollRunStatus =
  | 'DRAFT'
  | 'CALCULATING'
  | 'CALCULATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

export interface PayrollRun {
  id: string;
  runNo: string;
  type: string;
  status: PayrollRunStatus;
  employeeCount: number;
  totalGross: string;
  totalDeduction: string;
  totalNet: string;
  totalEmployerCost: string;
  currency: string;
  calculatedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  failureReason: string | null;
  period?: { code: string; year: number; month: number; payDate: string };
}

export interface PayslipSummary {
  id: string;
  currency: string;
  grossEarnings: string;
  totalDeductions: string;
  netPay: string;
  publishedAt: string | null;
  employee?: {
    id: string;
    employeeCode: string;
    firstNameTh: string;
    lastNameTh: string;
    department: { name: string } | null;
  };
  run?: { runNo: string; period: { code: string; year: number; month: number; payDate: string } };
}

export interface PayslipItem {
  id: string;
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION' | 'INFORMATIONAL';
  quantity: string | null;
  rate: string | null;
  amount: string;
  meta: Record<string, unknown>;
}

export interface PayslipDetail extends PayslipSummary {
  baseSalary: string;
  taxableIncome: string;
  withholdingTax: string;
  ssoEmployee: string;
  ssoEmployer: string;
  pvdEmployee: string;
  pvdEmployer: string;
  workedDays: string;
  unpaidLeaveDays: string;
  overtimeHours: string;
  items: PayslipItem[];
}

export type ApplicationStage =
  | 'APPLIED'
  | 'SCREENING'
  | 'ASSESSMENT'
  | 'INTERVIEW'
  | 'OFFER'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface Application {
  id: string;
  stage: ApplicationStage;
  rating: number | null;
  appliedAt: string;
  stageChangedAt: string;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    currentTitle: string | null;
    expectedSalary: string | null;
    resumeFileId: string | null;
  };
  posting: { id: string; title: string; slug: string };
  _count: { interviews: number; assessments: number };
}

export interface DocumentRequest {
  id: string;
  referenceNo: string;
  type: string;
  language: string;
  purpose: string | null;
  includeSalary: boolean;
  status: string;
  requestedAt: string;
  issuedAt: string | null;
  createdViaAssistant: boolean;
  employee: {
    id: string;
    employeeCode: string;
    firstNameTh: string;
    lastNameTh: string;
    department?: { name: string } | null;
  };
}

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  category: string | null;
  status: 'DRAFT' | 'INDEXING' | 'PUBLISHED' | 'ARCHIVED' | 'FAILED';
  version: number;
  tags: string[];
  visibleToRoles: string[];
  indexedAt: string | null;
  updatedAt: string;
  _count: { chunks: number };
}

export interface AssistantConversation {
  id: string;
  title: string | null;
  channel: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface AssistantMessage {
  id: string;
  role: 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  citations: Array<{ documentId: string; title: string; chunkIndex: number }>;
  toolName: string | null;
  feedback: 'UP' | 'DOWN' | null;
  createdAt: string;
}

export interface ChatResult {
  conversationId: string;
  messageId: string;
  reply: string;
  citations: Array<{ documentId: string; title: string; chunkIndex: number }>;
  toolsUsed: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; email: string } | null;
}
