// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, saveBlob } from '@/lib/api-client';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import type { SsoShortfallReport } from '@/types/api';
import SsoShortfallPage from '../SsoShortfallPage';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    download: vi.fn(),
    configure: vi.fn(),
    onDemoReset: vi.fn(),
  },
  saveBlob: vi.fn(),
}));

const get = vi.mocked(api.get);

const report: SsoShortfallReport = {
  year: 2026,
  ceiling: 17500,
  payslipsChecked: 6,
  rows: [
    {
      employeeId: 'e-1',
      employeeCode: 'D001',
      name: 'สมชาย ใจดี',
      month: 3,
      wage: 30000,
      wageRebuilt: false,
      deductedEmployee: 750,
      deductedEmployer: 750,
      owed: 875,
      employeeDifference: 125,
      employerDifference: 125,
    },
    {
      employeeId: 'e-2',
      employeeCode: 'D002',
      name: 'สมหญิง รักงาน',
      month: 3,
      wage: 20000,
      wageRebuilt: true,
      deductedEmployee: 750,
      deductedEmployer: 750,
      owed: 875,
      employeeDifference: 125,
      employerDifference: 125,
    },
    {
      employeeId: 'e-1',
      employeeCode: 'D001',
      name: 'สมชาย ใจดี',
      month: 4,
      wage: 18000,
      wageRebuilt: false,
      deductedEmployee: 750,
      deductedEmployer: 750,
      owed: 875,
      employeeDifference: 125,
      employerDifference: 125,
    },
  ],
  byMonth: [
    { month: 3, employee: 250, employer: 250 },
    { month: 4, employee: 125, employer: 125 },
  ],
  total: { employee: 375, employer: 375 },
};

function render() {
  return renderWithProviders(
    <MemoryRouter>
      <SsoShortfallPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 10, 10) });
  useUiStore.setState({ language: 'th' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Social security shortfall (CW-075)', () => {
  it('lists what each person owes per month, with month and year totals, in Thai', async () => {
    get.mockResolvedValue(report);
    const { container } = render();

    const rows = (await screen.findAllByText('สมชาย ใจดี')).map((cell) => cell.closest('tr')!);
    expect(within(rows[0]).getByText('มีนาคม 2569')).toBeInTheDocument();
    expect(within(rows[0]).getByText('฿30,000.00')).toBeInTheDocument();
    expect(within(rows[0]).getAllByText('฿125.00')).toHaveLength(2);
    // Only the slip from before the wage was stored says it was worked out.
    const rebuilt = screen.getByText('สมหญิง รักงาน').closest('tr')!;
    expect(within(rebuilt).getByText('คำนวณจากรายการในสลิป')).toBeInTheDocument();
    expect(screen.getAllByText('คำนวณจากรายการในสลิป')).toHaveLength(1);

    const march = screen.getByRole('rowheader', { name: 'รวม มีนาคม 2569' }).closest('tr')!;
    expect(within(march).getAllByText('฿250.00')).toHaveLength(2);
    const year = screen.getByRole('rowheader', { name: 'รวมปี 2569' }).closest('tr')!;
    expect(within(year).getAllByText('฿375.00')).toHaveLength(2);

    expect(screen.getByText('เพดานปี 2569: ฿17,500.00 ต่อเดือน')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('ไม่ใช่แบบยื่น');
    expect(get).toHaveBeenCalledWith('/payroll/reports/sso-shortfall', {
      query: { year: '2026' },
    });
    await expectNoAxeViolations(container);
  });

  it('downloads the CSV in the language on screen', async () => {
    get.mockResolvedValue(report);
    const blob = new Blob(['x']);
    vi.mocked(api.download).mockResolvedValue({ blob, filename: 'sso-shortfall-2026.csv' });
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'ดาวน์โหลด CSV' }));
    await waitFor(() =>
      expect(api.download).toHaveBeenCalledWith('/payroll/reports/sso-shortfall', {
        query: { year: '2026', format: 'csv', lang: 'th' },
      }),
    );
    expect(saveBlob).toHaveBeenCalledWith(blob, 'sso-shortfall-2026.csv');
  });

  it('says there is no run to compare when nothing is locked or paid, and asks for an earlier year', async () => {
    get.mockImplementation((_path, options) =>
      Promise.resolve({
        ...report,
        year: Number((options as { query: { year: string } }).query.year),
        payslipsChecked: 0,
        rows: [],
        byMonth: [],
        total: { employee: 0, employer: 0 },
      }),
    );
    const user = userEvent.setup();
    const { container } = render();

    expect(await screen.findByText('ยังไม่มีรอบที่ล็อกหรือจ่ายแล้วในปี 2569')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ดาวน์โหลด CSV' })).toBeDisabled();
    await expectNoAxeViolations(container);

    await user.selectOptions(screen.getByLabelText('ปี'), '2025');
    expect(await screen.findByText('ยังไม่มีรอบที่ล็อกหรือจ่ายแล้วในปี 2568')).toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith('/payroll/reports/sso-shortfall', {
      query: { year: '2025' },
    });
  });

  it('says nothing is owed when every run deducted on the new ceiling', async () => {
    get.mockResolvedValue({
      ...report,
      rows: [],
      byMonth: [],
      total: { employee: 0, employer: 0 },
    });
    render();

    expect(await screen.findByText('ปี 2569 ไม่มีส่วนต่าง')).toBeInTheDocument();
  });
});
