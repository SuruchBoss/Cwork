// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import type { LoginSession } from '@/types/api';
import LoginPage from '../../auth/LoginPage';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    configure: vi.fn(),
    onDemoReset: vi.fn(),
  },
}));

const session: LoginSession = {
  mfaRequired: false,
  accessToken: 'access-from-demo',
  refreshToken: 'refresh-from-demo',
  expiresIn: 900,
  tokenType: 'Bearer',
  user: {
    id: 'user-hr',
    email: 'hr.manager@cwork.example',
    organizationId: 'org-1',
    employeeId: 'emp-2',
    displayName: 'วราภรณ์ สุขสวัสดิ์',
    roles: ['HR_ADMIN'],
    permissions: [],
    locale: 'th',
    photoUrl: null,
  },
};

let resetting = false;

function renderAt(url: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>console home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage on the public demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetting = false;
    useUiStore.setState({ language: 'en', languageExplicit: false });
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isBootstrapping: false,
      demoRole: null,
    });
    vi.mocked(api.get).mockImplementation((async (path: string) => {
      if (path === '/config') return { assistantEnabled: false, demo: true };
      if (path === '/demo') {
        return {
          resetting,
          nextResetAt: '2026-09-28T03:00:00.000Z',
          roles: ['employee', 'manager', 'hr'],
        };
      }
      if (path === '/setup/status') return { initialised: true };
      throw new Error(`unexpected GET ${path}`);
    }) as unknown as typeof api.get);
    vi.mocked(api.post).mockImplementation((async (path: string) => {
      if (path === '/demo/sign-in') return session;
      throw new Error(`unexpected POST ${path}`);
    }) as unknown as typeof api.post);
  });

  it('offers three roles and no password to type', async () => {
    const { container } = renderAt('/login');

    expect(await screen.findByRole('button', { name: /Employee/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manager/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /HR/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(await screen.findByText(/goes back to the start at/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('signs in with one click, as the role chosen', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    await user.click(await screen.findByRole('button', { name: /Manager/ }));

    expect(await screen.findByText('console home')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/demo/sign-in', { as: 'manager' }, { anonymous: true });
    expect(useAuthStore.getState().accessToken).toBe('access-from-demo');
    expect(useAuthStore.getState().demoRole).toBe('manager');
  });

  it('opens straight into HR from the landing page’s link, in the language it asks for', async () => {
    renderAt('/login?as=hr&lang=th');

    expect(await screen.findByText('console home')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/demo/sign-in', { as: 'hr' }, { anonymous: true });
    expect(useUiStore.getState().language).toBe('th');
    expect(useUiStore.getState().languageExplicit).toBe(true);
  });

  it('waits out a reset before following that link, rather than being refused', async () => {
    resetting = true;
    renderAt('/login?as=hr');

    await screen.findByRole('button', { name: /HR/ });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/demo', { anonymous: true }));
    expect(api.post).not.toHaveBeenCalled();
  });
});
