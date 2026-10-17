// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import EmployeeCreatePage from '../EmployeeCreatePage';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const screenUnderTest = () =>
  renderWithProviders(
    <MemoryRouter initialEntries={['/employees/new']}>
      <Routes>
        <Route path="/employees/new" element={<EmployeeCreatePage />} />
        <Route path="/employees/:id" element={<p>หน้าพนักงานคนใหม่</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  get.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/departments'
        ? [{ id: 'd-1', name: 'บัญชี' }]
        : path === '/positions'
          ? [{ id: 'p-1', title: 'เจ้าหน้าที่' }]
          : path === '/work-locations'
            ? [{ id: 'w-1', name: 'สำนักงานใหญ่' }]
            : { data: [] },
    ),
  );
  post.mockResolvedValue({ id: 'emp-new' });
});

afterEach(() => vi.clearAllMocks());

describe('Adding one employee from the console (CW-065)', () => {
  it('is an accessible form with every field the import has', async () => {
    const { container } = screenUnderTest();
    await screen.findByRole('option', { name: 'บัญชี' });

    for (const label of [
      'ชื่อ (ไทย)',
      'นามสกุล (ไทย)',
      'รหัสพนักงาน',
      'วันเริ่มงาน',
      'เลขบัตรประชาชน',
      'เลขในเครื่องสแกน',
      'เลขที่บัญชี',
      'เลขพาสปอร์ต',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    await expectNoAxeViolations(container);
  });

  it('sends what was typed, the national ID as digits, and goes to the new person', async () => {
    screenUnderTest();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'บัญชี' });

    await user.type(screen.getByLabelText('ชื่อ (ไทย)'), 'วิภา');
    await user.type(screen.getByLabelText('นามสกุล (ไทย)'), 'ใจดี');
    await user.type(screen.getByLabelText('วันเริ่มงาน'), '2026-10-01');
    await user.type(screen.getByLabelText('เลขบัตรประชาชน'), '1-1017-00230-67-3');
    await user.selectOptions(screen.getByLabelText('แผนก'), 'd-1');
    await user.type(screen.getByLabelText('เลขในเครื่องสแกน'), '007');
    await user.click(screen.getByRole('button', { name: 'เพิ่มพนักงาน' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/employees', {
        firstNameTh: 'วิภา',
        lastNameTh: 'ใจดี',
        hireDate: '2026-10-01',
        nationalId: '1101700230673',
        departmentId: 'd-1',
        scannerId: '007',
        employmentType: 'FULL_TIME',
      }),
    );
    expect(await screen.findByText('หน้าพนักงานคนใหม่')).toBeInTheDocument();
  });

  it('marks what is wrong and sends nothing', async () => {
    screenUnderTest();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'บัญชี' });

    await user.type(screen.getByLabelText('ชื่อ (ไทย)'), 'วิภา');
    await user.type(screen.getByLabelText('เลขบัตรประชาชน'), '12345');
    await user.click(screen.getByRole('button', { name: 'เพิ่มพนักงาน' }));

    expect(
      await screen.findByText('เลขบัตรประชาชนมี 13 หลัก ใส่ขีดหรือเว้นวรรคได้'),
    ).toBeInTheDocument();
    expect(screen.getByText('ต้องกรอก')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('มีบางช่องที่ต้องตรวจอีกครั้ง');
    expect(post).not.toHaveBeenCalled();
  });

  it('says so when the employee code is already used', async () => {
    post.mockRejectedValue(
      new ApiError(409, 'DUPLICATE_EMPLOYEE_CODE', 'Employee code E1 is taken'),
    );
    screenUnderTest();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'บัญชี' });

    await user.type(screen.getByLabelText('ชื่อ (ไทย)'), 'วิภา');
    await user.type(screen.getByLabelText('นามสกุล (ไทย)'), 'ใจดี');
    await user.type(screen.getByLabelText('วันเริ่มงาน'), '2026-10-01');
    await user.type(screen.getByLabelText('รหัสพนักงาน'), 'E1');
    await user.click(screen.getByRole('button', { name: 'เพิ่มพนักงาน' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('รหัสพนักงานนี้มีคนใช้แล้ว');
  });
});
