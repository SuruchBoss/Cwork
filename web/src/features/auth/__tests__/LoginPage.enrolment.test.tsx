// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { renderWithProviders } from '@/test/a11y';
import type { LoginSession } from '@/types/api';
import LoginPage from '../LoginPage';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    configure: vi.fn(),
  },
}));

// The QR encoder draws on a canvas jsdom does not have; the picture is not what
// is under test here.
vi.mock('qrcode', () => ({ toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,') }));

const session: LoginSession = {
  mfaRequired: false,
  accessToken: 'access-from-activate',
  refreshToken: 'refresh-from-activate',
  expiresIn: 900,
  tokenType: 'Bearer',
  user: {
    id: 'user-1',
    email: 'admin@example.com',
    organizationId: 'org-1',
    employeeId: null,
    displayName: null,
    roles: ['SUPER_ADMIN'],
    permissions: [],
    locale: 'en',
    photoUrl: null,
  },
};

/**
 * What the API answers for an account that must enrol before it may sign in.
 * Anything else — `/auth/mfa/complete-enrolment` above all, which no longer
 * exists — is a failure: calling it would leave the account unable to sign in.
 */
const responses: Record<string, unknown> = {
  '/auth/login': {
    mfaRequired: true,
    mfaEnrolled: false,
    challengeToken: 'challenge-1',
    expiresIn: 300,
  },
  '/auth/mfa/enroll': {
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUri: 'otpauth://totp/Cwork:admin?secret=JBSWY3DPEHPK3PXP',
  },
  '/auth/mfa/activate': { recoveryCodes: ['abcd-efgh-ijkl-mnop'], session },
};

function renderLogin() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>console home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage — enrolling a second factor while signing in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ language: 'en' });
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isBootstrapping: false,
    });
    vi.mocked(api.get).mockResolvedValue({ initialised: true });
    vi.mocked(api.post).mockImplementation((async (path: string) => {
      if (path in responses) return responses[path];
      throw new Error(`unexpected POST ${path}`);
    }) as unknown as typeof api.post);
  });

  it('signs in with the session activation returns, once the recovery codes are seen', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // A code from the new secret switches the factor on.
    await user.type(await screen.findByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    // The codes come first, and nothing is stored yet: a session adopted now
    // would redirect straight past them.
    expect(await screen.findByText('abcd-efgh-ijkl-mnop')).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Saved, sign in' }));

    expect(await screen.findByText('console home')).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe('access-from-activate');

    // Password, enrol, activate — and no fourth call to trade the challenge for a
    // session: the code that activated the factor is what signed the account in.
    expect(vi.mocked(api.post).mock.calls.map(([path]) => path)).toEqual([
      '/auth/login',
      '/auth/mfa/enroll',
      '/auth/mfa/activate',
    ]);
    expect(api.post).toHaveBeenCalledWith(
      '/auth/mfa/activate',
      expect.objectContaining({ challengeToken: 'challenge-1', code: '123456' }),
      { anonymous: true },
    );
  });
});
