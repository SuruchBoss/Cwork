// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, saveBlob } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import EmployeeImportPage from '../EmployeeImportPage';
import type { EmployeeImportPreview } from '../EmployeeImportPage';

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

const file = () => new File(['รหัสพนักงาน,ชื่อ'], 'พนักงาน.csv', { type: 'text/csv' });

function render() {
  return renderWithProviders(
    <MemoryRouter>
      <EmployeeImportPage />
    </MemoryRouter>,
  );
}

async function choose() {
  await userEvent.upload(screen.getByLabelText('เลือกไฟล์'), file());
}

const clean: EmployeeImportPreview = {
  fileName: 'พนักงาน.csv',
  problems: [],
  employees: [
    {
      row: 2,
      employeeCode: 'E001',
      name: 'นาย สมชาย ใจดี',
      hireDate: '2024-01-15',
      onProbation: false,
      scannerId: '007',
      hasBankAccount: false,
    },
    {
      row: 3,
      employeeCode: 'E002',
      name: 'สมศรี มีสุข',
      hireDate: '2026-09-01',
      onProbation: true,
      scannerId: null,
      hasBankAccount: false,
    },
  ],
};

describe('Importing employees (CW-059)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ language: 'th' });
  });

  it('lists every problem by row and column, in Thai, and offers no import', async () => {
    post.mockResolvedValueOnce({
      fileName: 'พนักงาน.csv',
      employees: [],
      problems: [
        {
          row: 3,
          column: 'D',
          header: 'วันเริ่มงาน',
          code: 'INVALID_DATE',
          params: { value: '31/02/2567' },
          message: '"31/02/2567" is not a date this import can read',
        },
        {
          row: 4,
          column: 'K',
          header: 'แผนก',
          code: 'NOT_FOUND',
          params: { what: 'department', value: 'การตลาด' },
          message: 'No department "การตลาด"',
        },
        { row: 0, code: 'SOMETHING_NEW', message: 'A problem this console has no words for' },
      ],
    } satisfies EmployeeImportPreview);
    const { container } = render();

    await choose();

    const rows = await screen.findAllByRole('row');
    expect(
      rows.slice(1).map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ['3', 'D วันเริ่มงาน', '"31/02/2567" ไม่ใช่วันที่ที่ระบบอ่านได้'],
      ['4', 'K แผนก', 'ไม่พบแผนก "การตลาด"'],
      ['ทั้งไฟล์', '—', 'A problem this console has no words for'],
    ]);
    expect(screen.getByText(/ยังไม่มีการนำเข้าใด ๆ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^นำเข้าพนักงาน/ })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('checks the file first, then imports everyone in one step', async () => {
    post.mockResolvedValueOnce(clean).mockResolvedValueOnce({ created: 2 });
    render();

    await choose();
    expect(post).toHaveBeenLastCalledWith('/employees/import/preview', expect.any(FormData));
    expect(await screen.findByText('นาย สมชาย ใจดี')).toBeInTheDocument();
    expect(screen.getByText('ทดลองงาน')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'นำเข้าพนักงาน 2 คน' }));

    expect(post).toHaveBeenLastCalledWith('/employees/import', expect.any(FormData));
    const sent = post.mock.calls[1][1] as FormData;
    expect((sent.get('file') as File).name).toBe('พนักงาน.csv');
    expect(await screen.findByText('นำเข้าพนักงานแล้ว 2 คน')).toBeInTheDocument();
  });

  it('shows what is wrong now when the import is refused on its second check', async () => {
    post.mockResolvedValueOnce(clean).mockRejectedValueOnce(
      new ApiError(422, 'IMPORT_HAS_PROBLEMS', 'The file has 1 problem(s); nothing was imported', {
        problems: [
          {
            row: 2,
            column: 'A',
            header: 'รหัสพนักงาน',
            code: 'CODE_EXISTS',
            params: { value: 'E001' },
            message: 'Employee code E001 already exists',
          },
        ],
      }),
    );
    render();

    await choose();
    await userEvent.click(await screen.findByRole('button', { name: 'นำเข้าพนักงาน 2 คน' }));

    expect(await screen.findByText('มีรหัสพนักงาน E001 อยู่ในระบบแล้ว')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^นำเข้าพนักงาน/ })).not.toBeInTheDocument();
  });

  it('downloads the template in either language', async () => {
    const blob = new Blob(['x']);
    vi.mocked(api.download).mockResolvedValue({ blob, filename: 'cwork-employees.xlsx' });
    render();

    await userEvent.click(screen.getByRole('button', { name: 'แบบฟอร์มภาษาอังกฤษ' }));

    await waitFor(() =>
      expect(api.download).toHaveBeenCalledWith('/employees/import/template', {
        query: { lang: 'en' },
      }),
    );
    expect(saveBlob).toHaveBeenCalledWith(blob, 'cwork-employees.xlsx');
  });
});
