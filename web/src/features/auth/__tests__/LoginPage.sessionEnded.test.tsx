// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { renderWithProviders } from '@/test/a11y';
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

const THAI_NOTICE =
  'เซสชันนี้สิ้นสุดแล้ว เช่น หลังเปลี่ยนรหัสผ่านหรือออกจากระบบจากอีกเครื่อง กรุณาเข้าสู่ระบบอีกครั้ง';

function renderLogin() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.setState({ language: 'th' });
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isBootstrapping: false,
    sessionEnded: false,
  });
  vi.mocked(api.get).mockResolvedValue({ initialised: true });
});

describe('Coming back to sign in after the session ended', () => {
  it('says so in Thai, with the reasons a person would recognise', async () => {
    useAuthStore.setState({ sessionEnded: true });
    renderLogin();

    expect(await screen.findByText(THAI_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('เปลี่ยนรหัสผ่าน');
  });

  it('says it in English too', async () => {
    useUiStore.setState({ language: 'en' });
    useAuthStore.setState({ sessionEnded: true });
    renderLogin();

    expect(
      await screen.findByText(/Your session has ended, for example after the password was changed/),
    ).toBeInTheDocument();
  });

  it('says nothing to someone who is simply signing in', async () => {
    renderLogin();

    await screen.findByLabelText('อีเมล');
    expect(screen.queryByText(THAI_NOTICE)).not.toBeInTheDocument();
  });
});

describe('Finding the session gone', () => {
  it('notes it when the server refuses a stored session at start-up', async () => {
    useAuthStore.setState({ accessToken: 'old', refreshToken: 'old', isBootstrapping: true });
    vi.mocked(api.get).mockRejectedValueOnce(ApiError.fromBody(401, null));

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, sessionEnded: true });
  });

  it('does not blame the session when the server cannot be reached', async () => {
    useAuthStore.setState({ accessToken: 'old', refreshToken: 'old', isBootstrapping: true });
    vi.mocked(api.get).mockRejectedValueOnce(new TypeError('network down'));

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, sessionEnded: false });
  });

  it('forgets the note once someone signs in', async () => {
    useAuthStore.setState({ sessionEnded: true });
    vi.mocked(api.post).mockResolvedValueOnce({
      mfaRequired: false,
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      tokenType: 'Bearer',
      user: { id: 'u', email: 'x@example.com', organizationId: 'o', roles: [], permissions: [] },
    });

    await useAuthStore.getState().login('x@example.com', 'pw');

    expect(useAuthStore.getState().sessionEnded).toBe(false);
  });
});
