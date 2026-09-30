// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import LeaveImportPage, { type LeaveImportPreview } from '../LeaveImportPage';

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

const preview: LeaveImportPreview = {
  fileName: 'วันลา.xlsx',
  year: 2026,
  leaveTypes: [
    { id: 'lt-annual', code: 'ANNUAL', name: 'ลาพักร้อน' },
    { id: 'lt-sick', code: 'SICK', name: 'ลาป่วย' },
    { id: 'lt-ordain', code: 'ORDINATION', name: 'ลาบวช' },
  ],
  rows: [
    {
      row: 2,
      employeeId: 'emp-7',
      employeeCode: 'EMP-0007',
      name: 'อนุชา แก้วมณี',
      taken: [
        { leaveTypeId: 'lt-annual', days: 2.5, availableAfter: 5.5 },
        { leaveTypeId: 'lt-sick', days: 1, availableAfter: 29 },
      ],
    },
  ],
  problems: [],
};

describe('Importing leave taken before Cwork (CW-059)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ language: 'th' });
  });

  it('shows the days taken and what each person is left with, then imports', async () => {
    post.mockResolvedValueOnce(preview).mockResolvedValueOnce({ employees: 1, year: 2026 });
    const { container } = renderWithProviders(
      <MemoryRouter>
        <LeaveImportPage />
      </MemoryRouter>,
    );

    await userEvent.upload(
      screen.getByLabelText('เลือกไฟล์'),
      new File(['x'], 'วันลา.xlsx', { type: 'application/octet-stream' }),
    );

    expect(post).toHaveBeenLastCalledWith('/leave/balances/import/preview', expect.any(FormData));
    // Only the leave types the file touches get a column.
    expect(await screen.findByRole('columnheader', { name: 'ลาพักร้อน' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'ลาบวช' })).not.toBeInTheDocument();
    // Half days stay half days.
    expect(screen.getByText('ใช้ไป 2.5 วัน')).toBeInTheDocument();
    expect(screen.getByText('เหลือ 5.5 วัน')).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByRole('button', { name: 'นำเข้าวันลาของพนักงาน 1 คน' }));

    expect(post).toHaveBeenLastCalledWith('/leave/balances/import', expect.any(FormData));
    expect(
      await screen.findByText('นำเข้าวันลาที่ใช้ไปในปี 2026 ของพนักงาน 1 คนแล้ว'),
    ).toBeInTheDocument();
  });
});
