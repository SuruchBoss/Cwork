// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import OrganizationPage from '../OrganizationPage';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    configure: vi.fn(),
    onDemoReset: vi.fn(),
  },
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);

const sales = { id: 'd-1', code: 'SALES', name: 'ฝ่ายขาย', nameEn: null, parentId: null };

/** What a fresh install has: no departments, positions or work locations yet. */
function serve(data: { departments?: unknown[]; positions?: unknown[]; locations?: unknown[] }) {
  get.mockImplementation((path: string) => {
    switch (path) {
      case '/organization':
        return Promise.resolve({
          id: 'o',
          code: 'ACME',
          name: 'บริษัท ตัวอย่าง',
          legalName: null,
          taxId: null,
          timezone: 'Asia/Bangkok',
          currency: 'THB',
          defaultLocale: 'th',
        });
      case '/departments':
        return Promise.resolve(data.departments ?? []);
      case '/departments/tree':
        return Promise.resolve(
          (data.departments ?? []).map((d) => ({
            ...(d as object),
            employeeCount: 0,
            children: [],
          })),
        );
      case '/positions':
        return Promise.resolve(data.positions ?? []);
      case '/work-locations':
        return Promise.resolve(data.locations ?? []);
      default:
        return Promise.resolve([]);
    }
  });
}

const allow = (granted: boolean) =>
  useAuthStore.setState({
    can: (...permissions: string[]) => granted && permissions.includes(P.ORG_MANAGE),
  });

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  post.mockResolvedValue({});
  patch.mockResolvedValue({});
});

afterEach(() => vi.clearAllMocks());

