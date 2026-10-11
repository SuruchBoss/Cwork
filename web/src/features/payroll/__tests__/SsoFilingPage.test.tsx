// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, saveBlob } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import type { SsoFilingSheet } from '@/types/api';
import SsoFilingPage from '../SsoFilingPage';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), download: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
  saveBlob: vi.fn(),
}));

const get = vi.mocked(api.get);

const sheet: SsoFilingSheet = {
  year: 2037,
  month: 11,
  ratePercent: '5',
  floor: 1650,
  ceiling: 23000,
  rows: [
    {
      sequence: 1,
      employeeId: 'e-1',
      employeeCode: 'D001',
      identifierKind: 'NATIONAL_ID',
      identifier: '1101700230673',
      name: 'สมชาย ใจดี',
      wage: '16800.00',
      contributoryWage: '16800.00',
      employee: '840.00',
      employer: '840.00',
      deductedEmployee: '840.00',
      deductedEmployer: '840.00',
      differsFromPayslips: false,
    },
    {
      sequence: 2,
      employeeId: 'e-2',
      employeeCode: 'D002',
      identifierKind: 'SOCIAL_SECURITY_CARD',
      identifier: '1234567890',
      name: 'Nguyen Van An',
      wage: '9450.00',
      contributoryWage: '9450.00',
      employee: '473.00',
      employer: '473.00',
      deductedEmployee: '472.50',
      deductedEmployer: '472.50',
      differsFromPayslips: true,
    },
  ],
  totals: {
    insured: 2,
    wage: '26250.00',
    employee: '1313.00',
    employer: '1313.00',
    total: '2626.00',
    deductedEmployee: '1312.50',
    deductedEmployer: '1312.50',
  },
  problems: [],
};

function render() {
  return renderWithProviders(
    <MemoryRouter>
      <SsoFilingPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
});
afterEach(() => vi.clearAllMocks());

describe('Social security filing page (CW-048)', () => {
  it('lists each insured person as the form does, with the totals', async () => {
    get.mockResolvedValue(sheet);
    const { container } = render();

    expect(await screen.findByText('1101700230673')).toBeInTheDocument();
    // A foreign worker's name as HR entered it, under the card number.
    expect(screen.getByText('Nguyen Van An')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
    expect(screen.getByText('รวม 2 คน')).toBeInTheDocument();
    expect(screen.getByText('฿2,626.00')).toBeInTheDocument();
    // Whoever the payslips deducted something different for is marked.
    expect(screen.getAllByText('ต่างจากแบบ')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'ดาวน์โหลด CSV' })).toBeEnabled();
    await expectNoAxeViolations(container);
  });

  it('asks for the month shown and downloads that month as the format chosen', async () => {
    get.mockResolvedValue(sheet);
    vi.mocked(api.download).mockResolvedValue({
      blob: new Blob(['x']),
      filename: 'sso-1-10-2037-11.xlsx',
    });
    const user = userEvent.setup();
    render();

    await user.selectOptions(await screen.findByLabelText('เดือน'), '11');
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        '/payroll/reports/sso-filing',
        expect.objectContaining({ query: expect.objectContaining({ month: '11' }) }),
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'ดาวน์โหลด Excel' }));
    await waitFor(() =>
      expect(api.download).toHaveBeenCalledWith('/payroll/reports/sso-filing', {
        query: expect.objectContaining({ month: '11', format: 'xlsx' }),
      }),
    );
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
  });

  it('names whoever cannot be put on the form and offers no download until they can', async () => {
    get.mockResolvedValue({
      ...sheet,
      problems: [
        {
          employeeId: 'e-3',
          employeeCode: 'D003',
          name: 'สมหญิง รักงาน',
          code: 'NO_NATIONAL_ID',
          message: 'No national ID number is recorded',
        },
      ],
    });
    render();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ใส่ลงแบบไม่ได้ 1 คน');
    expect(alert).toHaveTextContent('D003 สมหญิง รักงาน: ยังไม่มีเลขประจำตัวประชาชน');
    expect(screen.getByRole('button', { name: 'ดาวน์โหลด CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ดาวน์โหลด Excel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ดาวน์โหลด PDF' })).toBeDisabled();
  });

  it('says in words that a month is not finished, rather than showing an error page', async () => {
    get.mockRejectedValue(
      new ApiError(
        422,
        'SSO_MONTH_NOT_FINISHED',
        '2037-11 cannot be filed yet: no approved run for 2037-11-H2',
      ),
    );
    render();

    expect(await screen.findByText('เดือนนี้ยังไม่ครบ')).toBeInTheDocument();
    expect(screen.getByText(/2037-11-H2/)).toBeInTheDocument();
  });

  it('says a month with no pay period has no payroll', async () => {
    get.mockRejectedValue(new ApiError(422, 'NO_PAYROLL_FOR_MONTH', 'There is no payroll period'));
    render();
    expect(await screen.findByText('เดือนนี้ไม่มีเงินเดือน')).toBeInTheDocument();
  });
});
