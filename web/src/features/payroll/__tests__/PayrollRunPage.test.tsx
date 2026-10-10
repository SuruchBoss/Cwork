// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import PayrollRunPage from '../PayrollRunPage';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const get = vi.mocked(api.get);

const secondHalf = {
  id: 'run-h2',
  runNo: 'PR-2026-11-H2-01',
  type: 'REGULAR',
  status: 'DRAFT',
  employeeCount: 0,
  totalGross: '0',
  totalDeduction: '0',
  totalNet: '0',
  totalEmployerCost: '0',
  currency: 'THB',
  calculatedAt: null,
  approvedAt: null,
  paidAt: null,
  failureReason: null,
  period: {
    code: '2026-11-H2',
    year: 2026,
    month: 11,
    payDate: '2026-11-30',
    payFrequency: 'SEMI_MONTHLY',
    half: 2,
  },
  payslips: [],
};

const slip = {
  id: 'ps-1',
  currency: 'THB',
  grossEarnings: '4000',
  totalDeductions: '200',
  netPay: '3800',
  publishedAt: null,
  employee: {
    id: 'e-1',
    employeeCode: 'D001',
    firstNameTh: 'สมชาย',
    lastNameTh: 'ใจดี',
    department: null,
  },
};

function serve(run: unknown) {
  get.mockImplementation((path: string) =>
    path === '/assistant/status'
      ? Promise.resolve({ enabled: false })
      : path === '/payroll/runs/run-h2'
        ? Promise.resolve(run)
        : Promise.resolve([]),
  );
}

function render() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/payroll/runs/run-h2']}>
      <Routes>
        <Route path="/payroll/runs/:id" element={<PayrollRunPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  useAuthStore.setState({
    can: (...permissions: string[]) =>
      permissions.includes(P.PAYROLL_RUN) || permissions.includes(P.PAYROLL_APPROVE),
  });
});

afterEach(() => vi.clearAllMocks());

describe('A second-half run (CW-069)', () => {
  it('says why it cannot be calculated while the first half is not paid', async () => {
    serve({
      ...secondHalf,
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'CALCULATED' },
    });
    const { container } = render();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('รอบครึ่งแรกเลขที่ PR-2026-11-H1-01 ตอนนี้สถานะ“คำนวณแล้ว”');
    expect(
      screen.getByRole('link', { name: 'เปิดรอบครึ่งแรกเลขที่ PR-2026-11-H1-01' }),
    ).toHaveAttribute('href', '/payroll/runs/run-h1');
    const calculate = screen.getByRole('button', { name: 'คำนวณเงินเดือน' });
    expect(calculate).toBeDisabled();
    expect(calculate).toHaveAccessibleDescription(
      expect.stringContaining('ต้องจ่ายครึ่งแรกก่อนจึงจะคำนวณครึ่งนี้ได้'),
    );
    expect(screen.getByText(/16–30 พฤศจิกายน 2569/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says the first half has no run yet', async () => {
    serve({ ...secondHalf, firstHalf: null });
    render();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'แต่ครึ่งแรกยังไม่มีรอบคำนวณ ให้สร้างรอบครึ่งแรก คำนวณ อนุมัติ และจ่ายก่อน',
    );
  });

  it('lets the run be calculated once the first half is paid', async () => {
    serve({
      ...secondHalf,
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
    });
    render();
    expect(await screen.findByRole('button', { name: 'คำนวณเงินเดือน' })).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Payslip warnings on the run page (CW-069)', () => {
  it('lists each warning in Thai, with Thai dates, before approval', async () => {
    serve({
      ...secondHalf,
      status: 'CALCULATED',
      calculatedAt: '2026-11-30T03:00:00.000Z',
      employeeCount: 1,
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
      payslips: [
        {
          ...slip,
          warnings: [
            {
              code: 'NO_ATTENDANCE_RECORD',
              params: { days: 2, dates: '2026-11-17, 2026-11-18' },
            },
            { code: 'SSO_OVER_IN_FIRST_HALF', params: { amount: 12.5 } },
            { code: 'REST_DAY_WORK_RATE', params: { hours: 8, rates: 'DAY_OFF 1x' } },
            { code: 'ADVANCE_CARRIED_OVER', params: { amount: 1620 } },
            { code: 'SOMETHING_NEW' },
          ],
        },
        { ...slip, id: 'ps-2', warnings: [] },
      ],
    });
    const { container } = render();

    expect(await screen.findByRole('heading', { name: 'ตรวจก่อนอนุมัติ (1)' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'ไม่จ่าย 2 วันทำงานที่ไม่มีบันทึกเวลาและไม่มีการลา: 17 พ.ย. 2569, 18 พ.ย. 2569',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('ครึ่งแรกหักประกันสังคมเกินยอดทั้งเดือนไป ฿12.50 ระบบไม่คืนให้อัตโนมัติ'),
    ).toBeInTheDocument();
    expect(screen.getByText(/ทำงานในวันหยุด \(8 ชม\. ที่ .* 1×\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/^เงินเบิก ฿1,620\.00 เกินกว่าที่งวดนี้หักได้ .*ตามมาตรา 76 /),
    ).toBeInTheDocument();
    // A code this screen does not know yet is still shown, not dropped.
    expect(screen.getByText('SOMETHING_NEW')).toBeInTheDocument();
    expect(screen.getByText('ตรวจ 5 เรื่อง')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
