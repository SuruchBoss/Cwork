// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { qk, queryClient } from '@/app/query-client';
import ApprovalsPage from '@/features/approvals/ApprovalsPage';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import type { ApprovalTask, LoginSession } from '@/types/api';

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

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

function session(email: string): LoginSession {
  return {
    accessToken: `access-${email}`,
    refreshToken: `refresh-${email}`,
    user: { id: `id-${email}`, email, permissions: [], roles: [] },
  } as unknown as LoginSession;
}

const leaveTask: ApprovalTask = {
  id: 'task-1',
  stepIndex: 0,
  status: 'PENDING',
  dueAt: null,
  createdAt: '2026-10-18T00:00:00.000Z',
  instance: {
    id: 'inst-1',
    entityType: 'LEAVE_REQUEST',
    entityId: 'leave-1',
    snapshot: { leaveTypeCode: 'ANNUAL', totalDays: 1, startDate: '2026-10-27' },
    submittedAt: '2026-10-18T00:00:00.000Z',
    submittedBy: {
      id: 'user-dev1',
      email: 'dev1@cwork.example',
      employee: { firstNameTh: 'สุชานาถ', lastNameTh: 'ประเสริฐ', employeeCode: 'EMP-0006' },
    },
  },
};

/** What the server would answer, by whoever the access token says is asking. */
function serveByUser() {
  get.mockImplementation(() => {
    const token = useAuthStore.getState().accessToken;
    return Promise.resolve(token === 'access-eng.manager@cwork.example' ? [leaveTask] : []);
  });
  post.mockImplementation((path: string, body?: unknown) => {
    const role = (body as { as?: string } | undefined)?.as;
    if (path === '/demo/sign-in') {
      return Promise.resolve(
        session(role === 'manager' ? 'eng.manager@cwork.example' : 'hr.manager@cwork.example'),
      );
    }
    if (path === '/auth/login') return Promise.resolve(session('hr.manager@cwork.example'));
    return Promise.resolve({});
  });
}

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, demoRole: null });
  queryClient.clear();
  serveByUser();
});

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe('Cached server data does not follow a session to the next user', () => {
  it('shows the manager’s approvals right after a switch from HR on the demo', async () => {
    // HR lands and the console asks for the approvals of the person signed in:
    // nobody's waiting on HR, and the empty answer is cached for 30 seconds.
    await useAuthStore.getState().demoSignIn('hr');
    const first = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ApprovalsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(qk.approvalTasks('PENDING'))).toEqual([]),
    );
    first.unmount();

    // The visitor presses "View as manager" and opens the approvals again.
    await useAuthStore.getState().demoSignIn('manager');
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ApprovalsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('สุชานาถ ประเสริฐ')).toBeInTheDocument();
  });

  it('drops the cache at sign-out, so the next person on the same PC starts clean', async () => {
    await useAuthStore.getState().demoSignIn('manager');
    queryClient.setQueryData(qk.approvalTasks('PENDING'), [leaveTask]);

    await useAuthStore.getState().logout();

    expect(queryClient.getQueryData(qk.approvalTasks('PENDING'))).toBeUndefined();
  });

  it('drops the cache at an ordinary sign-in too', async () => {
    queryClient.setQueryData(qk.approvalTasks('PENDING'), [leaveTask]);

    await useAuthStore.getState().login('hr.manager@cwork.example', 'a password');

    expect(queryClient.getQueryData(qk.approvalTasks('PENDING'))).toBeUndefined();
  });
});
