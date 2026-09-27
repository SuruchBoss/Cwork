// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * What the public demo will not do, whoever asks.
 *
 * Everything else in the console works as it would anywhere. These are the
 * requests that make no sense when three accounts are shared by every visitor
 * and nobody holds a password — each of them would either lock the next
 * visitor out or reach a visitor they know nothing about:
 *
 * - **Signing in with a password or a code.** There is no password to know:
 *   the demo's is generated at each reset and never shown. Refusing the route
 *   outright also means a stranger cannot trip the lockout by guessing at it.
 * - **Changing a demo account's password or second factor.** Nobody signs in
 *   with them, so the change would do nothing except sign every other visitor
 *   out of the same account.
 * - **Revoking sessions other than your own.** On a shared account, the other
 *   sessions are other people.
 * - **Uploading a file.** Nothing scans uploads without ClamAV, and whatever one
 *   visitor uploaded would be served to the next.
 *
 * Deactivating a demo account, changing its roles and the lockout itself are
 * not refused — refusing every route that could do them would be a list that
 * goes stale. The one-click sign-in puts those back instead (DemoService).
 */

export interface DemoRefusal {
  code: 'DEMO_SIGN_IN_ONLY' | 'DEMO_SHARED_ACCOUNT' | 'DEMO_UPLOADS_OFF';
  message: string;
}

export interface DemoRequest {
  method: string;
  /** The path without the query string, prefix and version included. */
  path: string;
  contentType?: string;
  body?: unknown;
}

const SIGN_IN_ONLY: DemoRefusal = {
  code: 'DEMO_SIGN_IN_ONLY',
  message: 'The demo has no password to type: choose employee, manager or HR on the sign-in page.',
};

const SHARED_ACCOUNT: DemoRefusal = {
  code: 'DEMO_SHARED_ACCOUNT',
  message:
    'Everyone trying the demo shares this account, so its password, two-factor ' +
    'settings and other sessions stay as they are.',
};

const UPLOADS_OFF: DemoRefusal = {
  code: 'DEMO_UPLOADS_OFF',
  message:
    'Uploads are off in the public demo: nothing scans them, and a file one visitor ' +
    'uploaded would be served to the next.',
};

/** `/api/v1/auth/login` → `auth/login`, whatever the prefix and version. */
function route(path: string, apiPrefix: string): string | null {
  const prefix = `/${apiPrefix.replace(/^\/+|\/+$/g, '')}/`;
  if (!path.startsWith(prefix)) return null;
  return path
    .slice(prefix.length)
    .replace(/^v\d+\//, '')
    .replace(/\/+$/, '');
}

export function demoRefusal(request: DemoRequest, apiPrefix: string): DemoRefusal | null {
  const method = request.method.toUpperCase();

  if (
    method !== 'GET' &&
    method !== 'HEAD' &&
    request.contentType?.toLowerCase().startsWith('multipart/')
  ) {
    return UPLOADS_OFF;
  }

  const path = route(request.path, apiPrefix);
  if (path === null) return null;

  if (method === 'POST') {
    switch (path) {
      case 'auth/login':
      case 'auth/mfa/verify':
      case 'auth/mfa/enroll':
      case 'auth/mfa/activate':
        return SIGN_IN_ONLY;
      case 'auth/change-password':
      case 'auth/mfa/disable':
      case 'auth/mfa/recovery-codes':
        return SHARED_ACCOUNT;
      case 'auth/logout': {
        // Without a refresh token, logout signs out every session the account has.
        const token = (request.body as { refreshToken?: unknown } | undefined)?.refreshToken;
        return typeof token === 'string' && token.length > 0 ? null : SHARED_ACCOUNT;
      }
    }
  }

  if (method === 'DELETE' && /^auth\/sessions\/[^/]+$/.test(path)) return SHARED_ACCOUNT;

  return null;
}
