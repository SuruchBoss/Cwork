// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import type { AccountRoles, GrantableRole } from '@/types/api';
import { AccountRolesCard } from '../AccountRolesCard';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const del = vi.mocked(api.delete);

const role = (key: string, extra: Partial<GrantableRole> = {}): GrantableRole => ({
  key,
  name: key,
  description: null,
  requiresSecondFactor: false,
  departmentScopeApplies: false,
  unlimitedByDepartment: [],
  grantable: true,
  ...extra,
});

const roles: AccountRoles = {
  account: { id: 'u-1', email: 'wipa@example.com', status: 'ACTIVE', mfaEnabled: false },
  isSelf: false,
  grants: [
    {
      id: 'g-1',
      roleKey: 'EMPLOYEE',
      roleName: 'พนักงาน',
      department: null,
      grantedAt: '2026-10-01T00:00:00.000Z',
      expiresOn: null,
      expired: false,
    },
    {
      id: 'g-2',
      roleKey: 'HR_OFFICER',
      roleName: 'เจ้าหน้าที่ฝ่ายบุคคล',
      department: { id: 'd-1', name: 'คลังสินค้า', code: 'WH' },
      grantedAt: '2026-10-01T00:00:00.000Z',
      expiresOn: '2026-12-31',
      expired: false,
    },
  ],
  roles: [
    role('SUPER_ADMIN', { requiresSecondFactor: true, grantable: false }),
    role('HR_OFFICER', { departmentScopeApplies: true }),
    role('PAYROLL_OFFICER', {
      requiresSecondFactor: true,
      departmentScopeApplies: true,
      unlimitedByDepartment: ['PAY'],
    }),
    role('MANAGER'),
    role('EMPLOYEE'),
  ],
};

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
});

afterEach(() => vi.clearAllMocks());

