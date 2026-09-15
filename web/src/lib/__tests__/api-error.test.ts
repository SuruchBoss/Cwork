import { describe, expect, it } from 'vitest';
import { ApiError } from '../api-error';

describe('ApiError.fromBody', () => {
  it('carries the server code and request id', () => {
    const error = ApiError.fromBody(422, {
      code: 'INSUFFICIENT_LEAVE_BALANCE',
      message: 'วันลาไม่พอ',
      requestId: 'req-123',
    });

    expect(error.code).toBe('INSUFFICIENT_LEAVE_BALANCE');
    expect(error.message).toBe('วันลาไม่พอ');
    expect(error.requestId).toBe('req-123');
  });

  it('falls back when the body is not JSON', () => {
    const error = ApiError.fromBody(500, null);
    expect(error.code).toBe('UNKNOWN');
    expect(error.status).toBe(500);
  });
});

describe('retry classification', () => {
  it('treats client errors as terminal so they are not retried', () => {
    expect(ApiError.fromBody(403, { code: 'ACCESS_DENIED' }).isTerminal).toBe(true);
    expect(ApiError.fromBody(422, { code: 'BUSINESS_RULE' }).isTerminal).toBe(true);
  });

  it('allows retrying timeouts and rate limits', () => {
    expect(ApiError.fromBody(408, {}).isTerminal).toBe(false);
    expect(ApiError.fromBody(429, {}).isTerminal).toBe(false);
  });

  it('allows retrying server errors', () => {
    expect(ApiError.fromBody(503, {}).isTerminal).toBe(false);
  });

  it('flags auth and permission errors distinctly', () => {
    expect(ApiError.fromBody(401, {}).isAuthError).toBe(true);
    expect(ApiError.fromBody(403, {}).isForbidden).toBe(true);
  });
});
