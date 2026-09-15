-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "AssistantChannel" AS ENUM ('WEB', 'MOBILE', 'API');

-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AssistantFeedback" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('UPLOAD', 'MANUAL', 'URL', 'POLICY');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'INDEXING', 'PUBLISHED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('FIXED', 'SHIFT', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "PunchType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "PunchMethod" AS ENUM ('MOBILE_GPS', 'MOBILE_QR', 'KIOSK', 'WEB', 'BIOMETRIC', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('NOT_STARTED', 'PRESENT', 'LATE', 'EARLY_LEAVE', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'DAY_OFF', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OvertimeType" AS ENUM ('NORMAL_DAY', 'DAY_OFF', 'HOLIDAY', 'HOLIDAY_OVERTIME');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'OUTSOURCE', 'DAILY');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('PRE_BOARDING', 'PROBATION', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "ContactRelation" AS ENUM ('SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'FRIEND', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeDocumentType" AS ENUM ('ID_CARD', 'HOUSE_REGISTRATION', 'PASSPORT', 'WORK_PERMIT', 'CONTRACT', 'CERTIFICATE', 'TRANSCRIPT', 'RESUME', 'BANK_BOOK', 'MEDICAL', 'DISCIPLINARY', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentEventType" AS ENUM ('HIRE', 'PROBATION_PASSED', 'PROBATION_EXTENDED', 'PROMOTION', 'TRANSFER', 'SALARY_CHANGE', 'MANAGER_CHANGE', 'CONTRACT_RENEWAL', 'SUSPENSION', 'RESIGNATION', 'TERMINATION', 'RETIREMENT', 'REHIRE');

-- CreateEnum
CREATE TYPE "ResignationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SeparationType" AS ENUM ('RESIGNATION', 'TERMINATION', 'END_OF_CONTRACT', 'RETIREMENT', 'LAYOFF');

-- CreateEnum
CREATE TYPE "OffboardingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'READ', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'APPROVE', 'REJECT', 'EXPORT', 'PERMISSION_CHANGE', 'AI_TOOL_CALL');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION', 'PUBLIC');

-- CreateEnum
CREATE TYPE "FileScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "LeaveUnit" AS ENUM ('DAY', 'HOUR');

-- CreateEnum
CREATE TYPE "LeaveAccrualMethod" AS ENUM ('NONE', 'ANNUAL_GRANT', 'MONTHLY_ACCRUAL', 'SENIORITY_TIERED');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'CANCELLED_AFTER_APPROVAL');

-- CreateEnum
CREATE TYPE "DayPortion" AS ENUM ('FULL', 'MORNING', 'AFTERNOON', 'HOURS');

-- CreateEnum
CREATE TYPE "PayComponentType" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "PayCalcType" AS ENUM ('FIXED', 'PERCENT_OF_BASE', 'RATE_TIMES_QUANTITY', 'FORMULA', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('MONTHLY', 'SEMI_MONTHLY', 'BIWEEKLY', 'WEEKLY', 'DAILY', 'HOURLY');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATING', 'CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollRunType" AS ENUM ('REGULAR', 'OFF_CYCLE', 'BONUS', 'FINAL_SETTLEMENT');

-- CreateEnum
CREATE TYPE "BenefitCategory" AS ENUM ('HEALTH_INSURANCE', 'LIFE_INSURANCE', 'DENTAL', 'PROVIDENT_FUND', 'ALLOWANCE', 'EQUIPMENT', 'WELLNESS', 'TRAINING', 'TRANSPORT', 'MEAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BenefitEnrollmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('TRAVEL', 'ACCOMMODATION', 'MEAL', 'TRANSPORT', 'MEDICAL', 'TRAINING', 'EQUIPMENT', 'ENTERTAINMENT', 'TELECOM', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'SCHEDULED', 'PAID');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('PAYROLL', 'BANK_TRANSFER', 'PETTY_CASH');

-- CreateEnum
CREATE TYPE "ReviewCycleType" AS ENUM ('ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'MONTHLY', 'PROBATION', 'PROJECT');

-- CreateEnum
CREATE TYPE "ReviewCycleStatus" AS ENUM ('DRAFT', 'GOAL_SETTING', 'IN_PROGRESS', 'CALIBRATION', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KpiCategory" AS ENUM ('FINANCIAL', 'CUSTOMER', 'PROCESS', 'LEARNING_GROWTH', 'BEHAVIOR', 'PROJECT');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'EXACT_TARGET');

-- CreateEnum
CREATE TYPE "KpiGoalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'ACHIEVED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('SELF', 'MANAGER', 'PEER', 'SKIP_LEVEL', 'SUBORDINATE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'ACKNOWLEDGED', 'CALIBRATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ON_HOLD', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PostingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('APPLIED', 'SCREENING', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('MULTIPLE_CHOICE', 'ESSAY', 'CODING', 'PERSONALITY', 'SKILL', 'MIXED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'CODE', 'RATING');

-- CreateEnum
CREATE TYPE "AssessmentInvitationStatus" AS ENUM ('SENT', 'OPENED', 'IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('ONSITE', 'VIDEO', 'PHONE');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "HiringRecommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'NEUTRAL', 'NO_HIRE', 'STRONG_NO_HIRE');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApprovalEntityType" AS ENUM ('LEAVE_REQUEST', 'OVERTIME_REQUEST', 'EXPENSE_CLAIM', 'ATTENDANCE_CORRECTION', 'RESIGNATION', 'JOB_REQUISITION', 'JOB_OFFER', 'PAYROLL_RUN', 'DOCUMENT_REQUEST');

-- CreateEnum
CREATE TYPE "ApproverType" AS ENUM ('LINE_MANAGER', 'DEPARTMENT_HEAD', 'ROLE', 'SPECIFIC_USER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalTaskStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'DELEGATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DocumentRequestType" AS ENUM ('EMPLOYMENT_CERTIFICATE', 'SALARY_CERTIFICATE', 'PAYSLIP_COPY', 'TAX_WITHHOLDING_50BIS', 'VISA_SUPPORT_LETTER', 'BANK_LOAN_LETTER', 'SOCIAL_SECURITY_LETTER', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ISSUED', 'CANCELLED');

-- CreateTable
CREATE TABLE "assistant_conversations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "channel" "AssistantChannel" NOT NULL DEFAULT 'WEB',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolInput" JSONB,
    "toolResult" JSONB,
    "toolCallId" TEXT,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "feedback" "AssistantFeedback",
    "feedbackNote" TEXT,
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "sourceType" "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "fileId" UUID,
    "content" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'th',
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "visibleToRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checksum" TEXT,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "indexedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_usage_counters" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "usageDate" DATE NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "graceInMinutes" INTEGER NOT NULL DEFAULT 5,
    "graceOutMinutes" INTEGER NOT NULL DEFAULT 5,
    "standardWorkMinutes" INTEGER NOT NULL DEFAULT 480,
    "isFlexible" BOOLEAN NOT NULL DEFAULT false,
    "coreStartTime" TEXT,
    "coreEndTime" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ScheduleType" NOT NULL DEFAULT 'FIXED',
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "defaultShiftId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_assignments" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "isDayOff" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "PunchType" NOT NULL,
    "method" "PunchMethod" NOT NULL,
    "punchedAt" TIMESTAMP(3) NOT NULL,
    "clientTime" TIMESTAMP(3),
    "workDate" DATE NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "accuracyM" INTEGER,
    "workLocationId" UUID,
    "distanceM" INTEGER,
    "isOutsideGeofence" BOOLEAN NOT NULL DEFAULT false,
    "selfieFileId" UUID,
    "deviceId" TEXT,
    "deviceModel" TEXT,
    "appVersion" TEXT,
    "ipAddress" TEXT,
    "anomalyFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "clientPunchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "shiftId" UUID,
    "workLocationId" UUID,
    "firstClockInAt" TIMESTAMP(3),
    "lastClockOutAt" TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "approvedOvertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "isOutsideGeofence" BOOLEAN NOT NULL DEFAULT false,
    "anomalyFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "leaveRequestId" UUID,
    "note" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "requestedClockIn" TIMESTAMP(3),
    "requestedClockOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "decisionNote" TEXT,
    "approvalInstanceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requestNo" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "requestedHours" DECIMAL(6,2) NOT NULL,
    "approvedHours" DECIMAL(6,2),
    "type" "OvertimeType" NOT NULL DEFAULT 'NORMAL_DAY',
    "rateMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.5,
    "reason" TEXT NOT NULL,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "payrollRunId" UUID,
    "approvalInstanceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "userId" UUID,
    "titleTh" TEXT,
    "firstNameTh" TEXT NOT NULL,
    "lastNameTh" TEXT NOT NULL,
    "firstNameEn" TEXT,
    "lastNameEn" TEXT,
    "nickname" TEXT,
    "photoFileId" UUID,
    "dateOfBirth" DATE,
    "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "maritalStatus" "MaritalStatus" NOT NULL DEFAULT 'UNDISCLOSED',
    "nationality" TEXT,
    "nationalIdEnc" TEXT,
    "nationalIdLast4" TEXT,
    "passportNoEnc" TEXT,
    "taxIdEnc" TEXT,
    "socialSecurityNoEnc" TEXT,
    "personalEmail" TEXT,
    "workEmail" TEXT,
    "phone" TEXT,
    "addressLine" TEXT,
    "subDistrict" TEXT,
    "district" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'TH',
    "departmentId" UUID,
    "positionId" UUID,
    "workLocationId" UUID,
    "managerId" UUID,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'PRE_BOARDING',
    "hireDate" DATE NOT NULL,
    "probationEndDate" DATE,
    "confirmedDate" DATE,
    "contractEndDate" DATE,
    "resignationDate" DATE,
    "lastWorkingDate" DATE,
    "separationReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_contacts" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relation" "ContactRelation" NOT NULL DEFAULT 'OTHER',
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "address" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_dependents" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relation" "ContactRelation" NOT NULL,
    "dateOfBirth" DATE,
    "nationalIdEnc" TEXT,
    "isTaxAllowance" BOOLEAN NOT NULL DEFAULT false,
    "isStudying" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_dependents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_educations" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "fieldOfStudy" TEXT,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "gpa" DECIMAL(4,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_experiences" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "EmployeeDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "fileId" UUID NOT NULL,
    "issuedAt" DATE,
    "expiresAt" DATE,
    "note" TEXT,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bank_accounts" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNoEnc" TEXT NOT NULL,
    "accountNoLast4" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "branch" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_events" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "EmploymentEventType" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "note" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resignation_requests" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "separationType" "SeparationType" NOT NULL DEFAULT 'RESIGNATION',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedLastWorkingDate" DATE NOT NULL,
    "agreedLastWorkingDate" DATE,
    "noticeDays" INTEGER,
    "reasonCategory" TEXT,
    "reason" TEXT,
    "status" "ResignationStatus" NOT NULL DEFAULT 'DRAFT',
    "decidedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "decisionNote" TEXT,
    "approvalInstanceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resignation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offboarding_tasks" (
    "id" UUID NOT NULL,
    "resignationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "assigneeEmployeeId" UUID,
    "dueDate" DATE,
    "status" "OffboardingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_interviews" (
    "id" UUID NOT NULL,
    "resignationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "conductedById" UUID,
    "conductedAt" TIMESTAMP(3),
    "responses" JSONB NOT NULL DEFAULT '{}',
    "overallSatisfaction" INTEGER,
    "wouldRecommend" BOOLEAN,
    "wouldRehire" BOOLEAN,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exit_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "phone" TEXT,
    "passwordHash" TEXT,
    "passwordChangedAt" TIMESTAMP(3),
    "sessionsValidFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'th',
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "departmentId" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" UUID,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "rotatedToId" UUID,
    "deviceId" TEXT,
    "deviceName" TEXT,
    "platform" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "unit" "LeaveUnit" NOT NULL DEFAULT 'DAY',
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "defaultQuota" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "accrualMethod" "LeaveAccrualMethod" NOT NULL DEFAULT 'ANNUAL_GRANT',
    "seniorityTiers" JSONB NOT NULL DEFAULT '[]',
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "allowHourly" BOOLEAN NOT NULL DEFAULT false,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "attachmentRequiredAfterDays" INTEGER,
    "minNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "maxConsecutiveDays" INTEGER,
    "maxPerYear" DECIMAL(8,2),
    "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
    "carryOverMaxDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "carryOverExpiryMonths" INTEGER,
    "genderRestriction" "Gender",
    "minServiceDays" INTEGER NOT NULL DEFAULT 0,
    "colorHex" TEXT NOT NULL DEFAULT '#2563eb',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_entitlements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "openingBalance" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "granted" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "carriedOver" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "carryOverExpiresOn" DATE,
    "adjusted" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "used" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pending" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "expired" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_adjustments" (
    "id" UUID NOT NULL,
    "entitlementId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "amount" DECIMAL(8,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requestNo" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startPortion" "DayPortion" NOT NULL DEFAULT 'FULL',
    "endPortion" "DayPortion" NOT NULL DEFAULT 'FULL',
    "totalDays" DECIMAL(8,2) NOT NULL,
    "totalHours" DECIMAL(8,2),
    "reason" TEXT,
    "contactPhone" TEXT,
    "backupEmployeeId" UUID,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdViaAssistant" BOOLEAN NOT NULL DEFAULT false,
    "approvalInstanceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request_days" (
    "id" UUID NOT NULL,
    "leaveRequestId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "portion" "DayPortion" NOT NULL DEFAULT 'FULL',
    "hours" DECIMAL(6,2),
    "dayValue" DECIMAL(4,2) NOT NULL DEFAULT 1,

    CONSTRAINT "leave_request_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'TH',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "defaultLocale" TEXT NOT NULL DEFAULT 'th',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "logoUrl" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "costCenter" TEXT,
    "parentId" UUID,
    "headEmployeeId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "jobFamily" TEXT,
    "departmentId" UUID,
    "description" TEXT,
    "minSalary" DECIMAL(18,4),
    "maxSalary" DECIMAL(18,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_locations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine" TEXT,
    "district" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geofenceRadiusM" INTEGER NOT NULL DEFAULT 200,
    "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timezone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "workLocationId" UUID,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_components" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "type" "PayComponentType" NOT NULL,
    "calcType" "PayCalcType" NOT NULL DEFAULT 'FIXED',
    "defaultAmount" DECIMAL(18,4),
    "defaultRate" DECIMAL(9,4),
    "formula" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "includeInSsoBase" BOOLEAN NOT NULL DEFAULT true,
    "includeInPvdBase" BOOLEAN NOT NULL DEFAULT false,
    "isProratable" BOOLEAN NOT NULL DEFAULT true,
    "glAccountCode" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_compensations" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "baseSalary" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "payFrequency" "PayFrequency" NOT NULL DEFAULT 'MONTHLY',
    "hourlyRate" DECIMAL(18,4),
    "dailyRate" DECIMAL(18,4),
    "isOvertimeEligible" BOOLEAN NOT NULL DEFAULT true,
    "isSsoEligible" BOOLEAN NOT NULL DEFAULT true,
    "pvdEmployeeRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pvdEmployerRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "approvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_recurring_items" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "componentId" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_recurring_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "cutoffDate" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "runNo" TEXT NOT NULL,
    "type" "PayrollRunType" NOT NULL DEFAULT 'REGULAR',
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalEmployerCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "calculatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "baseSalary" DECIMAL(18,4) NOT NULL,
    "grossEarnings" DECIMAL(18,4) NOT NULL,
    "totalDeductions" DECIMAL(18,4) NOT NULL,
    "netPay" DECIMAL(18,4) NOT NULL,
    "taxableIncome" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "withholdingTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "ssoEmployee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "ssoEmployer" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "pvdEmployee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "pvdEmployer" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "workedDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "unpaidLeaveDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "pdfFileId" UUID,
    "publishedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_items" (
    "id" UUID NOT NULL,
    "payslipId" UUID NOT NULL,
    "componentId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PayComponentType" NOT NULL,
    "quantity" DECIMAL(12,4),
    "rate" DECIMAL(18,4),
    "amount" DECIMAL(18,4) NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "payslip_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tax_profiles" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "filingStatus" TEXT NOT NULL DEFAULT 'SINGLE',
    "spouseAllowance" BOOLEAN NOT NULL DEFAULT false,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "childrenBorn2018OrLater" INTEGER NOT NULL DEFAULT 0,
    "parentCareCount" INTEGER NOT NULL DEFAULT 0,
    "disabledCareCount" INTEGER NOT NULL DEFAULT 0,
    "lifeInsurancePremium" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "healthInsurancePremium" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "parentHealthInsurancePremium" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "providentFundContribution" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rmfContribution" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "ssfContribution" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "mortgageInterest" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "donation" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "educationDonation" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "otherDeductions" JSONB NOT NULL DEFAULT '[]',
    "priorEmployerIncome" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "priorEmployerTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_plans" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "category" "BenefitCategory" NOT NULL,
    "provider" TEXT,
    "description" TEXT,
    "coverageAmount" DECIMAL(18,4),
    "employeeCostPerPeriod" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "employerCostPerPeriod" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "eligibilityRule" JSONB NOT NULL DEFAULT '{}',
    "allowsDependents" BOOLEAN NOT NULL DEFAULT false,
    "annualLimit" DECIMAL(18,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benefit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_enrollments" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "BenefitEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "dependentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benefit_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_claims" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "claimNo" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "approvedAmount" DECIMAL(18,4),
    "benefitPlanId" UUID,
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'PAYROLL',
    "paidAt" TIMESTAMP(3),
    "payrollRunId" UUID,
    "approvalInstanceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_claim_items" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "expenseDate" DATE NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "taxInvoiceNo" TEXT,
    "receiptFileId" UUID,
    "approvedAmount" DECIMAL(18,4),
    "note" TEXT,

    CONSTRAINT "expense_claim_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_cycles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReviewCycleType" NOT NULL DEFAULT 'ANNUAL',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "goalSettingDue" DATE,
    "selfReviewDue" DATE,
    "managerReviewDue" DATE,
    "calibrationDue" DATE,
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "kpiWeight" INTEGER NOT NULL DEFAULT 70,
    "competencyWeight" INTEGER NOT NULL DEFAULT 30,
    "ratingScale" JSONB NOT NULL DEFAULT '[]',
    "includeSelfReview" BOOLEAN NOT NULL DEFAULT true,
    "includePeerReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" UUID,
    "positionId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_template_items" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "KpiCategory" NOT NULL DEFAULT 'PROCESS',
    "unit" TEXT,
    "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
    "defaultWeight" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "defaultTarget" DECIMAL(18,4),
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "kpi_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_goals" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "KpiCategory" NOT NULL DEFAULT 'PROCESS',
    "weight" DECIMAL(5,2) NOT NULL,
    "unit" TEXT,
    "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
    "baselineValue" DECIMAL(18,4),
    "targetValue" DECIMAL(18,4) NOT NULL,
    "stretchValue" DECIMAL(18,4),
    "actualValue" DECIMAL(18,4),
    "achievement" DECIMAL(6,2),
    "weightedScore" DECIMAL(6,2),
    "status" "KpiGoalStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" DATE,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_check_ins" (
    "id" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "note" TEXT,
    "evidenceFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" UUID,

    CONSTRAINT "kpi_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "reviewerEmployeeId" UUID NOT NULL,
    "type" "ReviewType" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "kpiScore" DECIMAL(6,2),
    "competencyScore" DECIMAL(6,2),
    "overallScore" DECIMAL(6,2),
    "grade" TEXT,
    "calibratedGrade" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "developmentPlan" TEXT,
    "managerComment" TEXT,
    "employeeComment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_competency_scores" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "competency" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "score" DECIMAL(5,2) NOT NULL,
    "comment" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "review_competency_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_requisitions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" UUID,
    "positionId" UUID,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "filledCount" INTEGER NOT NULL DEFAULT 0,
    "isReplacement" BOOLEAN NOT NULL DEFAULT false,
    "replacingEmployeeId" UUID,
    "salaryMin" DECIMAL(18,4),
    "salaryMax" DECIMAL(18,4),
    "targetStartDate" DATE,
    "justification" TEXT,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedByEmployeeId" UUID,
    "approvalInstanceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_postings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requisitionId" UUID,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "benefits" TEXT,
    "locationText" TEXT,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "showSalary" BOOLEAN NOT NULL DEFAULT false,
    "salaryMin" DECIMAL(18,4),
    "salaryMax" DECIMAL(18,4),
    "isInternalOnly" BOOLEAN NOT NULL DEFAULT false,
    "status" "PostingStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "formSchema" JSONB NOT NULL DEFAULT '[]',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "currentTitle" TEXT,
    "currentCompany" TEXT,
    "expectedSalary" DECIMAL(18,4),
    "noticePeriodDays" INTEGER,
    "resumeFileId" UUID,
    "portfolioUrl" TEXT,
    "linkedinUrl" TEXT,
    "source" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consentAt" TIMESTAMP(3),
    "consentExpiresAt" TIMESTAMP(3),
    "erasureRequestedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "postingId" UUID NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "rating" INTEGER,
    "coverLetter" TEXT,
    "formAnswers" JSONB NOT NULL DEFAULT '{}',
    "ownerUserId" UUID,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectReason" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "hiredEmployeeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_activities" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "fromStage" "ApplicationStage",
    "toStage" "ApplicationStage",
    "note" TEXT,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "AssessmentKind" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "passingScore" DECIMAL(5,2) NOT NULL DEFAULT 60,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true,
    "autoGrade" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "points" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "explanation" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_invitations" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "AssessmentInvitationStatus" NOT NULL DEFAULT 'SENT',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "score" DECIMAL(6,2),
    "maxScore" DECIMAL(6,2),
    "percentage" DECIMAL(5,2),
    "isPassed" BOOLEAN,
    "gradedById" UUID,
    "gradedAt" TIMESTAMP(3),
    "reviewerNote" TEXT,

    CONSTRAINT "assessment_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_answers" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "selectedKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "textAnswer" TEXT,
    "score" DECIMAL(6,2),
    "isCorrect" BOOLEAN,
    "gradedBy" TEXT,
    "feedback" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT,
    "mode" "InterviewMode" NOT NULL DEFAULT 'ONSITE',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "locationText" TEXT,
    "meetingUrl" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_participants" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "hasResponded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "interview_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_scorecards" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "reviewerEmployeeId" UUID NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "overallScore" DECIMAL(4,2),
    "recommendation" "HiringRecommendation",
    "strengths" TEXT,
    "concerns" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "baseSalary" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "allowances" JSONB NOT NULL DEFAULT '[]',
    "signOnBonus" DECIMAL(18,4),
    "probationMonths" INTEGER NOT NULL DEFAULT 4,
    "startDate" DATE NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "letterFileId" UUID,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "approvedById" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_policies" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entityType" "ApprovalEntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_policy_steps" (
    "id" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "approverType" "ApproverType" NOT NULL,
    "levelsUp" INTEGER NOT NULL DEFAULT 1,
    "roleId" UUID,
    "specificUserId" UUID,
    "anyOf" BOOLEAN NOT NULL DEFAULT true,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "slaHours" INTEGER,
    "skipIfSelf" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "approval_policy_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_instances" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entityType" "ApprovalEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "policyId" UUID,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "submittedById" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "snapshot" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "approval_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_tasks" (
    "id" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "approverUserId" UUID NOT NULL,
    "status" "ApprovalTaskStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,
    "delegatedToId" UUID,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "DocumentRequestType" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'th',
    "purpose" TEXT,
    "addressedTo" TEXT,
    "includeSalary" BOOLEAN NOT NULL DEFAULT false,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "needByDate" DATE,
    "status" "DocumentRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMP(3),
    "issuedById" UUID,
    "fileId" UUID,
    "rejectReason" TEXT,
    "createdViaAssistant" BOOLEAN NOT NULL DEFAULT false,
    "approvalInstanceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_conversations_userId_lastMessageAt_idx" ON "assistant_conversations"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "assistant_messages_conversationId_createdAt_idx" ON "assistant_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "knowledge_documents_organizationId_status_idx" ON "knowledge_documents"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_documentId_chunkIndex_key" ON "knowledge_chunks"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "assistant_usage_counters_organizationId_usageDate_idx" ON "assistant_usage_counters"("organizationId", "usageDate");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_usage_counters_userId_usageDate_key" ON "assistant_usage_counters"("userId", "usageDate");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_organizationId_code_key" ON "shifts"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_organizationId_code_key" ON "work_schedules"("organizationId", "code");

-- CreateIndex
CREATE INDEX "schedule_assignments_employeeId_effectiveFrom_idx" ON "schedule_assignments"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_employeeId_date_key" ON "shift_assignments"("employeeId", "date");

-- CreateIndex
CREATE INDEX "attendance_punches_organizationId_workDate_idx" ON "attendance_punches"("organizationId", "workDate");

-- CreateIndex
CREATE INDEX "attendance_punches_employeeId_workDate_punchedAt_idx" ON "attendance_punches"("employeeId", "workDate", "punchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_employeeId_clientPunchId_key" ON "attendance_punches"("employeeId", "clientPunchId");

-- CreateIndex
CREATE INDEX "attendance_records_organizationId_workDate_status_idx" ON "attendance_records"("organizationId", "workDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employeeId_workDate_key" ON "attendance_records"("employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_corrections_approvalInstanceId_key" ON "attendance_corrections"("approvalInstanceId");

-- CreateIndex
CREATE INDEX "attendance_corrections_employeeId_status_idx" ON "attendance_corrections"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_approvalInstanceId_key" ON "overtime_requests"("approvalInstanceId");

-- CreateIndex
CREATE INDEX "overtime_requests_employeeId_workDate_idx" ON "overtime_requests"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "overtime_requests_organizationId_status_idx" ON "overtime_requests"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_organizationId_requestNo_key" ON "overtime_requests"("organizationId", "requestNo");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_organizationId_status_idx" ON "employees"("organizationId", "status");

-- CreateIndex
CREATE INDEX "employees_organizationId_departmentId_idx" ON "employees"("organizationId", "departmentId");

-- CreateIndex
CREATE INDEX "employees_organizationId_managerId_idx" ON "employees"("organizationId", "managerId");

-- CreateIndex
CREATE INDEX "employees_organizationId_lastNameTh_firstNameTh_idx" ON "employees"("organizationId", "lastNameTh", "firstNameTh");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_employeeCode_key" ON "employees"("organizationId", "employeeCode");

-- CreateIndex
CREATE INDEX "employee_contacts_employeeId_idx" ON "employee_contacts"("employeeId");

-- CreateIndex
CREATE INDEX "employee_dependents_employeeId_idx" ON "employee_dependents"("employeeId");

-- CreateIndex
CREATE INDEX "employee_educations_employeeId_idx" ON "employee_educations"("employeeId");

-- CreateIndex
CREATE INDEX "employee_experiences_employeeId_idx" ON "employee_experiences"("employeeId");

-- CreateIndex
CREATE INDEX "employee_documents_employeeId_type_idx" ON "employee_documents"("employeeId", "type");

-- CreateIndex
CREATE INDEX "employee_bank_accounts_employeeId_idx" ON "employee_bank_accounts"("employeeId");

-- CreateIndex
CREATE INDEX "employment_events_employeeId_effectiveDate_idx" ON "employment_events"("employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "resignation_requests_approvalInstanceId_key" ON "resignation_requests"("approvalInstanceId");

-- CreateIndex
CREATE INDEX "resignation_requests_employeeId_status_idx" ON "resignation_requests"("employeeId", "status");

-- CreateIndex
CREATE INDEX "offboarding_tasks_resignationId_status_idx" ON "offboarding_tasks"("resignationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exit_interviews_resignationId_key" ON "exit_interviews"("resignationId");

-- CreateIndex
CREATE INDEX "users_organizationId_status_idx" ON "users"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_email_key" ON "users"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organizationId_key_key" ON "roles"("organizationId", "key");

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "user_roles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_departmentId_key" ON "user_roles"("userId", "roleId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_entityType_entityId_idx" ON "audit_logs"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "file_objects_organizationId_createdAt_idx" ON "file_objects"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_bucket_objectKey_key" ON "file_objects"("bucket", "objectKey");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_occurredAt_idx" ON "outbox_events"("processedAt", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organizationId_code_key" ON "leave_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "leave_entitlements_organizationId_year_idx" ON "leave_entitlements"("organizationId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_entitlements_employeeId_leaveTypeId_year_key" ON "leave_entitlements"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "leave_adjustments_entitlementId_idx" ON "leave_adjustments"("entitlementId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_approvalInstanceId_key" ON "leave_requests"("approvalInstanceId");

-- CreateIndex
CREATE INDEX "leave_requests_organizationId_status_idx" ON "leave_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_startDate_idx" ON "leave_requests"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "leave_requests_organizationId_startDate_endDate_idx" ON "leave_requests"("organizationId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_organizationId_requestNo_key" ON "leave_requests"("organizationId", "requestNo");

-- CreateIndex
CREATE INDEX "leave_request_days_date_idx" ON "leave_request_days"("date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_request_days_leaveRequestId_date_key" ON "leave_request_days"("leaveRequestId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_isActive_idx" ON "organizations"("isActive");

-- CreateIndex
CREATE INDEX "departments_organizationId_parentId_idx" ON "departments"("organizationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organizationId_code_key" ON "departments"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "positions_organizationId_code_key" ON "positions"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "work_locations_organizationId_code_key" ON "work_locations"("organizationId", "code");

-- CreateIndex
CREATE INDEX "holidays_organizationId_date_idx" ON "holidays"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_organizationId_date_workLocationId_key" ON "holidays"("organizationId", "date", "workLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "pay_components_organizationId_code_key" ON "pay_components"("organizationId", "code");

-- CreateIndex
CREATE INDEX "employee_compensations_employeeId_effectiveFrom_effectiveTo_idx" ON "employee_compensations"("employeeId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "employee_compensations_employeeId_effectiveFrom_key" ON "employee_compensations"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "employee_recurring_items_employeeId_effectiveFrom_idx" ON "employee_recurring_items"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "payroll_periods_organizationId_year_month_idx" ON "payroll_periods"("organizationId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_organizationId_code_key" ON "payroll_periods"("organizationId", "code");

-- CreateIndex
CREATE INDEX "payroll_runs_organizationId_status_idx" ON "payroll_runs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_organizationId_runNo_key" ON "payroll_runs"("organizationId", "runNo");

-- CreateIndex
CREATE INDEX "payslips_employeeId_createdAt_idx" ON "payslips"("employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_runId_employeeId_key" ON "payslips"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "payslip_items_payslipId_idx" ON "payslip_items"("payslipId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tax_profiles_employeeId_taxYear_key" ON "employee_tax_profiles"("employeeId", "taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_plans_organizationId_code_key" ON "benefit_plans"("organizationId", "code");

-- CreateIndex
CREATE INDEX "benefit_enrollments_employeeId_status_idx" ON "benefit_enrollments"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_enrollments_employeeId_planId_effectiveFrom_key" ON "benefit_enrollments"("employeeId", "planId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "expense_claims_approvalInstanceId_key" ON "expense_claims"("approvalInstanceId");

-- CreateIndex
CREATE INDEX "expense_claims_organizationId_status_idx" ON "expense_claims"("organizationId", "status");

-- CreateIndex
CREATE INDEX "expense_claims_employeeId_status_idx" ON "expense_claims"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "expense_claims_organizationId_claimNo_key" ON "expense_claims"("organizationId", "claimNo");

-- CreateIndex
CREATE INDEX "expense_claim_items_claimId_idx" ON "expense_claim_items"("claimId");

-- CreateIndex
CREATE INDEX "review_cycles_organizationId_status_idx" ON "review_cycles"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "review_cycles_organizationId_code_key" ON "review_cycles"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_templates_organizationId_code_key" ON "kpi_templates"("organizationId", "code");

-- CreateIndex
CREATE INDEX "kpi_template_items_templateId_idx" ON "kpi_template_items"("templateId");

-- CreateIndex
CREATE INDEX "kpi_goals_cycleId_employeeId_idx" ON "kpi_goals"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "kpi_goals_employeeId_status_idx" ON "kpi_goals"("employeeId", "status");

-- CreateIndex
CREATE INDEX "kpi_check_ins_goalId_recordedAt_idx" ON "kpi_check_ins"("goalId", "recordedAt");

-- CreateIndex
CREATE INDEX "performance_reviews_cycleId_status_idx" ON "performance_reviews"("cycleId", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_employeeId_idx" ON "performance_reviews"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_cycleId_employeeId_reviewerEmployeeId_t_key" ON "performance_reviews"("cycleId", "employeeId", "reviewerEmployeeId", "type");

-- CreateIndex
CREATE INDEX "review_competency_scores_reviewId_idx" ON "review_competency_scores"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "job_requisitions_approvalInstanceId_key" ON "job_requisitions"("approvalInstanceId");

-- CreateIndex
CREATE INDEX "job_requisitions_organizationId_status_idx" ON "job_requisitions"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_requisitions_organizationId_code_key" ON "job_requisitions"("organizationId", "code");

-- CreateIndex
CREATE INDEX "job_postings_organizationId_status_idx" ON "job_postings"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_organizationId_slug_key" ON "job_postings"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "candidates_organizationId_createdAt_idx" ON "candidates"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_organizationId_email_key" ON "candidates"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "applications_hiredEmployeeId_key" ON "applications"("hiredEmployeeId");

-- CreateIndex
CREATE INDEX "applications_postingId_stage_idx" ON "applications"("postingId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "applications_candidateId_postingId_key" ON "applications"("candidateId", "postingId");

-- CreateIndex
CREATE INDEX "application_activities_applicationId_createdAt_idx" ON "application_activities"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_templates_organizationId_code_key" ON "assessment_templates"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_templateId_orderIndex_key" ON "assessment_questions"("templateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_invitations_tokenHash_key" ON "assessment_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "assessment_invitations_applicationId_idx" ON "assessment_invitations"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answers_invitationId_questionId_key" ON "assessment_answers"("invitationId", "questionId");

-- CreateIndex
CREATE INDEX "interviews_applicationId_round_idx" ON "interviews"("applicationId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "interview_participants_interviewId_employeeId_key" ON "interview_participants"("interviewId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_scorecards_interviewId_reviewerEmployeeId_key" ON "interview_scorecards"("interviewId", "reviewerEmployeeId");

-- CreateIndex
CREATE INDEX "job_offers_applicationId_idx" ON "job_offers"("applicationId");

-- CreateIndex
CREATE INDEX "approval_policies_organizationId_entityType_isActive_idx" ON "approval_policies"("organizationId", "entityType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "approval_policy_steps_policyId_orderIndex_key" ON "approval_policy_steps"("policyId", "orderIndex");

-- CreateIndex
CREATE INDEX "approval_instances_organizationId_status_idx" ON "approval_instances"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_instances_entityType_entityId_key" ON "approval_instances"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "approval_tasks_approverUserId_status_idx" ON "approval_tasks"("approverUserId", "status");

-- CreateIndex
CREATE INDEX "approval_tasks_instanceId_stepIndex_idx" ON "approval_tasks"("instanceId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "document_requests_approvalInstanceId_key" ON "document_requests"("approvalInstanceId");

-- CreateIndex
CREATE INDEX "document_requests_organizationId_status_idx" ON "document_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "document_requests_employeeId_status_idx" ON "document_requests"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "document_requests_organizationId_referenceNo_key" ON "document_requests"("organizationId", "referenceNo");

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_defaultShiftId_fkey" FOREIGN KEY ("defaultShiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "work_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contacts" ADD CONSTRAINT "employee_contacts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_dependents" ADD CONSTRAINT "employee_dependents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_educations" ADD CONSTRAINT "employee_educations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_experiences" ADD CONSTRAINT "employee_experiences_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_events" ADD CONSTRAINT "employment_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resignation_requests" ADD CONSTRAINT "resignation_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resignation_requests" ADD CONSTRAINT "resignation_requests_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offboarding_tasks" ADD CONSTRAINT "offboarding_tasks_resignationId_fkey" FOREIGN KEY ("resignationId") REFERENCES "resignation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offboarding_tasks" ADD CONSTRAINT "offboarding_tasks_assigneeEmployeeId_fkey" FOREIGN KEY ("assigneeEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_interviews" ADD CONSTRAINT "exit_interviews_resignationId_fkey" FOREIGN KEY ("resignationId") REFERENCES "resignation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_interviews" ADD CONSTRAINT "exit_interviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "leave_entitlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_backupEmployeeId_fkey" FOREIGN KEY ("backupEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request_days" ADD CONSTRAINT "leave_request_days_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_headEmployeeId_fkey" FOREIGN KEY ("headEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "work_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_recurring_items" ADD CONSTRAINT "employee_recurring_items_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_recurring_items" ADD CONSTRAINT "employee_recurring_items_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "pay_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_items" ADD CONSTRAINT "payslip_items_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_items" ADD CONSTRAINT "payslip_items_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "pay_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tax_profiles" ADD CONSTRAINT "employee_tax_profiles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_plans" ADD CONSTRAINT "benefit_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "benefit_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claim_items" ADD CONSTRAINT "expense_claim_items_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "expense_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claim_items" ADD CONSTRAINT "expense_claim_items_receiptFileId_fkey" FOREIGN KEY ("receiptFileId") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_template_items" ADD CONSTRAINT "kpi_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "kpi_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_goals" ADD CONSTRAINT "kpi_goals_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_goals" ADD CONSTRAINT "kpi_goals_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_check_ins" ADD CONSTRAINT "kpi_check_ins_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "kpi_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewerEmployeeId_fkey" FOREIGN KEY ("reviewerEmployeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_competency_scores" ADD CONSTRAINT "review_competency_scores_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_requestedByEmployeeId_fkey" FOREIGN KEY ("requestedByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "job_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_hiredEmployeeId_fkey" FOREIGN KEY ("hiredEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_activities" ADD CONSTRAINT "application_activities_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_invitations" ADD CONSTRAINT "assessment_invitations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_invitations" ADD CONSTRAINT "assessment_invitations_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "assessment_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "assessment_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_scorecards" ADD CONSTRAINT "interview_scorecards_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policy_steps" ADD CONSTRAINT "approval_policy_steps_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "approval_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policy_steps" ADD CONSTRAINT "approval_policy_steps_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policy_steps" ADD CONSTRAINT "approval_policy_steps_specificUserId_fkey" FOREIGN KEY ("specificUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "approval_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_delegatedToId_fkey" FOREIGN KEY ("delegatedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
