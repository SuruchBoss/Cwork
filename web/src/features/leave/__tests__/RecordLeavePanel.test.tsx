// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import LeavePage from '../LeavePage';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    configure: vi.fn(),
    onDemoReset: vi.fn(),
  },
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const somchai = {
  id: 'emp-12',
  employeeCode: 'EMP-0012',
  firstNameTh: 'สมชาย',
  lastNameTh: 'ใจดี',
  nickname: 'ชาย',
  department: { id: 'd-1', name: 'ฝ่ายผลิต', code: 'PROD' },
};

const sick = {
  id: 'lt-sick',
  code: 'SICK',
  name: 'ลาป่วย',
  allowHalfDay: true,
  requiresAttachment: true,
  attachmentRequiredAfterDays: 3,
  minNoticeDays: 0,
  isPaid: true,
};
const ordination = {
  ...sick,
  id: 'lt-ordain',
  code: 'ORDINATION',
  name: 'ลาบวช',
  allowHalfDay: false,
  requiresAttachment: false,
};

const balances = [
  {
    leaveTypeId: 'lt-sick',
    code: 'SICK',
    name: 'ลาป่วย',
    granted: 30,
    carriedOver: 0,
    adjusted: 0,
    available: 27,
  },
  {
    leaveTypeId: 'lt-ordain',
    code: 'ORDINATION',
    name: 'ลาบวช',
    granted: 15,
    carriedOver: 0,
    adjusted: 0,
    available: 15,
  },
];

const recorded = {
  id: 'lr-1',
  requestNo: 'LV-2026-00010',
  startDate: '2026-10-14',
  endDate: '2026-10-14',
  totalDays: '1',
  status: 'APPROVED',
  createdViaAssistant: false,
  recordedBy: {
    id: 'u-hr',
    email: 'hr@pilot.example',
    employee: { firstNameTh: 'วราภรณ์', lastNameTh: 'สุขสวัสดิ์' },
  },
  leaveType: { id: 'lt-sick', code: 'SICK', name: 'ลาป่วย', colorHex: '#f00', isPaid: true },
  employee: { ...somchai },
};

function serve() {
  get.mockImplementation((path: string) => {
    if (path === '/leave/types') return Promise.resolve([sick, ordination]);
    if (path === '/leave/requests')
      return Promise.resolve({
        data: [recorded],
        meta: { total: 1, page: 1, totalPages: 1, hasNext: false },
      });
    if (path === '/leave/calendar') return Promise.resolve([]);
    if (path === '/employees') return Promise.resolve({ data: [somchai], meta: { total: 1 } });
    if (path === `/leave/balances/${somchai.id}`) return Promise.resolve(balances);
    return Promise.resolve([]);
  });
  post.mockImplementation((path: string, body?: unknown) => {
    if (path === '/leave/requests/record/preview') {
      const b = body as { startDate: string; startPortion: string };
      const value = b.startPortion === 'FULL' ? 1 : 0.5;
      return Promise.resolve({
        days: [{ date: b.startDate, portion: b.startPortion, dayValue: value }],
        totalDays: value,
        balanceBefore: 27,
        balanceAfter: 27 - value,
        warnings: [],
      });
    }
    return Promise.resolve(recorded);
  });
}

const allow = (granted: boolean) =>
  useAuthStore.setState({
    canAny: (...permissions: string[]) => granted && permissions.includes(P.LEAVE_RECORD),
  });

function renderPage() {
  return renderWithProviders(
    <MemoryRouter>
      <LeavePage />
    </MemoryRouter>,
  );
}

async function openAndChoose() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /บันทึกการลาให้พนักงาน/ }));
  const panel = screen.getByRole('complementary', { name: 'บันทึกการลาให้พนักงาน' });
  await user.type(within(panel).getByLabelText('พนักงาน'), 'ชาย');
  await user.click(await within(panel).findByRole('button', { name: /สมชาย ใจดี/ }));
  await user.selectOptions(await within(panel).findByLabelText('ประเภทการลา'), 'lt-sick');
  return { user, panel };
}

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  sessionStorage.clear();
  serve();
});

afterEach(() => vi.clearAllMocks());

