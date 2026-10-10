// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { todayIso } from '@/lib/format';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import type { EmployeeCompensation } from '@/types/api';
import { CompensationCard } from '../CompensationCard';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const salary: EmployeeCompensation = {
  id: 'c-1',
  effectiveFrom: '2025-01-01T00:00:00.000Z',
  effectiveTo: null,
  baseSalary: '18000.0000',
  payFrequency: 'MONTHLY',
  dailyRate: null,
  isOvertimeEligible: false,
  isSsoEligible: true,
  pvdEmployeeRate: '3.00',
  pvdEmployerRate: '3.00',
  reason: null,
};

const daily: EmployeeCompensation = {
  ...salary,
  id: 'c-2',
  effectiveFrom: '2026-06-01T00:00:00.000Z',
  baseSalary: '0.0000',
  payFrequency: 'SEMI_MONTHLY',
  dailyRate: '400.0000',
};

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
});

afterEach(() => vi.clearAllMocks());

describe('Pay on the employee page (CW-069)', () => {
  it('shows a daily wage paid twice a month, with the salary before it, in Thai years', async () => {
    get.mockResolvedValue([daily, { ...salary, effectiveTo: '2026-05-31T00:00:00.000Z' }]);
    const { container } = renderWithProviders(
      <CompensationCard employeeId="emp-1" canManage={false} />,
    );

    expect(await screen.findByText('วันละ ฿400.00 จ่ายเดือนละ 2 ครั้ง')).toBeInTheDocument();
    expect(screen.getByText('1 มิ.ย. 2569')).toBeInTheDocument();
    expect(screen.getByText('เดือนละ ฿18,000.00')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/payroll/compensation/emp-1');
    expect(screen.queryByRole('button', { name: 'เปลี่ยนค่าจ้าง' })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it('changes a salary to a daily wage, keeping overtime, social security and provident fund', async () => {
    get.mockResolvedValue([salary]);
    post.mockResolvedValue({ ...daily, warnings: [] });
    renderWithProviders(<CompensationCard employeeId="emp-1" canManage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'เปลี่ยนค่าจ้าง' }));
    await user.selectOptions(screen.getByLabelText('จ่ายแบบ'), 'DAILY');
    await user.type(screen.getByLabelText('บาทต่อวัน'), '400');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/payroll/compensation', {
        employeeId: 'emp-1',
        effectiveFrom: todayIso(),
        baseSalary: 0,
        payFrequency: 'SEMI_MONTHLY',
        dailyRate: 400,
        isOvertimeEligible: false,
        isSsoEligible: true,
        pvdEmployeeRate: 3,
        pvdEmployerRate: 3,
      }),
    );
  });

  it('says in Thai when the rate is below the minimum wage at the work location', async () => {
    get.mockResolvedValue([]);
    post.mockResolvedValue({
      ...daily,
      warnings: [
        {
          code: 'BELOW_MINIMUM_WAGE',
          params: {
            dailyRate: 350,
            minimum: 400,
            location: 'สาขาบางนา',
            source: 'ประกาศฉบับที่ 14',
          },
        },
      ],
    });
    const { container } = renderWithProviders(<CompensationCard employeeId="emp-1" canManage />);
    const user = userEvent.setup();

    expect(
      await screen.findByText('ยังไม่ได้ตั้งค่าจ้าง การคำนวณเงินเดือนจะข้ามพนักงานที่ไม่มีค่าจ้าง'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ตั้งค่าจ้าง' }));
    await user.selectOptions(screen.getByLabelText('จ่ายแบบ'), 'DAILY');
    await user.type(screen.getByLabelText('บาทต่อวัน'), '350');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'ค่าจ้างวันละ ฿350.00 ต่ำกว่าค่าแรงขั้นต่ำ ฿400.00 ของ สาขาบางนา (ประกาศฉบับที่ 14)',
    );
    await expectNoAxeViolations(container);
  });

  it('refuses a bad amount before sending, and explains a date already taken', async () => {
    get.mockResolvedValue([salary]);
    post.mockRejectedValueOnce(new ApiError(422, 'COMPENSATION_ALREADY_EXISTS', 'exists'));
    renderWithProviders(<CompensationCard employeeId="emp-1" canManage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'เปลี่ยนค่าจ้าง' }));
    await user.type(screen.getByLabelText('บาทต่อเดือน'), '18000.555');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ใส่จำนวนเงินเป็นบาท ทศนิยมไม่เกิน 2 ตำแหน่ง',
    );
    expect(post).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('บาทต่อเดือน'));
    await user.type(screen.getByLabelText('บาทต่อเดือน'), '20,000');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'มีค่าจ้างที่เริ่มวันนั้นอยู่แล้ว เลือกวันอื่น',
    );
    expect(post).toHaveBeenCalledWith(
      '/payroll/compensation',
      expect.objectContaining({ baseSalary: 20000, payFrequency: 'MONTHLY' }),
    );
  });
});
