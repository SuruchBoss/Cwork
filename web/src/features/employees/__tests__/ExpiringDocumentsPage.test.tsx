// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import type { ExpiringDocumentsReport } from '@/types/api';
import ExpiringDocumentsPage from '../ExpiringDocumentsPage';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const get = vi.mocked(api.get);

const report = (items: ExpiringDocumentsReport['items'], within = 90): ExpiringDocumentsReport => ({
  today: '2026-10-17',
  within,
  items,
});

const renderPage = () =>
  renderWithProviders(
    <MemoryRouter>
      <ExpiringDocumentsPage />
    </MemoryRouter>,
  );

beforeEach(() => useUiStore.setState({ language: 'th' }));
afterEach(() => vi.clearAllMocks());

describe('Documents expiring (CW-073)', () => {
  it('lists what has expired and what is about to, with names and dates and no number', async () => {
    get.mockResolvedValue(
      report([
        {
          employeeId: 'e-1',
          employeeCode: 'F001',
          name: 'Aung Kyaw',
          document: 'PASSPORT',
          expiresOn: '2026-10-12',
          daysLeft: -5,
          window: 0,
        },
        {
          employeeId: 'e-2',
          employeeCode: 'F002',
          name: 'Mya Mya',
          document: 'WORK_PERMIT',
          expiresOn: '2026-11-15',
          daysLeft: 29,
          window: 30,
        },
        {
          employeeId: 'e-3',
          employeeCode: 'F003',
          name: 'Zaw Zaw',
          document: 'WORK_PERMIT',
          expiresOn: '2026-12-20',
          daysLeft: 64,
          window: 90,
        },
      ]),
    );
    const { container } = renderPage();

    expect(await screen.findByRole('link', { name: 'Aung Kyaw' })).toHaveAttribute(
      'href',
      '/employees/e-1',
    );
    expect(screen.getByText('หมดอายุแล้ว')).toBeInTheDocument();
    expect(screen.getByText('เหลือ 29 วัน')).toBeInTheDocument();
    expect(screen.getByText('เหลือ 64 วัน')).toBeInTheDocument();
    expect(screen.getByText('พาสปอร์ต')).toBeInTheDocument();
    expect(screen.getAllByText('ใบอนุญาตทำงาน')).toHaveLength(2);
    await expectNoAxeViolations(container);
  });

  it('asks again for the window HR picks', async () => {
    get.mockResolvedValue(report([]));
    renderPage();
    expect(
      await screen.findByText('ไม่มีเอกสารที่หมดอายุแล้วหรือจะหมดใน 90 วันข้างหน้า'),
    ).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('ดูล่วงหน้า'), '30');
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/employees/expiring-documents', { query: { within: 30 } }),
    );
  });
});