describe('Recording leave for an employee (CW-067)', () => {
  it('records a sick day as approved and starts again at the employee', async () => {
    allow(true);
    const { container } = renderPage();
    const { user, panel } = await openAndChoose();

    // The employee is told apart by department, and the balance shows as soon as both are chosen.
    expect(within(panel).getByText('ฝ่ายผลิต', { exact: false })).toBeInTheDocument();
    expect(within(panel).getByText('คงเหลือ 27 จาก 30 วัน')).toBeInTheDocument();
    // The summary comes from the preview, before anything is saved.
    const summary = await within(panel).findByRole('region', { name: 'สรุปก่อนบันทึก' });
    expect(within(summary).getByText('1 วัน')).toBeInTheDocument();
    expect(within(summary).getByText('26 วัน')).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.type(
      within(panel).getByLabelText('หมายเหตุ (ไม่บังคับ)'),
      'โทรแจ้งป่วยเช้านี้{Enter}',
    );
    expect(post).not.toHaveBeenCalledWith('/leave/requests/record', expect.anything());

    await user.click(within(panel).getByRole('button', { name: 'บันทึก และบันทึกคนต่อไป' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/leave/requests/record',
        expect.objectContaining({
          employeeId: 'emp-12',
          leaveTypeId: 'lt-sick',
          startPortion: 'FULL',
          reason: 'โทรแจ้งป่วยเช้านี้',
          recordAsApproved: true,
        }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      /บันทึกลาป่วยของ สมชาย ใจดี .+ แล้ว/,
    );
    // The panel stays open for the next person: employee cleared, leave type kept.
    const search = within(panel).getByLabelText('พนักงาน');
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(within(panel).getByRole('radio', { name: /บันทึกเป็นอนุมัติแล้ว/ })).toBeChecked();

    // The same person and day again: refused, and the summary from before saving is gone.
    post.mockImplementation(() =>
      Promise.reject(
        new ApiError(422, 'OVERLAPPING_LEAVE', 'overlap', { from: '2026-10-14', to: '2026-10-14' }),
      ),
    );
    await user.type(search, 'ชาย');
    await user.click(await within(panel).findByRole('button', { name: /สมชาย ใจดี/ }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'มีการลาในบางวันของช่วงนี้อยู่แล้ว',
    );
    expect(within(panel).queryByRole('region', { name: 'สรุปก่อนบันทึก' })).toBeNull();
  });

  it('says why it was refused, with the employee named, above the buttons', async () => {
    allow(true);
    renderPage();
    const { user, panel } = await openAndChoose();
    post.mockImplementationOnce(() =>
      Promise.reject(
        new ApiError(422, 'INSUFFICIENT_LEAVE_BALANCE', 'Not enough', {
          available: 0.5,
          requested: 1,
        }),
      ),
    );
    await user.click(within(panel).getByRole('radio', { name: 'ส่งให้หัวหน้าอนุมัติ' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'สมชาย ใจดี มีลาป่วยเหลือ 0.5 วัน แต่รายการนี้ใช้ 1 วัน',
    );
  });

  it('names one day once, and clears a refusal when HR changes what was asked', async () => {
    allow(true);
    renderPage();
    const { user, panel } = await openAndChoose();
    await within(panel).findByRole('region', { name: 'สรุปก่อนบันทึก' });
    post.mockImplementationOnce(() =>
      Promise.reject(
        new ApiError(422, 'OVERLAPPING_LEAVE', 'overlap', { from: '2026-10-14', to: '2026-10-14' }),
      ),
    );
    await user.click(within(panel).getByRole('button', { name: /^บันทึก$/ }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'สมชาย ใจดี มีการลาในบางวันของช่วงนี้อยู่แล้ว (14 ต.ค. 2569)',
    );
    await user.click(within(panel).getByRole('radio', { name: 'ครึ่งเช้า' }));
    await waitFor(() => expect(within(panel).queryByRole('alert')).toBeNull());
  });

  it('tells HR to record a past day as approved rather than send it to the manager', async () => {
    allow(true);
    renderPage();
    const { user, panel } = await openAndChoose();
    post.mockImplementation((path: string) =>
      path === '/leave/requests/record/preview'
        ? Promise.reject(
            new ApiError(422, 'LEAVE_NOTICE_TOO_SHORT', 'notice', {
              noticeDays: -1,
              requiredDays: 0,
            }),
          )
        : Promise.resolve(recorded),
    );
    await user.click(within(panel).getByRole('radio', { name: 'ส่งให้หัวหน้าอนุมัติ' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'วันที่ผ่านไปแล้วส่งให้หัวหน้าอนุมัติไม่ได้ ถ้าหัวหน้าอนุมัติแล้ว ให้เลือก "บันทึกเป็นอนุมัติแล้ว"',
    );
  });

  it('offers half days only for one day of a type that allows them', async () => {
    allow(true);
    renderPage();
    const { user, panel } = await openAndChoose();

    expect(within(panel).getByRole('radio', { name: 'ครึ่งเช้า' })).toBeInTheDocument();
    await user.selectOptions(within(panel).getByLabelText('ประเภทการลา'), 'lt-ordain');
    expect(within(panel).queryByRole('radio', { name: 'ครึ่งเช้า' })).toBeNull();
  });

  it('shows who entered a leave in the list', async () => {
    allow(false);
    renderPage();

    expect(await screen.findByText('บันทึกโดย วราภรณ์ สุขสวัสดิ์')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /บันทึกการลาให้พนักงาน/ })).toBeNull();
  });
});
