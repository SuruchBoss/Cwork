// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import ScannerReviewPage from '../ScannerReviewPage';
import type { ScannerDay, ScannerDaysPage } from '../scanner-types';

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

const emp = { id: 'e1', employeeCode: 'EMP-0001', name: 'สมชาย ใจดี' };

function day(partial: Partial<ScannerDay> & Pick<ScannerDay, 'id' | 'times'>): ScannerDay {
  return {
    scannerNumber: '7',
    name: 'สมชาย',
    workDate: '2026-09-08',
    status: 'WAITING',
    reason: 'MANY_TIMES',
    employee: emp,
    decision: null,
    decisionOutdated: false,
    punchesCounted: 0,
    locked: false,
    ...partial,
  };
}

const waiting = day({ id: 'd-many', times: ['08:00', '12:01', '17:30'] });
const one = day({
  id: 'd-one',
  workDate: '2026-09-09',
  times: ['08:15'],
  reason: 'ONE_TIME',
});
const locked = day({
  id: 'd-locked',
  workDate: '2026-09-10',
  times: ['08:00'],
  reason: 'ONE_TIME',
  locked: true,
});

const totals = {
  days: 30,
  waiting: 3,
  counted: 20,
  decidedUse: 1,
  decidedIgnore: 0,
  noPunch: 4,
  unmapped: 2,
  locked: 1,
};

function page(items: ScannerDay[]): ScannerDaysPage {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    items,
    total: items.length,
    page: 1,
    limit: 100,
    totals,
  };
}

