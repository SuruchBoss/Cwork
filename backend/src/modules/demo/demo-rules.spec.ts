// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { demoRefusal, type DemoRequest } from './demo-rules';

const refused = (request: DemoRequest): string | undefined => demoRefusal(request, 'api')?.code;

describe('demoRefusal', () => {
  it.each(['login', 'mfa/verify', 'mfa/enroll', 'mfa/activate'])(
    'refuses password and code sign-in: POST auth/%s',
    (route) => {
      expect(refused({ method: 'POST', path: `/api/v1/auth/${route}` })).toBe('DEMO_SIGN_IN_ONLY');
    },
  );

  it.each(['change-password', 'mfa/disable', 'mfa/recovery-codes'])(
    'refuses changing the shared credentials: POST auth/%s',
    (route) => {
      expect(refused({ method: 'POST', path: `/api/v1/auth/${route}` })).toBe(
        'DEMO_SHARED_ACCOUNT',
      );
    },
  );

  it('refuses revoking a session, which on a shared account is somebody else', () => {
    expect(
      refused({
        method: 'DELETE',
        path: '/api/v1/auth/sessions/7d1f2c3a-0000-4000-8000-000000000000',
      }),
    ).toBe('DEMO_SHARED_ACCOUNT');
  });

  it('refuses signing out everywhere, but not signing yourself out', () => {
    expect(refused({ method: 'POST', path: '/api/v1/auth/logout', body: {} })).toBe(
      'DEMO_SHARED_ACCOUNT',
    );
    expect(refused({ method: 'POST', path: '/api/v1/auth/logout' })).toBe('DEMO_SHARED_ACCOUNT');
    expect(
      refused({ method: 'POST', path: '/api/v1/auth/logout', body: { refreshToken: 'eyJ.a.b' } }),
    ).toBeUndefined();
  });

  it('refuses every upload, wherever it is sent', () => {
    for (const path of ['/api/v1/files/upload', '/api/v1/careers/some-job/apply', '/anything']) {
      expect(
        refused({ method: 'POST', path, contentType: 'multipart/form-data; boundary=x' }),
      ).toBe('DEMO_UPLOADS_OFF');
    }
  });

  it('lets everything else through, including reading the same routes', () => {
    expect(refused({ method: 'GET', path: '/api/v1/auth/sessions' })).toBeUndefined();
    expect(refused({ method: 'GET', path: '/api/v1/auth/mfa/status' })).toBeUndefined();
    expect(refused({ method: 'POST', path: '/api/v1/demo/sign-in' })).toBeUndefined();
    expect(refused({ method: 'POST', path: '/api/v1/auth/refresh' })).toBeUndefined();
    expect(
      refused({ method: 'POST', path: '/api/v1/leave/requests', contentType: 'application/json' }),
    ).toBeUndefined();
    expect(refused({ method: 'DELETE', path: '/api/v1/employees/abc' })).toBeUndefined();
  });

  it('follows the configured prefix and any API version', () => {
    expect(demoRefusal({ method: 'POST', path: '/hr/v2/auth/login' }, 'hr')?.code).toBe(
      'DEMO_SIGN_IN_ONLY',
    );
    expect(demoRefusal({ method: 'POST', path: '/api/v1/auth/login' }, 'hr')).toBeNull();
  });
});
