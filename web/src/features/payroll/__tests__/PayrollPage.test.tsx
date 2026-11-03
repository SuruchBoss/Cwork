// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

  it('creates a 14-day period from its start and pay date alone', async () => {
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /สร้างงวดใหม่/ }));
    await user.selectOptions(screen.getByLabelText('งวดการจ่าย'), 'B14');
    // The server numbers it and says which month it counts toward.
    expect(screen.queryByLabelText('เดือน')).toBeNull();
    expect(screen.getByLabelText('เริ่มงวด')).toHaveValue('30 ต.ค. 2569');
    expect(screen.getByLabelText('สิ้นงวด')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'สร้างงวด' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/payroll/periods', {
        payFrequency: 'BIWEEKLY',
        periodStart: '2026-10-30',
        payDate: '2026-11-12',
      }),
    );
  });

  it('says when the next 14-day period must start, in Thai', async () => {
    post.mockRejectedValueOnce(
      new ApiError(422, 'PAYROLL_PERIOD_NOT_NEXT', 'not next', { expectedStart: '2026-11-13' }),
    );
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /สร้างงวดใหม่/ }));
    await user.selectOptions(screen.getByLabelText('งวดการจ่าย'), 'B14');
    await user.click(screen.getByRole('button', { name: 'สร้างงวด' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'งวด 14 วันถัดไปต้องเริ่ม 13 พ.ย. 2569 คือวันถัดจากวันที่งวดก่อนจบ',
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

describe('Social security shortfall link (CW-075)', () => {
  it('shows the report to whoever may export payroll, and only to them', async () => {
    useAuthStore.setState({
      can: (...permissions: string[]) => permissions.includes(P.PAYROLL_EXPORT),
    });
    const { unmount } = render();
    expect(await screen.findByRole('link', { name: 'ส่วนต่างประกันสังคม' })).toHaveAttribute(
      'href',
      '/payroll/sso-shortfall',
    );
    // Exporting alone does not run payroll.
    expect(screen.queryByRole('link', { name: 'เงินเบิกล่วงหน้า' })).toBeNull();
    unmount();

    useAuthStore.setState({
      can: (...permissions: string[]) => permissions.includes(P.PAYROLL_RUN),
    });
    render();
    expect(await screen.findByRole('link', { name: 'เงินเบิกล่วงหน้า' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ส่วนต่างประกันสังคม' })).toBeNull();
  });
});

describe('First-time use of the periods page', () => {
  it('fills the pay date with the end of the period until HR picks one', async () => {
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /สร้างงวดใหม่/ }));
    expect(screen.getByLabelText('วันจ่าย')).toHaveValue('31 ต.ค. 2569');
    await user.selectOptions(screen.getByLabelText('งวดการจ่าย'), 'H1');
    expect(screen.getByLabelText('วันจ่าย')).toHaveValue('15 ต.ค. 2569');
  });

  it('opens the run it just created, where the next step is', async () => {
    post.mockResolvedValue({ id: 'run-new' });
    renderWithProviders(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<PayrollPage />} />
          <Route path="/payroll/runs/:id" element={<p>run page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'สร้างรอบคำนวณ' }));

    expect(await screen.findByText('run page')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/payroll/runs', { periodId: 'p-h1' });
  });

  it('says why a run could not be created', async () => {
    post.mockRejectedValueOnce(
      new ApiError(409, 'RUN_EXISTS', 'This period already has a run', {}),
    );
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'สร้างรอบคำนวณ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This period already has a run');
  });

  describe('a period that already has a run', () => {
    const runOf = (status: string, over: Record<string, unknown> = {}) => ({
      id: `run-${status}`,
      runNo: 'RUN-1',
      type: 'REGULAR',
      status,
      periodId: 'p-h1',
      totalNet: '1000',
      currency: 'THB',
      ...over,
    });

    function serveRuns(runs: unknown[]) {
      get.mockImplementation((path: string) =>
        Promise.resolve(
          path === '/payroll/periods' ? halves : path === '/payroll/runs' ? runs : [],
        ),
      );
    }

    it('offers to open the run instead of creating a second one', async () => {
      serveRuns([runOf('CALCULATED')]);
      render();

      const open = await screen.findByRole('link', { name: 'เปิดรอบ' });
      expect(open).toHaveAttribute('href', '/payroll/runs/run-CALCULATED');
      expect(screen.queryByRole('button', { name: 'สร้างรอบคำนวณ' })).not.toBeInTheDocument();
    });

    it('offers to create again when the only run was cancelled or failed', async () => {
      serveRuns([runOf('CANCELLED'), runOf('FAILED', { id: 'run-f' })]);
      render();

      expect(await screen.findByRole('button', { name: 'สร้างรอบคำนวณ' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'เปิดรอบ' })).not.toBeInTheDocument();
    });

    it('offers to create for a period with no run of its own', async () => {
      serveRuns([runOf('CALCULATED', { periodId: 'another-period' })]);
      render();

      expect(await screen.findByRole('button', { name: 'สร้างรอบคำนวณ' })).toBeInTheDocument();
    });
  });
});
