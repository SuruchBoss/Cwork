// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import ScannerImportPage from '../ScannerImportPage';
import type { ScannerPreview } from '../scanner-types';

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

const byStatus = {
  NO_PUNCH: 4,
  UNMAPPED: 2,
  COUNTED: 20,
  WAITING: 3,
  DECIDED_USE: 0,
  DECIDED_IGNORE: 0,
};

const preview: ScannerPreview = {
  fileName: 'Export.xls',
  problems: [],
  dateFrom: '2026-09-01',
  dateTo: '2026-09-30',
  lines: 29,
  days: { added: 29, changed: 0, unchanged: 0 },
  byStatus,
  punchesToAdd: 40,
  lockedDays: 0,
  unmapped: [
    {
      scannerNumber: '77',
      name: 'ชั่วคราว หนึ่ง',
      days: 2,
      daysWithTimes: 2,
      firstDay: '2026-09-03',
      lastDay: '2026-09-04',
    },
  ],
};

function renderPage() {
  return renderWithProviders(
    <MemoryRouter>
      <ScannerImportPage />
    </MemoryRouter>,
  );
}

async function choose(name = 'Export.xls') {
  await userEvent.upload(
    screen.getByLabelText('เลือกไฟล์'),
    new File(['x'], name, { type: 'application/octet-stream' }),
  );
}

describe('Importing the fingerprint scanner export (CW-061)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ language: 'th' });
    get.mockResolvedValue([]);
  });

  it('checks the file first, lists unregistered numbers apart, then imports', async () => {
    post.mockResolvedValueOnce(preview).mockResolvedValueOnce({
      importId: 'i1',
      fileName: 'Export.xls',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      lines: 29,
      days: { added: 29, changed: 0, unchanged: 0 },
      byStatus,
      punchesAdded: 40,
      lockedDays: 0,
      unmapped: preview.unmapped,
    });
    const { container } = renderPage();

    await choose();

    expect(post).toHaveBeenLastCalledWith('/attendance/scanner/preview', expect.any(FormData));
    // The unregistered number is information, not an error.
    const unmapped = await screen.findByRole('heading', { name: 'เลขสแกนที่ยังไม่มีเจ้าของ' });
    expect(unmapped).toBeInTheDocument();
    expect(screen.getByText('ชั่วคราว หนึ่ง')).toBeInTheDocument();
    expect(screen.getByText('รอ HR ตัดสิน')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByRole('button', { name: 'นำเข้าไฟล์นี้' }));

    expect(post).toHaveBeenLastCalledWith('/attendance/scanner/import', expect.any(FormData));
    expect(
      await screen.findByText('นำเข้า Export.xls แล้ว เพิ่มรายการลงเวลา 40 รายการ'),
    ).toBeInTheDocument();
    expect(screen.getByText('3 วันรอ HR ตัดสิน และยังไม่นับจนกว่าจะตัดสิน')).toBeInTheDocument();
  });

  it('shows each problem by line and offers no import button', async () => {
    post.mockResolvedValueOnce({
      ...preview,
      problems: [
        { row: 3, column: 'D', code: 'INVALID_TIME', params: { value: '25:61' }, message: 'x' },
        { row: 4, code: 'WRONG_FIELD_COUNT', params: { found: 3 }, message: 'y' },
      ],
      dateFrom: null,
      dateTo: null,
    });
    const { container } = renderPage();

    await choose();

    expect(
      await screen.findByText('"25:61" ไม่ใช่เวลาแบบ ชั่วโมง:นาที (HH:mm)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/แต่ละบรรทัดของไฟล์จากเครื่องสแกนมีสี่ช่อง.*บรรทัดนี้มี 3 ช่อง/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'นำเข้าไฟล์นี้' })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says so when nothing in the file is new', async () => {
    post.mockResolvedValueOnce({
      ...preview,
      days: { added: 0, changed: 0, unchanged: 29 },
      punchesToAdd: 0,
      unmapped: [],
    });
    renderPage();

    await choose();

    expect(
      await screen.findByText('ไม่มีอะไรใหม่ในไฟล์นี้ ทุกวันอยู่ใน Cwork แล้ว'),
    ).toBeInTheDocument();
  });

  it('tells HR how many days sit in a month payroll has already used', async () => {
    post.mockResolvedValueOnce({ ...preview, lockedDays: 2 });
    renderPage();

    await choose();

    expect(
      await screen.findByText('2 วันอยู่ในเดือนที่เงินเดือนใช้ไปแล้ว จะไม่ถูกแก้'),
    ).toBeInTheDocument();
  });

  it('shows the files imported before', async () => {
    get.mockResolvedValue([
      {
        id: 'i0',
        fileName: 'Export-ส.ค..xls',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        lines: 30,
        daysAdded: 30,
        daysChanged: 0,
        punchesAdded: 55,
        importedAt: '2026-09-02T03:00:00.000Z',
      },
    ]);
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Export-ส.ค..xls')).toBeInTheDocument();
    expect(within(table).getByText('55')).toBeInTheDocument();
  });

  it('shows the API’s reason when the file cannot be checked', async () => {
    post.mockRejectedValueOnce(new ApiError(413, 'FILE_TOO_LARGE', 'ไฟล์ใหญ่เกินไป'));
    renderPage();

    await choose();

    expect(await screen.findByRole('alert')).toHaveTextContent('ไฟล์ใหญ่เกินไป');
  });
});
