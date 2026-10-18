// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { P } from '@/lib/permissions';
import { renderWithProviders } from '@/test/a11y';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import DashboardPage from '../DashboardPage';

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

function asHr() {
  useAuthStore.setState({
    user: {
      id: 'hr',
      email: 'hr@example.com',
      displayName: 'ฝ่ายบุคคล',
      roles: ['HR_MANAGER'],
      permissions: [P.EMPLOYEE_READ, P.LEAVE_READ],
    },
  } as never);
}

function render() {
  return renderWithProviders(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage for HR', () => {
  beforeEach(() => {
    useUiStore.setState({ language: 'th' });
    asHr();
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/leave/requests') return { data: [], meta: { total: 2 } };
      if (path === '/employees') return { data: [], meta: { total: 8 } };
      return [];
    });
  });

  it('says the leave card is waiting on managers and is not HR’s own task', async () => {
    render();
    expect(await screen.findByText('คำขอลาที่รอหัวหน้าอนุมัติ')).toBeInTheDocument();
    expect(screen.getByText('ทั้งองค์กร ไม่ใช่งานของคุณ')).toBeInTheDocument();
    expect(screen.queryByText('คำขอลารออนุมัติ')).not.toBeInTheDocument();
  });

  it('says nothing is waiting for you, without the congratulation, and draws the check mark', async () => {
    const { container } = render();
    expect(await screen.findByText('ไม่มีรายการรอคุณอนุมัติ')).toBeInTheDocument();
    expect(screen.queryByText(/เคลียร์งานหมดแล้ว/)).not.toBeInTheDocument();
    expect(container.querySelector('.empty__icon svg.icon')).not.toBeNull();
  });

  it('says the same in English', async () => {
    useUiStore.setState({ language: 'en' });
    render();
    expect(await screen.findByText('Leave requests waiting for a manager')).toBeInTheDocument();
    expect(screen.getByText('The whole organisation, not your task')).toBeInTheDocument();
    expect(await screen.findByText('Nothing is waiting for your approval')).toBeInTheDocument();
  });
});
