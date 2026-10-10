// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import PayrollPage from '../PayrollPage';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
  saveBlob: vi.fn(),
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const halves = [
  {
    id: 'p-h1',
    code: '2026-11-H1',
    year: 2026,
    month: 11,
    payFrequency: 'SEMI_MONTHLY',
    half: 1,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-15',
    payDate: '2026-11-16',
    status: 'OPEN',
    _count: { runs: 0 },
  },
];

function render() {
  return renderWithProviders(
    <MemoryRouter>
      <PayrollPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // 30 October 2026, so the year list holds 2026 and November is ahead.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 30, 10) });
  useUiStore.setState({ language: 'th' });
  useAuthStore.setState({ can: (...permissions: string[]) => permissions.includes(P.PAYROLL_RUN) });
  get.mockImplementation((path: string) =>
    Promise.resolve(path === '/payroll/periods' ? halves : []),
  );
  post.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Half-month pay periods (CW-069)', () => {
  it('labels a half by its dates, in Thai years', async () => {
    const { container } = render();
    expect(await screen.findByText('1–15 พฤศจิกายน 2569')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('creates the second half with its fixed dates', async () => {
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /สร้างงวดใหม่/ }));
    await user.selectOptions(screen.getByLabelText('เดือน'), '11');
    await user.selectOptions(screen.getByLabelText('งวดการจ่าย'), 'H2');
    expect(screen.getByLabelText('เริ่มงวด')).toBeDisabled();
    await user.type(screen.getByLabelText('วันจ่าย'), '2026-11-30');
    await user.click(screen.getByRole('button', { name: 'สร้างงวด' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/payroll/periods', {
        year: 2026,
        month: 11,
        periodStart: '2026-11-16',
        periodEnd: '2026-11-30',
        payDate: '2026-11-30',
        payFrequency: 'SEMI_MONTHLY',
        half: 2,
      }),
    );
  });

  it('names the period that already exists, in Thai', async () => {
    post.mockRejectedValueOnce(
      new ApiError(409, 'PAYROLL_PERIOD_EXISTS', 'exists', {
        periodId: 'p-h1',
        code: '2026-11-H1',
      }),
    );
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /สร้างงวดใหม่/ }));
    await user.selectOptions(screen.getByLabelText('เดือน'), '11');
    await user.selectOptions(screen.getByLabelText('งวดการจ่าย'), 'H1');
    await user.type(screen.getByLabelText('วันจ่าย'), '2026-11-16');
    await user.click(screen.getByRole('button', { name: 'สร้างงวด' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'เดือนนั้นมีงวดนี้อยู่แล้ว: 1–15 พฤศจิกายน 2569',
    );
  });
});
