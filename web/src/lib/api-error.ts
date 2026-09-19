import { t } from '@/lib/i18n';
import type { ApiErrorBody } from '@/types/api';

/**
 * Wraps a non-2xx API response. Carries the server's stable `code` so callers
 * can branch on the reason rather than on a translated message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  static fromBody(status: number, body: Partial<ApiErrorBody> | null): ApiError {
    return new ApiError(
      status,
      body?.code ?? 'UNKNOWN',
      body?.message ?? t('Something went wrong'),
      body?.details,
      body?.requestId,
    );
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Retrying the same request will not help for these. */
  get isTerminal(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}
