// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, saveBlob } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import PayrollPage from '../PayrollPage';
import PeriodCheckPage from '../PeriodCheckPage';
import type { ParallelRunReport, PeriodComparison } from '../period-check-types';

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

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const download = vi.mocked(api.download);

const periods = [
  {
    id: 'p-sep',
    code: '2026-09',
    year: 2026,
    month: 9,
    payFrequency: 'MONTHLY',
    half: 0,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    payDate: '2026-09-30',
    status: 'LOCKED',
    _count: { runs: 1 },
  },
  {
    id: 'p-aug',
    code: '2026-08',
    year: 2026,
    month: 8,
    payFrequency: 'MONTHLY',
    half: 0,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    payDate: '2026-08-31',
    status: 'CLOSED',
    _count: { runs: 1 },
  },
];

const comparison: PeriodComparison = {
  period: { code: '2026-09', year: 2026, month: 9 },
  tax: { cwork: '1250.00', filed: '1250.01', difference: '0.01', matches: false },
  sso: {
    cwork: '3000.00',
    filed: '3000.00',
    difference: '0.00',
    matches: true,
    employee: '1500.00',
    employer: '1500.00',
  },
};

const figure = (cwork: string, theirs = cwork) => ({
  cwork,
  theirs,
  difference: (Number(theirs) - Number(cwork)).toFixed(2),
  differs: cwork !== theirs,
});

const report: ParallelRunReport = {
  fileName: 'hr.csv',
  period: { code: '2026-09', year: 2026, month: 9 },
  problems: [],
  people: [
    {
      row: 2,
      employeeCode: 'D001',
      name: 'สมชาย ใจดี',
      differs: false,
      figures: {
        gross: figure('30000.00'),
        tax: figure('1000.00'),
        sso: figure('750.00'),
        net: figure('27500.00'),
      },
    },
    {
      row: 3,
      employeeCode: 'D002',
      name: 'สมหญิง ขยัน',
      differs: true,
      figures: {
        gross: figure('20000.00'),
        tax: figure('250.00', '250.01'),
        sso: figure('750.00'),
        net: figure('18250.00'),
      },
    },
  ],
  onlyInFile: [{ row: 4, employeeCode: 'X999' }],
  onlyInCwork: [{ employeeCode: 'D003', name: 'มานะ อดทน' }],
  totals: { people: 2, differing: 1, onlyInFile: 1, onlyInCwork: 1 },
};

function renderCheck() {
  return renderWithProviders(
    <MemoryRouter>
      <PeriodCheckPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  get.mockImplementation((path: string) =>
    Promise.resolve(path === '/payroll/periods' ? periods : []),
  );
});

afterEach(() => vi.clearAllMocks());

