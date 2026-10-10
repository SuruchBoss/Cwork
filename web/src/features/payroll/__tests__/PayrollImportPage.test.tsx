// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, saveBlob } from '@/lib/api-client';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import PayrollImportPage, { type PayrollImportPreview } from '../PayrollImportPage';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    download: vi.fn(),
    configure: vi.fn(),
    onDemoReset: vi.fn(),
  },
  saveBlob: vi.fn(),
}));

const post = vi.mocked(api.post);

const preview: PayrollImportPreview = {
  fileName: 'ยอดยกมา.xlsx',
  year: 2026,
  throughMonth: 8,
  rows: [
    {
      row: 2,
      employeeId: 'emp-7',
      employeeCode: 'EMP-0007',
      name: 'อนุชา แก้วมณี',
      taxableIncome: 480_000,
      withholdingTax: 20_000.5,
      ssoEmployee: 6_000,
      replaces: true,
    },
    {
      row: 3,
      employeeId: 'emp-8',
      employeeCode: 'EMP-0008',
      name: 'สมศรี มีสุข',
      taxableIncome: 240_000,
      withholdingTax: 0,
      ssoEmployee: 6_000,
      replaces: false,
    },
  ],
  totals: { taxableIncome: 720_000, withholdingTax: 20_000.5, ssoEmployee: 12_000 },
  recalculate: [],
  problems: [],
};

function render() {
  return renderWithProviders(
    <MemoryRouter>
      <PayrollImportPage />
    </MemoryRouter>,
  );
}

const upload = () =>
  userEvent.upload(
    screen.getByLabelText('เลือกไฟล์'),
    new File(['x'], 'ยอดยกมา.xlsx', { type: 'application/octet-stream' }),
  );

describe('Importing pay before Cwork (CW-059)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 30 September 2026: last month is August.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 8, 30, 10) });
    useUiStore.setState({ language: 'th' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at last month, and sends the months with the file', async () => {
    post.mockResolvedValueOnce(preview);
    const { container } = render();

    expect(screen.getByLabelText('ถึงเดือน')).toHaveValue('8');
    expect(screen.getByLabelText('ปี')).toHaveValue('2026');
    // Only months that have started this year.
    expect(within(screen.getByLabelText('ถึงเดือน')).getAllByRole('option')).toHaveLength(9);

    await upload();

    expect(post).toHaveBeenLastCalledWith(
      '/payroll/opening-balances/import/preview',
      expect.any(FormData),
      { query: { year: 2026, month: 8 } },
    );
    expect(await screen.findByText('อนุชา แก้วมณี')).toBeInTheDocument();
    expect(screen.getByText('แทนตัวเลขเดิม')).toBeInTheDocument();
    const total = screen.getByRole('rowheader', { name: 'รวม' }).closest('tr')!;
    expect(within(total).getByText(/720,000\.00/)).toBeInTheDocument();
    expect(within(total).getByText(/20,000\.50/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('imports with the same months, and says from when Cwork pays', async () => {
    post.mockResolvedValueOnce(preview).mockResolvedValueOnce({
      employees: 2,
      year: 2026,
      throughMonth: 8,
      recalculate: [],
    });
    render();

    await upload();
    await userEvent.click(await screen.findByRole('button', { name: 'นำเข้ายอดของพนักงาน 2 คน' }));

    expect(post).toHaveBeenLastCalledWith(
      '/payroll/opening-balances/import',
      expect.any(FormData),
      { query: { year: 2026, month: 8 } },
    );
    expect(
      await screen.findByText('นำเข้ายอดช่วง มกราคม–สิงหาคม 2569 ของพนักงาน 2 คนแล้ว'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('เริ่มคำนวณเงินเดือนใน Cwork ตั้งแต่เดือนกันยายน 2569'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says which runs were calculated without the figures, before and after importing', async () => {
    const september = { runId: 'run-9', runNo: 'PAY-2026-00009', period: '2026-09' };
    post.mockResolvedValueOnce({ ...preview, recalculate: [september] }).mockResolvedValueOnce({
      employees: 2,
      year: 2026,
      throughMonth: 8,
      recalculate: [september],
    });
    const { container } = render();

    await upload();
    expect(await screen.findByRole('note')).toHaveTextContent(
      'ภาษีที่หักจึงต่ำเกินไป ให้คำนวณใหม่ก่อนอนุมัติ: PAY-2026-00009 (กันยายน 2569)',
    );
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByRole('button', { name: 'นำเข้ายอดของพนักงาน 2 คน' }));

    expect(await screen.findByRole('link', { name: 'PAY-2026-00009' })).toHaveAttribute(
      'href',
      '/payroll/runs/run-9',
    );
  });

  it('starts over when the months change, since the file was checked for others', async () => {
    post.mockResolvedValueOnce(preview);
    render();

    await upload();
    expect(await screen.findByText('อนุชา แก้วมณี')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('ถึงเดือน'), '7');

    expect(screen.queryByText('อนุชา แก้วมณี')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^นำเข้ายอด/ })).not.toBeInTheDocument();
  });

  it('offers all of last year, and the template for the months chosen', async () => {
    const blob = new Blob(['x']);
    vi.mocked(api.download).mockResolvedValue({ blob, filename: 'cwork-pay.xlsx' });
    render();

    await userEvent.selectOptions(screen.getByLabelText('ปี'), '2025');
    expect(within(screen.getByLabelText('ถึงเดือน')).getAllByRole('option')).toHaveLength(12);
    await userEvent.selectOptions(screen.getByLabelText('ถึงเดือน'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'แบบฟอร์มภาษาไทย' }));

    await waitFor(() =>
      expect(api.download).toHaveBeenCalledWith('/payroll/opening-balances/import/template', {
        query: { year: 2025, month: 12, lang: 'th' },
      }),
    );
    expect(saveBlob).toHaveBeenCalledWith(blob, 'cwork-pay.xlsx');
  });

  it('words the problems in Thai, amounts written as money', async () => {
    post.mockResolvedValueOnce({
      ...preview,
      rows: [],
      totals: { taxableIncome: 0, withholdingTax: 0, ssoEmployee: 0 },
      recalculate: [],
      problems: [
        {
          row: 3,
          column: 'E',
          header: 'ประกันสังคม (ส่วนลูกจ้าง)',
          code: 'SSO_OVER_LIMIT',
          params: { value: 12_000, max: 6_000, months: 8 },
          message: 'Social security for 8 months is at most 6000, not 12000',
        },
        {
          row: 4,
          column: 'A',
          header: 'รหัสพนักงาน',
          code: 'PAID_IN_CWORK',
          params: { employee: 'สมศรี มีสุข', period: '2026-08' },
          message: 'x',
        },
      ],
    } satisfies PayrollImportPreview);
    render();

    await upload();

    expect(
      await screen.findByText('ประกันสังคม 8 เดือนสูงสุดไม่เกิน 6,000.00 ไม่ใช่ 12,000.00'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'สมศรี มีสุข ได้รับเงินเดือนงวด สิงหาคม 2569 ใน Cwork แล้ว ตัวเลขในไฟล์ต้องเป็นของเดือนก่อนหน้านั้นเท่านั้น',
      ),
    ).toBeInTheDocument();
  });
});