describe('Account roles on the employee page (CW-079)', () => {
  it('lists the roles with their department and last day, in Thai', async () => {
    get.mockResolvedValue(roles);
    const { container } = renderWithProviders(<AccountRolesCard employeeId="emp-1" />);

    const officer = (await screen.findByText('เจ้าหน้าที่ฝ่ายบุคคล')).closest('li')!;
    expect(within(officer).getByText('เฉพาะ คลังสินค้า')).toBeInTheDocument();
    expect(within(officer).getByText('ถึง 31 ธ.ค. 2569')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'ถอนบทบาท' })).toHaveLength(2);
    expect(get).toHaveBeenCalledWith('/employees/emp-1/roles');
    await expectNoAxeViolations(container);
  });

  it('gives payroll officer, warning that it needs two-factor sign-in, and offers only roles the caller holds', async () => {
    get.mockImplementation((path: string) =>
      Promise.resolve(path === '/departments' ? [{ id: 'd-2', name: 'บัญชี' }] : roles),
    );
    post.mockResolvedValue({ signedOut: true, secondFactorRequired: true });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AccountRolesCard employeeId="emp-1" />);

    await user.click(await screen.findByRole('button', { name: 'ให้บทบาท' }));
    const select = screen.getByLabelText('บทบาท');
    expect(within(select).queryByRole('option', { name: 'ผู้ดูแลระบบ' })).toBeNull();
    await user.selectOptions(select, 'PAYROLL_OFFICER');
    expect(screen.getByRole('status')).toHaveTextContent('ต้องยืนยันตัวตนสองชั้น');
    // Not limited to a department, so nothing to warn about yet.
    expect(screen.queryByText(/การจำกัดแผนกกรองเฉพาะ/)).toBeNull();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'ให้บทบาท' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/employees/emp-1/roles', { roleKey: 'PAYROLL_OFFICER' }),
    );
    expect(await screen.findByText(/ให้บทบาทเจ้าหน้าที่เงินเดือนแล้ว/)).toHaveTextContent(
      'ระบบออกจากระบบให้เขาทุกเครื่องแล้ว เขาจะต้องตั้งค่ายืนยันตัวตนสองชั้นเมื่อเข้าสู่ระบบครั้งถัดไป',
    );
  });

  it('limits a role to a department only where the limit applies', async () => {
    get.mockImplementation((path: string) =>
      Promise.resolve(path === '/departments' ? [{ id: 'd-2', name: 'บัญชี' }] : roles),
    );
    post.mockResolvedValue({ signedOut: true, secondFactorRequired: false });
    const user = userEvent.setup();
    renderWithProviders(<AccountRolesCard employeeId="emp-1" />);

    await user.click(await screen.findByRole('button', { name: 'ให้บทบาท' }));
    await user.selectOptions(screen.getByLabelText('บทบาท'), 'HR_OFFICER');
    await user.selectOptions(await screen.findByLabelText('แผนก'), 'd-2');
    await user.click(screen.getByRole('button', { name: 'ให้บทบาท' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/employees/emp-1/roles', {
        roleKey: 'HR_OFFICER',
        departmentId: 'd-2',
      }),
    );
  });

  it('removes a role after asking, and says why a removal was refused', async () => {
    get.mockResolvedValue(roles);
    del.mockRejectedValueOnce(new ApiError(422, 'LAST_SUPER_ADMIN', 'last'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<AccountRolesCard employeeId="emp-1" />);

    const officer = (await screen.findByText('เจ้าหน้าที่ฝ่ายบุคคล')).closest('li')!;
    await user.click(within(officer).getByRole('button', { name: 'ถอนบทบาท' }));
    expect(confirm).toHaveBeenCalledWith(
      'ถอนบทบาทเจ้าหน้าที่ฝ่ายบุคคลออกจาก wipa@example.com ใช่ไหม ระบบจะออกจากระบบให้เขาทุกเครื่อง',
    );
    expect(del).toHaveBeenCalledWith('/employees/emp-1/roles/g-2');
    expect(await screen.findByRole('alert')).toHaveTextContent('นี่คือผู้ดูแลระบบคนสุดท้าย');
    confirm.mockRestore();
  });

  it('refreshes the signed-in user after changing their own roles', async () => {
    get.mockResolvedValue({ ...roles, isSelf: true });
    del.mockResolvedValue({ signedOut: false });
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ refreshUser });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<AccountRolesCard employeeId="emp-1" />);

    const officer = (await screen.findByText('เจ้าหน้าที่ฝ่ายบุคคล')).closest('li')!;
    await user.click(within(officer).getByRole('button', { name: 'ถอนบทบาท' }));
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    expect(await screen.findByRole('status')).toHaveTextContent('ถอนบทบาทเจ้าหน้าที่ฝ่ายบุคคลแล้ว');
  });

  it('says there is nothing to give a role to when the employee has no account', async () => {
    get.mockResolvedValue({ ...roles, account: null, grants: [] });
    renderWithProviders(<AccountRolesCard employeeId="emp-1" />);
    expect(await screen.findByText(/ยังไม่มีบัญชีผู้ใช้/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ให้บทบาท' })).toBeNull();
  });

  it('warns, before saving, that a payroll officer limited to a department still sees pay everywhere (CW-083)', async () => {
    get.mockImplementation((path: string) =>
      Promise.resolve(path === '/departments' ? [{ id: 'd-2', name: 'บัญชี' }] : roles),
    );
    post.mockResolvedValue({ signedOut: true, secondFactorRequired: true });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AccountRolesCard employeeId="emp-1" />);

    await user.click(await screen.findByRole('button', { name: 'ให้บทบาท' }));
    await user.selectOptions(screen.getByLabelText('บทบาท'), 'PAYROLL_OFFICER');
    // A limit not chosen yet, nothing is narrowed and nothing to say.
    expect(screen.queryByText(/การจำกัดแผนกกรองเฉพาะ/)).toBeNull();

    await user.selectOptions(await screen.findByLabelText('แผนก'), 'd-2');
    const note = (await screen.findByText(/การจำกัดแผนกกรองเฉพาะ/)).closest('div')!;
    expect(note).toHaveTextContent('เขายังเห็นของทุกแผนก');
    expect(within(note).getByText(/^เงินเดือน: รอบจ่ายเงินเดือน/)).toBeInTheDocument();
    expect(within(note).queryByText('ใบลาออก')).toBeNull();
    await expectNoAxeViolations(container);

    // It is a note, not a block: the limit can still be saved.
    await user.click(screen.getByRole('button', { name: 'ให้บทบาท' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/employees/emp-1/roles', {
        roleKey: 'PAYROLL_OFFICER',
        departmentId: 'd-2',
      }),
    );
  });

  it('says nothing about a department limit on a role the limit does not apply to', async () => {
    get.mockResolvedValue(roles);
    const user = userEvent.setup();
    renderWithProviders(<AccountRolesCard employeeId="emp-1" />);

    await user.click(await screen.findByRole('button', { name: 'ให้บทบาท' }));
    await user.selectOptions(screen.getByLabelText('บทบาท'), 'MANAGER');
    expect(screen.queryByLabelText('แผนก')).toBeNull();
    expect(screen.queryByText(/การจำกัดแผนกกรองเฉพาะ/)).toBeNull();
  });

  it('warns about every area a limited role leaves open, from the list the API gives', async () => {
    get.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/departments'
          ? [{ id: 'd-2', name: 'บัญชี' }]
          : {
              ...roles,
              roles: [
                role('AUDITOR', {
                  departmentScopeApplies: true,
                  unlimitedByDepartment: ['PAY', 'RESIGNATIONS', 'AUDIT_LOG'],
                }),
              ],
            },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AccountRolesCard employeeId="emp-1" />);

    await user.click(await screen.findByRole('button', { name: 'ให้บทบาท' }));
    await user.selectOptions(screen.getByLabelText('บทบาท'), 'AUDITOR');
    await user.selectOptions(await screen.findByLabelText('แผนก'), 'd-2');
    const note = (await screen.findByText(/การจำกัดแผนกกรองเฉพาะ/)).closest('div')!;
    expect(within(note).getAllByRole('listitem')).toHaveLength(3);
    expect(within(note).getByText('ใบลาออก')).toBeInTheDocument();
    expect(within(note).getByText('บันทึกการใช้งานระบบ (audit log)')).toBeInTheDocument();
  });
});