describe('Checking a period against what was filed (CW-089)', () => {
  it('sends the totals as typed from e-Filing, commas and all, and shows a satang as different', async () => {
    post.mockResolvedValueOnce(comparison);
    const { container } = renderCheck();
    const user = userEvent.setup();

    await screen.findByRole('option', { name: /กันยายน/ });
    await user.type(screen.getByLabelText('ภาษีหัก ณ ที่จ่ายที่ยื่น (บาท)'), '1,250.01');
    await user.type(screen.getByLabelText('ประกันสังคมที่ยื่น (บาท)'), '3000');
    await user.click(screen.getByRole('button', { name: 'เทียบ' }));

    expect(post).toHaveBeenCalledWith('/payroll/periods/p-sep/compare', {
      taxFiled: '1250.01',
      ssoFiled: '3000',
    });
    const table = await screen.findByRole('table');
    const tax = within(table).getByRole('row', { name: /ภาษีหัก ณ ที่จ่าย/ });
    expect(within(tax).getByText('ไม่ตรง')).toBeInTheDocument();
    expect(within(tax).getByText('+฿0.01')).toBeInTheDocument();
    const sso = within(table).getByRole('row', { name: /ประกันสังคม/ });
    expect(within(sso).getByText('ตรงกัน')).toBeInTheDocument();
    expect(within(sso).getByText(/ลูกจ้าง ฿1,500\.00 \+ นายจ้าง ฿1,500\.00/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('will not send an amount that is not an amount, or nothing at all', async () => {
    renderCheck();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: /กันยายน/ });

    expect(screen.getByRole('button', { name: 'เทียบ' })).toBeDisabled();
    await user.type(screen.getByLabelText('ภาษีหัก ณ ที่จ่ายที่ยื่น (บาท)'), '12.345');
    expect(screen.getByRole('button', { name: 'เทียบ' })).toBeDisabled();
    expect(screen.getByText('จำนวนเงินบาท ทศนิยมไม่เกิน 2 ตำแหน่ง')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('says why when the period cannot be compared', async () => {
    post.mockRejectedValueOnce(
      new ApiError(422, 'PAYROLL_NOT_RECONCILED', 'Run R-1 is CALCULATED, not APPROVED'),
    );
    renderCheck();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: /กันยายน/ });

    await user.type(screen.getByLabelText('ภาษีหัก ณ ที่จ่ายที่ยื่น (บาท)'), '1');
    await user.click(screen.getByRole('button', { name: 'เทียบ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('not APPROVED');
  });

  it('marks who differs from HR’s file, and which figure, leaving the rest quiet', async () => {
    post.mockResolvedValueOnce(report);
    const { container } = renderCheck();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: /กันยายน/ });

    await user.upload(
      screen.getByLabelText('เลือกไฟล์'),
      new File(['x'], 'hr.csv', { type: 'text/csv' }),
    );

    expect(post).toHaveBeenCalledWith('/payroll/periods/p-sep/parallel-run', expect.any(FormData));
    // Only the one who differs, with the difference to the satang on the one column.
    const rows = await screen.findAllByRole('row');
    const names = rows.map((row) => row.textContent ?? '');
    expect(names.some((text) => text.includes('สมหญิง ขยัน'))).toBe(true);
    expect(names.some((text) => text.includes('สมชาย ใจดี'))).toBe(false);
    expect(screen.getByText('+฿0.01')).toBeInTheDocument();
    expect(screen.getByText('Cwork ฿250.00 · ของคุณ ฿250.01')).toBeInTheDocument();
    // Whoever only one side has.
    expect(screen.getByText(/X999/)).toBeInTheDocument();
    expect(screen.getByText(/มานะ อดทน \(D003\)/)).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'แสดงทุกคน' }));
    expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument();
  });

  it('shows each problem with the file by row and column', async () => {
    post.mockResolvedValueOnce({
      ...report,
      people: [],
      onlyInFile: [],
      onlyInCwork: [],
      problems: [
        { row: 3, column: 'C', code: 'REQUIRED', message: 'This is required' },
        { row: 0, code: 'NO_ROWS', message: 'x' },
      ],
    });
    renderCheck();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: /กันยายน/ });

    await user.upload(
      screen.getByLabelText('เลือกไฟล์'),
      new File(['x'], 'hr.csv', { type: 'text/csv' }),
    );

    expect(await screen.findByText('ต้องกรอก')).toBeInTheDocument();
    expect(screen.queryByText('คนที่เทียบได้')).not.toBeInTheDocument();
  });
});

describe('The accountant’s file on the payroll page (CW-089)', () => {
  it('downloads the accountant’s format, and the plain one as before', async () => {
    useAuthStore.setState({ can: (...wanted: string[]) => wanted.includes(P.PAYROLL_EXPORT) });
    download.mockResolvedValue({ blob: new Blob(['x']), filename: 'payroll-2026-09.csv' });
    renderWithProviders(
      <MemoryRouter>
        <PayrollPage />
      </MemoryRouter>,
    );
    const user = userEvent.setup();

    const accountant = await screen.findAllByRole('button', { name: 'ส่งออกสำหรับนักบัญชี' });
    await user.click(accountant[0]!);
    await waitFor(() =>
      expect(download).toHaveBeenLastCalledWith('/payroll/periods/p-sep/export', {
        query: { format: 'accountant' },
      }),
    );

    const plain = await screen.findAllByRole('button', { name: 'ส่งออก CSV' });
    await user.click(plain[0]!);
    await waitFor(() => expect(download).toHaveBeenLastCalledWith('/payroll/periods/p-sep/export'));
    expect(saveBlob).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'เทียบกับที่ยื่นไปแล้ว' })).toHaveAttribute(
      'href',
      '/payroll/compare',
    );
  });
});
