import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors carry a stable machine-readable `code` so clients (and the
 * Flutter app in particular) can branch on the reason rather than on a
 * translated message string.
 */
export class DomainError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super(
      'RESOURCE_NOT_FOUND',
      id ? `${resource} '${id}' was not found` : `${resource} was not found`,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}

export class BusinessRuleError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

export class AccessDeniedError extends DomainError {
  constructor(message = 'You do not have access to this resource') {
    super('ACCESS_DENIED', message, HttpStatus.FORBIDDEN);
  }
}

/** Common leave/attendance/payroll rule codes, referenced by web and mobile. */
export const ErrorCode = {
  INSUFFICIENT_LEAVE_BALANCE: 'INSUFFICIENT_LEAVE_BALANCE',
  OVERLAPPING_LEAVE: 'OVERLAPPING_LEAVE',
  LEAVE_NOTICE_TOO_SHORT: 'LEAVE_NOTICE_TOO_SHORT',
  LEAVE_ATTACHMENT_REQUIRED: 'LEAVE_ATTACHMENT_REQUIRED',
  NO_WORKING_DAYS_SELECTED: 'NO_WORKING_DAYS_SELECTED',
  ALREADY_CLOCKED_IN: 'ALREADY_CLOCKED_IN',
  NOT_CLOCKED_IN: 'NOT_CLOCKED_IN',
  OUTSIDE_GEOFENCE: 'OUTSIDE_GEOFENCE',
  DUPLICATE_PUNCH: 'DUPLICATE_PUNCH',
  ATTENDANCE_LOCKED: 'ATTENDANCE_LOCKED',
  PAYROLL_PERIOD_LOCKED: 'PAYROLL_PERIOD_LOCKED',
  PAYROLL_ALREADY_RUN: 'PAYROLL_ALREADY_RUN',
  MISSING_COMPENSATION: 'MISSING_COMPENSATION',
  APPROVAL_NOT_PENDING: 'APPROVAL_NOT_PENDING',
  NOT_AN_EMPLOYEE: 'NOT_AN_EMPLOYEE',
  ASSISTANT_DISABLED: 'ASSISTANT_DISABLED',
  ASSISTANT_QUOTA_EXCEEDED: 'ASSISTANT_QUOTA_EXCEEDED',
} as const;
