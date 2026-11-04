// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
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

describe('DashboardPage payroll cards for an owner who approves payroll', () => {
  const run = (over: Record<string, unknown>) => ({
    id: 'r',
    runNo: 'RUN-1',
    type: 'REGULAR',
    status: 'DRAFT',
    employeeCount: 0,
    totalGross: '0',
    totalDeduction: '0',
    totalNet: '0',
    totalEmployerCost: '0',
    currency: 'THB',
    createdById: 'someone-else',
    calculatedById: null,
    period: { code: '2026-10', year: 2026, month: 10, payDate: '2026-10-31' },
    ...over,
  });

  function asOwner() {
    useAuthStore.setState({
      user: {
        id: 'owner',
        email: 'owner@example.com',
        displayName: 'เจ้าของ',
        roles: ['SUPER_ADMIN'],
        permissions: [P.PAYROLL_READ, P.PAYROLL_APPROVE],
      },
    } as never);
  }

  function serve(runs: unknown[]) {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path === '/payroll/runs' ? runs : [],
    );
  }

  beforeEach(() => {
    useUiStore.setState({ language: 'th' });
    asOwner();
  });

  it('counts a calculated run that someone else prepared as waiting for the owner', async () => {
    serve([run({ id: 'r1', status: 'CALCULATED', totalNet: '1000', calculatedById: 'hr' })]);
    render();

    const card = (await screen.findByText('รอบเงินเดือนที่รอคุณอนุมัติ')).closest('a');
    await waitFor(() => {
      expect(card).toHaveTextContent('1');
      expect(card).toHaveTextContent('แตะเพื่อเปิดรอบนี้');
      expect(card).toHaveAttribute('href', '/payroll/runs/r1');
    });
  });

  it('opens the list of waiting runs when there are several (CW-112)', async () => {
    serve([
      run({ id: 'r1', status: 'CALCULATED', calculatedById: 'hr' }),
      run({ id: 'r2', status: 'CALCULATED', calculatedById: 'hr' }),
      run({ id: 'r3', status: 'CALCULATED', createdById: 'owner' }),
    ]);
    render();

    const card = (await screen.findByText('รอบเงินเดือนที่รอคุณอนุมัติ')).closest('a');
    await waitFor(() => {
      expect(card).toHaveTextContent('2');
      expect(card).toHaveAttribute('href', '/payroll?waiting=me');
    });
  });

  it('does not count a run the owner prepared as waiting for the owner, and says why', async () => {
    serve([run({ id: 'r2', status: 'CALCULATED', createdById: 'owner' })]);
    render();

    const card = (await screen.findByText('รอบเงินเดือนที่รอคุณอนุมัติ')).closest('a');
    await waitFor(() => {
      expect(card).toHaveTextContent('0');
      expect(card).toHaveTextContent('คุณเป็นคนเตรียมรอบนี้ ต้องให้คนอื่นอนุมัติ');
    });
  });

  it('shows the latest run that has figures, not a newer draft at zero', async () => {
    serve([
      run({ id: 'new', runNo: 'RUN-3', status: 'DRAFT' }),
      run({
        id: 'old',
        runNo: 'RUN-2',
        status: 'APPROVED',
        totalNet: '25000',
        period: { code: '2026-09', year: 2026, month: 9, payDate: '2026-09-30' },
      }),
    ]);
    render();

    const card = (await screen.findByText('รอบเงินเดือนล่าสุด')).closest('a');
    await waitFor(() => {
      expect(card).toHaveTextContent('25,000');
      expect(card).not.toHaveTextContent('฿0.00');
    });
  });

  it('says there is no calculated run yet when only a draft exists', async () => {
    serve([run({ id: 'd', status: 'DRAFT' })]);
    render();

    const card = (await screen.findByText('รอบเงินเดือนล่าสุด')).closest('a');
    await waitFor(() => {
      expect(card).toHaveTextContent('ยังไม่มีรอบที่คำนวณแล้ว');
    });
  });
});