function serve(items: ScannerDay[], unmapped: unknown[] = []) {
  get.mockImplementation((path: string) => {
    if (path === '/attendance/scanner/days') return Promise.resolve(page(items));
    if (path === '/attendance/scanner/unmapped') return Promise.resolve(unmapped);
    if (path === '/employees') {
      return Promise.resolve({
        data: [
          {
            id: 'e9',
            employeeCode: 'EMP-0009',
            firstNameTh: 'มานี',
            lastNameTh: 'มีตา',
          },
        ],
        meta: {},
      });
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderPage() {
  return renderWithProviders(
    <MemoryRouter>
      <ScannerReviewPage />
    </MemoryRouter>,
  );
}

describe('Reviewing the scanner’s days (CW-061)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ language: 'th' });
    post.mockResolvedValue({});
  });

  it('lists the waiting days with the totals, and asks for the waiting ones by default', async () => {
    serve([waiting, one]);
    const { container } = renderPage();

    expect(await screen.findByText('08:00 12:01 17:30')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      '/attendance/scanner/days',
      expect.objectContaining({ query: expect.objectContaining({ status: 'WAITING' }) }),
    );
    expect(screen.getByText('รอ HR: สแกนสามครั้งขึ้นไป')).toBeInTheDocument();
    expect(screen.getByText('รอ HR: สแกนครั้งเดียว')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('records the chosen clock-in and clock-out, taken from the times on the scanner', async () => {
    serve([waiting]);
    renderPage();
    await screen.findByText('08:00 12:01 17:30');

    // Three times: the first and last are offered as in and out.
    const clockIn = screen.getByLabelText(/เวลาเข้างานของ 7/);
    const clockOut = screen.getByLabelText(/เวลาเลิกงานของ 7/);
    expect((clockIn as HTMLSelectElement).value).toBe('08:00');
    expect((clockOut as HTMLSelectElement).value).toBe('17:30');

    await userEvent.selectOptions(clockOut, '12:01');
    await userEvent.click(screen.getByRole('button', { name: 'ใช้เวลาเหล่านี้' }));

    expect(post).toHaveBeenCalledWith('/attendance/scanner/days/d-many/decision', {
      action: 'USE',
      clockIn: '08:00',
      clockOut: '12:01',
    });
    // The row leaves the waiting list, so the page says what happened to it.
    expect(await screen.findByRole('status')).toHaveTextContent(
      'สมชาย ใจดี วันที่ 8 ก.ย. 2569: นับเวลา 08:00 ถึง 12:01 แล้ว',
    );
  });

  it('labels each time as an in or an out, so the lists read without their captions', async () => {
    serve([waiting]);
    renderPage();
    await screen.findByText('08:00 12:01 17:30');

    expect(screen.getByRole('option', { name: 'เข้า 12:01' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'ออก 17:30' })).toBeInTheDocument();
  });

  it('says when only one time was counted, not a dash', async () => {
    serve([one]);
    renderPage();
    await screen.findByRole('cell', { name: '08:15' });

    await userEvent.click(screen.getByRole('button', { name: 'ใช้เวลาเหล่านี้' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'สมชาย ใจดี วันที่ 9 ก.ย. 2569: นับเฉพาะเวลาเข้า 08:15 แล้ว',
    );
  });

  it('says a left-out day is not counted', async () => {
    serve([one]);
    renderPage();
    await screen.findByRole('cell', { name: '08:15' });

    await userEvent.click(screen.getByRole('button', { name: 'ไม่นับวันนี้' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'สมชาย ใจดี วันที่ 9 ก.ย. 2569: ไม่นับวันนี้แล้ว',
    );
  });

  it('keeps the days with no punch apart from the numbers nobody registered', async () => {
    serve([waiting]);
    renderPage();
    await screen.findByText('08:00 12:01 17:30');

    expect(screen.getByText('ยังไม่นับจนกว่าจะบอกว่าเป็นของใคร')).toBeInTheDocument();
    expect(screen.getByText(/มี 4 วันที่ไม่มีการสแกนเลย/)).toBeInTheDocument();
  });

  it('offers a single time only as a clock-in until HR says otherwise, and can leave the day out', async () => {
    serve([one]);
    renderPage();
    await screen.findByRole('cell', { name: '08:15' });

    expect((screen.getByLabelText(/เวลาเข้างานของ 7/) as HTMLSelectElement).value).toBe('08:15');
    expect((screen.getByLabelText(/เวลาเลิกงานของ 7/) as HTMLSelectElement).value).toBe('');

    await userEvent.click(screen.getByRole('button', { name: 'ไม่นับวันนี้' }));

    expect(post).toHaveBeenCalledWith('/attendance/scanner/days/d-one/decision', {
      action: 'IGNORE',
    });
  });

  it('will not send a clock-out that is not after the clock-in', async () => {
    serve([waiting]);
    renderPage();
    await screen.findByText('08:00 12:01 17:30');

    await userEvent.selectOptions(screen.getByLabelText(/เวลาเข้างานของ 7/), '17:30');
    await userEvent.selectOptions(screen.getByLabelText(/เวลาเลิกงานของ 7/), '08:00');

    expect(screen.getByRole('button', { name: 'ใช้เวลาเหล่านี้' })).toBeDisabled();
  });

  it('does not let HR change a day payroll has already used', async () => {
    serve([locked]);
    renderPage();
    await screen.findByText('08:00');

    expect(screen.getByText('เงินเดือนใช้วันนี้ไปแล้ว')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ใช้เวลาเหล่านี้' })).not.toBeInTheDocument();
  });

  it('says a waiting day of a paid month is not counted, and offers the locked days as their own list (#95)', async () => {
    serve([locked]);
    renderPage();
    await screen.findByText('08:00');

    expect(screen.getByText('ไม่นับ เพราะจ่ายเงินเดือนงวดนี้แล้ว')).toBeInTheDocument();
    expect(screen.queryByText('รอ HR: สแกนครั้งเดียว')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'แสดง' }), 'LOCKED');
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/attendance/scanner/days',
        expect.objectContaining({ query: expect.objectContaining({ status: 'LOCKED' }) }),
      ),
    );
  });

  it('warns when the scanner has more times than when HR decided', async () => {
    serve([
      day({
        id: 'd-old',
        times: ['08:00', '17:00', '17:05'],
        decisionOutdated: true,
      }),
    ]);
    renderPage();

    expect(
      await screen.findByText('ตอนนี้เครื่องสแกนมีเวลามากกว่าตอนที่ตัดสินไว้'),
    ).toBeInTheDocument();
  });

  it('registers an unregistered number on the employee HR picks', async () => {
    serve(
      [],
      [
        {
          scannerNumber: '77',
          name: 'ชั่วคราว หนึ่ง',
          days: 2,
          daysWithTimes: 2,
          firstDay: '2026-09-03',
          lastDay: '2026-09-04',
        },
      ],
    );
    post.mockResolvedValue({ daysMatched: 2, punchesAdded: 4 });
    renderPage();

    await userEvent.type(await screen.findByLabelText('ค้นหาพนักงานของเลข 77'), 'มานี');
    await userEvent.selectOptions(await screen.findByLabelText('พนักงานของเลข 77'), 'e9');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกเลขนี้' }));

    expect(post).toHaveBeenCalledWith('/attendance/scanner/unmapped/bind', {
      scannerNumber: '77',
      employeeId: 'e9',
    });
    expect(
      await screen.findByText('บันทึกเลข 77 แล้ว จับคู่ได้ 2 วัน เพิ่มรายการลงเวลา 4 รายการ'),
    ).toBeInTheDocument();
  });

  describe('a refusal from the server, in the language of the screen (CW-096)', () => {
    const unmapped = [
      {
        scannerNumber: '999',
        name: 'ชั่วคราว หนึ่ง',
        days: 1,
        daysWithTimes: 1,
        firstDay: '2026-09-03',
        lastDay: '2026-09-03',
      },
    ];
    const hasNumber = () =>
      new ApiError(
        422,
        'EMPLOYEE_HAS_SCANNER_NUMBER',
        'Employee EMP-0009 already has scanner number 999',
        { employeeCode: 'EMP-0009', scannerNumber: '999' },
      );

    async function bindNumber(label: { find: string; pick: string; save: string }) {
      await userEvent.type(await screen.findByLabelText(label.find), 'มานี');
      await userEvent.selectOptions(await screen.findByLabelText(label.pick), 'e9');
      await userEvent.click(screen.getByRole('button', { name: label.save }));
    }
    const thai = {
      find: 'ค้นหาพนักงานของเลข 999',
      pick: 'พนักงานของเลข 999',
      save: 'บันทึกเลขนี้',
    };
    const english = {
      find: 'Find an employee for number 999',
      pick: 'Employee for number 999',
      save: 'Register this number',
    };

    it('says in Thai that the employee already has a scanner number', async () => {
      serve([], unmapped);
      post.mockRejectedValue(hasNumber());
      renderPage();
      await bindNumber(thai);

      expect(
        await screen.findByText(
          'พนักงาน EMP-0009 มีเลขสแกน 999 อยู่แล้ว ถ้าจะเปลี่ยนเลข ให้แก้ที่หน้าพนักงาน',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/already has scanner number/)).toBeNull();
    });

    it('says in Thai that payroll has used the day', async () => {
      serve([waiting]);
      post.mockRejectedValue(
        new ApiError(
          422,
          'DAY_LOCKED',
          'A payroll run has already used this day, so it can no longer change',
        ),
      );
      renderPage();
      await screen.findByText('08:00 12:01 17:30');
      await userEvent.click(screen.getByRole('button', { name: 'ใช้เวลาเหล่านี้' }));

      expect(
        await screen.findByText('วันนี้ถูกใช้ในรอบเงินเดือนไปแล้ว จึงแก้ไม่ได้อีก'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/payroll run has already used/)).toBeNull();
    });

    it('says in Thai that the range is too long, in the list itself, with the limit (#119)', async () => {
      get.mockImplementation((path: string) => {
        if (path === '/attendance/scanner/days') {
          return Promise.reject(
            new ApiError(422, 'RANGE_NOT_SUPPORTED', 'Choose a range of 1 to 93 days', {
              from: '2026-01-01',
              to: '2026-12-31',
              max: 93,
            }),
          );
        }
        if (path === '/attendance/scanner/unmapped') return Promise.resolve([]);
        return Promise.reject(new Error(`unexpected ${path}`));
      });
      renderPage();

      expect(await screen.findByText('เลือกช่วงวันที่ตั้งแต่ 1 ถึง 93 วัน')).toBeInTheDocument();
      expect(screen.queryByText(/Choose a range/)).toBeNull();
    });

    it('keeps the English sentence on the English screen', async () => {
      useUiStore.setState({ language: 'en' });
      serve([], unmapped);
      post.mockRejectedValue(hasNumber());
      renderPage();
      await bindNumber(english);

      expect(
        await screen.findByText('Employee EMP-0009 already has scanner number 999'),
      ).toBeInTheDocument();
    });
  });

  it('says there is nothing to decide when nothing is waiting', async () => {
    serve([]);
    renderPage();

    expect(await screen.findByText('ไม่มีวันที่รอให้ตัดสิน')).toBeInTheDocument();
  });
});