describe('Organisation: adding the records an employee import names (CW-072)', () => {
  it('adds a department, a position and a work location on a fresh install', async () => {
    serve({});
    allow(true);
    renderWithProviders(<OrganizationPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /เพิ่มแผนก/ }));
    await user.type(screen.getByLabelText('รหัส'), 'sales');
    await user.type(screen.getByLabelText('ชื่อแผนก'), 'ฝ่ายขาย');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/departments', {
        code: 'SALES',
        name: 'ฝ่ายขาย',
        nameEn: undefined,
        parentId: undefined,
      }),
    );

    await user.click(await screen.findByRole('button', { name: /เพิ่มตำแหน่ง/ }));
    await user.type(screen.getByLabelText('รหัส'), 'CASHIER');
    await user.type(screen.getByLabelText('ชื่อตำแหน่ง'), 'แคชเชียร์');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/positions', {
        code: 'CASHIER',
        title: 'แคชเชียร์',
        titleEn: undefined,
        departmentId: undefined,
      }),
    );

    await user.click(await screen.findByRole('button', { name: /เพิ่มสถานที่ทำงาน/ }));
    await user.type(screen.getByLabelText('รหัส'), 'bkk-01');
    await user.type(screen.getByLabelText('ชื่อสถานที่ทำงาน'), 'สาขาบางนา');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/work-locations', { code: 'BKK-01', name: 'สาขาบางนา' }),
    );
  });

  it('renames a department without offering to change its code', async () => {
    serve({ departments: [sales] });
    allow(true);
    renderWithProviders(<OrganizationPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'แก้ชื่อ ฝ่ายขาย' }));
    const positionLoads = () => get.mock.calls.filter(([path]) => path === '/positions').length;
    const before = positionLoads();
    const form = screen.getByRole('heading', { name: 'แก้ชื่อแผนก' }).closest('section')!;
    expect(within(form).getByLabelText('รหัส')).toHaveAttribute('readonly');
    const name = within(form).getByLabelText('ชื่อแผนก');
    await user.clear(name);
    await user.type(name, 'ฝ่ายขายและการตลาด');
    await user.click(within(form).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/departments/d-1', {
        name: 'ฝ่ายขายและการตลาด',
        nameEn: undefined,
        parentId: null,
      }),
    );
    // A position shows its department's name, so the positions are loaded again.
    await waitFor(() => expect(positionLoads()).toBeGreaterThan(before));
  });

  it('sets a work location minimum wage with its source, but never its code (CW-069)', async () => {
    serve({ locations: [{ id: 'l-1', code: 'HQ', name: 'สำนักงานใหญ่', isActive: true }] });
    allow(true);
    const { container } = renderWithProviders(<OrganizationPage />);
    const user = userEvent.setup();

    const row = (await screen.findByText('สำนักงานใหญ่')).closest('tr')!;
    expect(within(row).getByText('ยังไม่ได้ตั้งค่าแรงขั้นต่ำ')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'แก้ไข สำนักงานใหญ่' }));
    const form = screen.getByRole('heading', { name: 'แก้ไขสถานที่ทำงาน' }).closest('section')!;
    expect(within(form).getByLabelText('รหัส')).toHaveAttribute('readonly');

    // A rate without the announcement it comes from is refused before sending.
    await user.type(within(form).getByLabelText('ค่าแรงขั้นต่ำต่อวัน (บาท ไม่บังคับ)'), '400');
    await user.click(within(form).getByRole('button', { name: 'บันทึก' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'ระบุว่าค่าแรงขั้นต่ำนี้มาจากประกาศคณะกรรมการค่าจ้างฉบับไหน',
    );
    expect(patch).not.toHaveBeenCalled();

    await user.type(
      within(form).getByLabelText('ที่มาของอัตรา'),
      'ประกาศคณะกรรมการค่าจ้าง ฉบับที่ 14',
    );
    await user.click(within(form).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/work-locations/l-1', {
        name: 'สำนักงานใหญ่',
        minimumDailyWage: 400,
        minimumDailyWageSource: 'ประกาศคณะกรรมการค่าจ้าง ฉบับที่ 14',
      }),
    );
    await expectNoAxeViolations(container);
  });

  it('shows the minimum wage on the location row', async () => {
    serve({
      locations: [
        {
          id: 'l-1',
          code: 'HQ',
          name: 'สำนักงานใหญ่',
          isActive: true,
          minimumDailyWage: '400.0000',
          minimumDailyWageSource: 'ประกาศฉบับที่ 14',
        },
      ],
    });
    allow(false);
    renderWithProviders(<OrganizationPage />);
    const row = (await screen.findByText('สำนักงานใหญ่')).closest('tr')!;
    expect(row).toHaveTextContent('ค่าแรงขั้นต่ำวันละ ฿400.00 · ประกาศฉบับที่ 14');
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('refuses a name already taken, in Thai, before anything is sent', async () => {
    serve({ departments: [sales] });
    allow(true);
    renderWithProviders(<OrganizationPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /เพิ่มแผนก/ }));
    await user.type(screen.getByLabelText('รหัส'), 'SALES2');
    await user.type(screen.getByLabelText('ชื่อแผนก'), ' ฝ่ายขาย ');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ชื่อ "ฝ่ายขาย" มีอยู่แล้ว ใช้ชื่ออื่น',
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('says what to change when the API refuses a work-location code or a duplicate code', async () => {
    serve({});
    allow(true);
    renderWithProviders(<OrganizationPage />);
    const user = userEvent.setup();

    post.mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_FAILED', 'code must match', [
        'code must match ^[A-Z0-9][A-Z0-9-]{1,31}$ — uppercase letters, digits and hyphens, 2 to 32 characters',
      ]),
    );
    await user.click(await screen.findByRole('button', { name: /เพิ่มสถานที่ทำงาน/ }));
    await user.type(screen.getByLabelText('รหัส'), 'BKK_01');
    await user.type(screen.getByLabelText('ชื่อสถานที่ทำงาน'), 'สาขาบางนา');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ใช้ตัวอักษรภาษาอังกฤษพิมพ์ใหญ่ ตัวเลข และขีด (-)',
    );

    post.mockRejectedValueOnce(new ApiError(409, 'DUPLICATE_VALUE', 'exists'));
    const code = screen.getByLabelText('รหัส');
    await user.clear(code);
    await user.type(code, 'HQ');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('รหัส "HQ" มีอยู่แล้ว ใช้รหัสอื่น');
  });

  it('shows the lists but no add or rename controls without org:manage', async () => {
    serve({
      departments: [sales],
      positions: [
        {
          id: 'p-1',
          code: 'CASHIER',
          title: 'แคชเชียร์',
          titleEn: null,
          departmentId: null,
          department: null,
        },
      ],
      locations: [{ id: 'l-1', code: 'HQ', name: 'สำนักงานใหญ่', isActive: true }],
    });
    allow(false);
    const { container } = renderWithProviders(<OrganizationPage />);

    expect(await screen.findByText('แคชเชียร์')).toBeInTheDocument();
    expect(await screen.findByText('สำนักงานใหญ่')).toBeInTheDocument();
    expect(screen.getAllByText('ฝ่ายขาย').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /เพิ่ม|แก้ชื่อ/ })).toBeNull();
    // The holiday card's year is a Thai year too (CW-058).
    expect(
      screen.getByRole('heading', { name: `วันหยุดนักขัตฤกษ์ ${new Date().getFullYear() + 543}` }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
