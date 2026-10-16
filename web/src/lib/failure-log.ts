// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The last few requests that failed, kept in memory for the "report a problem"
 * form (CW-087). What is kept is decided here, once, and it is deliberately
 * little: the shape of the request and the reason it failed, never anything a
 * person typed or anything the server said about a person.
 *
 *  - the path, with every part that is not a plain lowercase word (an id, a
 *    code, a name, anything encoded) replaced by `:id`;
 *  - the names of the query parameters, never their values;
 *  - the status, the server's stable error `code` and its request id;
 *  - never the request body, never the response body, never the message (a
 *    message such as "Employee EMP-0001 was not found" can name someone).
 *
 * Nothing is persisted and nothing is sent: the list is gone when the tab closes.
 */

export interface FailedRequest {
  /** ISO time the request failed. */
  at: string;
  method: string;
  /** `/employees/:id/roles`: the route, not the address that was called. */
  path: string;
  /** Parameter names only, in the order they were sent. */
  queryKeys: string[];
  /** 0 when no answer came at all (offline, server down). */
  status: number;
  code: string;
  requestId: string | null;
}

const KEEP = 10;
const failures: FailedRequest[] = [];

/**
 * `/employees/3f2c…/roles` → `/employees/:id/roles`. A segment survives only if
 * it is a plain lowercase word, which every fixed part of Cwork's API is; a
 * UUID, an employee code, a period code, a name or an encoded Thai word is
 * replaced. A query string or fragment is dropped.
 */
export function maskPath(path: string): string {
  const route = path.split(/[?#]/, 1)[0] ?? '';
  const masked = route
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => (/^[a-z][a-z-]*$/.test(segment) ? segment : ':id'));
  return `/${masked.join('/')}`;
}

/** The parameter names that were sent: a name made of anything but plain letters and digits is left out. */
export function maskQueryKeys(query: Record<string, unknown> | undefined | null): string[] {
  if (!query) return [];
  return Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key]) => key)
    .filter((key) => /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key));
}

/** Only a stable code made of capitals, digits and underscores is kept. */
function safeCode(code: string | undefined | null): string {
  return code && /^[A-Z][A-Z0-9_]{0,59}$/.test(code) ? code : 'UNKNOWN';
}

/** Only an id of the shape the server issues is kept. */
function safeRequestId(id: string | undefined | null): string | null {
  return id && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function describeFailure(
  input: {
    method: string;
    path: string;
    query?: Record<string, unknown> | null;
    status: number;
    code?: string | null;
    requestId?: string | null;
  },
  now: Date = new Date(),
): FailedRequest {
  const method = input.method.toUpperCase();
  return {
    at: now.toISOString(),
    method: METHODS.includes(method) ? method : 'OTHER',
    path: maskPath(input.path),
    queryKeys: maskQueryKeys(input.query),
    status: Number.isInteger(input.status) && input.status >= 0 ? input.status : 0,
    code: safeCode(input.code),
    requestId: safeRequestId(input.requestId),
  };
}

export function recordFailure(failure: FailedRequest): void {
  failures.push(failure);
  if (failures.length > KEEP) failures.splice(0, failures.length - KEEP);
}

/** Oldest first. */
export function recentFailures(): FailedRequest[] {
  return failures.map((failure) => ({ ...failure, queryKeys: [...failure.queryKeys] }));
}

export function clearFailures(): void {
  failures.length = 0;
}

/** The report form is not the screen the problem happened on. */
const REPORT_ROUTE = '/support/report';
let currentRoute: string | null = null;

/** Called as the person moves about the console; the form reads where they were. */
export function noteRoute(pathname: string): void {
  const route = maskPath(pathname);
  if (route !== REPORT_ROUTE) currentRoute = route;
}

/** `/payroll/runs/:id`, or null if no screen has been seen yet. */
export function lastRoute(): string | null {
  return currentRoute;
}

export function resetRoute(): void {
  currentRoute = null;
}
