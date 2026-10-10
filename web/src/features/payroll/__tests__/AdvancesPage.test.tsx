// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import type { PayrollAdvance } from '@/types/api';
import AdvancesPage from '../AdvancesPage';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    configure: vi.fn(),
    onDemoReset: vi.fn(),
  },
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const del = vi.mocked(api.delete);

const worker = { id: 'e-1', employeeCode: 'D001', firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' };

const carried: PayrollAdvance = {
  id: 'a-1',
  employeeId: 'e-1',
  employee: worker,
  amount: 5000,
  paidOn: '2026-11-10',
  method: 'CASH',
  note: null,
  status: 'ACTIVE',
  deducted: 3380,
  outstanding: 1620,
  locked: true,
  deductions: [
    {
      amount: 3380,
      runId: 'run-h1',
      runNo: 'PAY-2026-00001',
      runStatus: 'PAID',
      periodCode: '2026-11-H1',
    },
  ],
};

const fresh: PayrollAdvance = {
  ...carried,
  employee: { ...worker, status: 'RESIGNED' },
  id: 'a-2',
  amount: 300,
  paidOn: '2026-11-20',
  method: 'BANK_TRANSFER',
  deducted: 0,
  outstanding: 300,
  locked: false,
  deductions: [],
};

function render() {
  return renderWithProviders(
    <MemoryRouter>
      <AdvancesPage />
    </MemoryRouter>,
  );
}

const allow = (permissions: string[]) =>
  useAuthStore.setState({
    can: (...asked: string[]) => asked.some((p) => permissions.includes(p)),
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 25, 10) });
  useUiStore.setState({ language: 'th' });
  get.mockImplementation((path: string) => {
    if (path === '/payroll/advances') return Promise.resolve([carried, fresh]);
    if (path === '/employees') {
      return Promise.resolve({
        data: [{ ...worker, nickname: null, department: { name: 'ฝ่ายผลิต' } }],
        meta: {},
      });
    }
    return Promise.resolve([]);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Cash advances (CW-070)', () => {
  it('shows what each person still owes, and where it was taken back, in Thai', async () => {
    allow([P.PAYROLL_READ]);
    const { container } = render();

    const row = (await screen.findAllByText('สมชาย ใจดี'))[0].closest('tr')!;
    expect(within(row).getByText('10 พ.ย. 2569')).toBeInTheDocument();
    expect(within(row).getByText('฿1,620.00')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '1–15 พฤศจิกายน 2569' })).toHaveAttribute(
      'href',
      '/payroll/runs/run-h1',
    );
    // Only someone who runs payroll records or changes advances.
    expect(screen.queryByRole('heading', { name: 'บันทึกเงินเบิก' })).toBeNull();
    expect(screen.queryByRole('button', { name: /แก้ไขเงินเบิก/ })).toBeNull();
    expect(get).toHaveBeenCalledWith('/payroll/advances', { query: { owing: 'true' } });
    await expectNoAxeViolations(container);
  });

  it('offers no change to an advance an approved run took back', async () => {
    allow([P.PAYROLL_READ, P.PAYROLL_RUN]);
    render();

    const locked = (await screen.findByText('10 พ.ย. 2569')).closest('tr')!;
    expect(within(locked).queryByRole('button')).toBeNull();
    expect(within(locked).getByText('อยู่ในรอบที่อนุมัติแล้ว')).toBeInTheDocument();

    const open = screen.getByText('20 พ.ย. 2569').closest('tr')!;
    // Left, still owing: shown, not hidden, so HR can collect it.
    expect(within(open).getByText('ลาออกแล้ว')).toBeInTheDocument();
    expect(within(locked).queryByText('ลาออกแล้ว')).toBeNull();
    expect(within(open).getByText(/โอนเงิน/)).toBeInTheDocument();
    expect(
      within(open).getByRole('button', { name: 'แก้ไขเงินเบิกของ สมชาย ใจดี' }),
    ).toBeInTheDocument();
  });

  it('records an advance for a person found by name', async () => {
    allow([P.PAYROLL_READ, P.PAYROLL_RUN]);
    post.mockResolvedValue({ ...fresh, amount: 500, paidOn: '2026-11-25' });
    const { container } = render();
    const user = userEvent.setup();

    await user.type(
      await screen.findByPlaceholderText('ค้นหาชื่อ ชื่อเล่น หรือรหัสพนักงาน'),
      'สมชาย',
    );
    await user.click(await screen.findByRole('button', { name: /สมชาย ใจดี D001/ }));
    await user.type(screen.getByLabelText('จำนวนเงิน (บาท)'), '500');
    await user.click(screen.getByRole('button', { name: 'บันทึกเงินเบิก' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/payroll/advances', {
        employeeId: 'e-1',
        amount: 500,
        paidOn: '2026-11-25',
        method: 'CASH',
        note: '',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'บันทึกเงินเบิก ฿500.00 ที่จ่ายให้ สมชาย ใจดี วันที่ 25 พ.ย. 2569 แล้ว',
    );
    // Ready for the next one: nobody chosen, no amount.
    expect(screen.getByPlaceholderText('ค้นหาชื่อ ชื่อเล่น หรือรหัสพนักงาน')).toHaveValue('');
    expect(screen.getByLabelText('จำนวนเงิน (บาท)')).toHaveValue('');
    await expectNoAxeViolations(container);
  });

  it('says in Thai why an advance can no longer be cancelled', async () => {
    allow([P.PAYROLL_READ, P.PAYROLL_RUN]);
    del.mockRejectedValueOnce(new ApiError(422, 'ADVANCE_LOCKED', 'locked'));
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'ยกเลิกเงินเบิกของ สมชาย ใจดี' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'เงินเบิกนี้ถูกหักในรอบที่อนุมัติหรือจ่ายแล้ว จึงแก้ไขหรือยกเลิกไม่ได้',
    );
    expect(del).toHaveBeenCalledWith('/payroll/advances/a-2');
  });
});
