// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import type { EmployeeDetail } from '@/types/api';
import { ForeignWorkerDocuments } from '../ForeignWorkerDocuments';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), patch: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const patch = vi.mocked(api.patch);

const base = {
  id: 'emp-f1',
  employeeCode: 'F001',
  firstNameTh: 'Aung',
  lastNameTh: 'Kyaw',
  passportExpiresOn: '2020-06-30T00:00:00.000Z',
  workPermitExpiresOn: '2099-03-31T00:00:00.000Z',
} as unknown as EmployeeDetail;

/** As someone who may read sensitive identifiers receives the record. */
const readable = { ...base, passportNo: 'MB123456', workPermitNo: 'WP-0012345' } as EmployeeDetail;
/** As HR without that permission receives it: whether a number is on file, not the number. */
const masked = { ...base, passportNoRecorded: true, workPermitNoRecorded: true } as EmployeeDetail;

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  patch.mockResolvedValue({});
});

afterEach(() => vi.clearAllMocks());

describe("A foreign worker's passport and work permit (CW-068)", () => {
  it('shows the numbers and expiry dates, and marks a passport that has expired', async () => {
    const { container } = renderWithProviders(
      <ForeignWorkerDocuments person={readable} canEdit={false} />,
    );

    expect(screen.getByText('MB123456')).toBeInTheDocument();
    expect(screen.getByText('WP-0012345')).toBeInTheDocument();
    expect(screen.getByText('30 มิ.ย. 2563')).toBeInTheDocument();
    expect(screen.getByText('หมดอายุแล้ว')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'แก้ไข' })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it('sends only what changed when a permit is renewed', async () => {
    renderWithProviders(<ForeignWorkerDocuments person={readable} canEdit />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'แก้ไข' }));
    const permit = screen.getByLabelText('เลขใบอนุญาตทำงาน');
    await user.clear(permit);
    await user.type(permit, 'WP-0099999');
    await user.clear(screen.getByLabelText('วันหมดอายุใบอนุญาตทำงาน'));
    await user.type(screen.getByLabelText('วันหมดอายุใบอนุญาตทำงาน'), '2029-03-31');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/employees/emp-f1', {
        workPermitNo: 'WP-0099999',
        workPermitExpiresOn: '2029-03-31',
      }),
    );
  });

  it('lets HR who cannot read the numbers renew a date without clearing them', async () => {
    renderWithProviders(<ForeignWorkerDocuments person={masked} canEdit />);
    const user = userEvent.setup();

    expect(screen.getAllByText('บันทึกไว้แล้ว ไม่มีสิทธิ์ดู')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'แก้ไข' }));
    const passport = screen.getByLabelText('เลขพาสปอร์ต');
    expect(passport).toHaveValue('');
    expect(
      within(passport.closest('.field')!).getByText('มีเลขบันทึกไว้แล้ว เว้นว่างไว้ถ้าไม่เปลี่ยน'),
    ).toBeInTheDocument();
    await user.clear(screen.getByLabelText('วันหมดอายุพาสปอร์ต'));
    await user.type(screen.getByLabelText('วันหมดอายุพาสปอร์ต'), '2035-06-30');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/employees/emp-f1', { passportExpiresOn: '2035-06-30' }),
    );
  });

  it('offers to add them for someone who has none', () => {
    const none = {
      ...base,
      passportExpiresOn: null,
      workPermitExpiresOn: null,
      passportNoRecorded: false,
      workPermitNoRecorded: false,
    } as EmployeeDetail;
    renderWithProviders(<ForeignWorkerDocuments person={none} canEdit />);

    expect(screen.getByText('ยังไม่มีข้อมูล ใช้สำหรับแรงงานต่างด้าว')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เพิ่ม' })).toBeInTheDocument();
  });
});
