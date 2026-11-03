// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
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
    ownDay: null,
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

/** What the server says registering a waiting number for the days chosen would count (CW-115). */
function bindPreviewOf(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-03',
    to: '2026-09-04',
    days: 2,
    daysWithTimes: 2,
    daysAlsoScannedOnAnotherNumber: 0,
    ...over,
  };
}

function serve(
  items: ScannerDay[],
  unmapped: unknown[] = [],
  bindPreview: Record<string, unknown> = {},
) {
  get.mockImplementation((path: string, options?: { query?: Record<string, unknown> }) => {
    if (path === '/attendance/scanner/days') return Promise.resolve(page(items));
    if (path === '/attendance/scanner/unmapped') return Promise.resolve(unmapped);
    if (path === '/attendance/scanner/unmapped/bind-preview') {
      return Promise.resolve(
        bindPreviewOf({
          from: options?.query?.from,
          to: options?.query?.to,
          ...bindPreview,
        }),
      );
    }
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

  it('offers a lone morning time as the clock-in until HR says otherwise, and can leave the day out', async () => {
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

  it('offers a lone evening time as the clock-out, not as a clock-in', async () => {
    serve([day({ id: 'd-eve', times: ['17:32'], reason: 'ONE_TIME' })]);
    renderPage();
    await screen.findByRole('cell', { name: '17:32' });

    expect((screen.getByLabelText(/เวลาเข้างานของ 7/) as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText(/เวลาเลิกงานของ 7/) as HTMLSelectElement).value).toBe('17:32');
  });

  it('offers the first and last of several times as the clock-in and clock-out', async () => {
    serve([day({ id: 'd-three', times: ['08:00', '12:01', '17:30'], reason: 'MANY_TIMES' })]);
    renderPage();
    await screen.findByText('08:00 12:01 17:30');

    expect((screen.getByLabelText(/เวลาเข้างานของ 7/) as HTMLSelectElement).value).toBe('08:00');
    expect((screen.getByLabelText(/เวลาเลิกงานของ 7/) as HTMLSelectElement).value).toBe('17:30');
  });

  it('closes the buttons on the signed-in person’s own day while someone else may decide it, and says why', async () => {
    serve([
      day({ id: 'd-mine', times: ['08:15'], reason: 'ONE_TIME', ownDay: { canDecide: false } }),
    ]);
    renderPage();
    await screen.findByRole('cell', { name: '08:15' });

    expect(screen.getByRole('button', { name: 'ใช้เวลาเหล่านี้' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ไม่นับวันนี้' })).toBeDisabled();
    expect(screen.getByLabelText(/เวลาเข้างานของ 7/)).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(
      'ต้องให้ผู้มีสิทธิ์จัดการเวลาทำงานคนอื่นเป็นผู้ตัดสิน',
    );
  });

  it('lets the only person who may decide decide their own day, and says it will be noted', async () => {
    serve([
      day({ id: 'd-mine', times: ['08:15'], reason: 'ONE_TIME', ownDay: { canDecide: true } }),
    ]);
    renderPage();
    await screen.findByRole('cell', { name: '08:15' });

    expect(screen.getByRole('button', { name: 'ใช้เวลาเหล่านี้' })).toBeEnabled();
    expect(screen.getByRole('note')).toHaveTextContent('ไม่มีผู้อื่นที่ตัดสินแทนได้');
    expect(screen.getByRole('note')).toHaveTextContent('รอบเงินเดือน');

    await userEvent.click(screen.getByRole('button', { name: 'ไม่นับวันนี้' }));

    expect(post).toHaveBeenCalledWith('/attendance/scanner/days/d-mine/decision', {
      action: 'IGNORE',
    });
  });

  it('shows no note on someone else’s day', async () => {
    serve([one]);
    renderPage();
    await screen.findByRole('cell', { name: '08:15' });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
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
    // It asks how long the number is theirs, and does not save until it is answered.
    expect(screen.getByRole('button', { name: 'บันทึกเลขนี้' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('เลข 77 เป็นของคนนี้นานแค่ไหน'), 'ALWAYS');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกเลขนี้' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'บันทึกเลขนี้' }),
    );

    expect(post).toHaveBeenCalledWith('/attendance/scanner/unmapped/bind', {
      scannerNumber: '77',
      employeeId: 'e9',
      scope: 'ALWAYS',
    });
    expect(
      await screen.findByText('บันทึกเลข 77 แล้ว จับคู่ได้ 2 วัน เพิ่มรายการลงเวลา 4 รายการ'),
    ).toBeInTheDocument();
  });

  it('binds a number for only the days that wait, when HR says so, and names those days', async () => {
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
    const how = screen.getByLabelText('เลข 77 เป็นของคนนี้นานแค่ไหน');
    expect(within(how).getByRole('option', { name: /เฉพาะวันเหล่านี้ \(.*ถึง.*\)/ })).toBeTruthy();
    await userEvent.selectOptions(how, 'THESE_DAYS');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกเลขนี้' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'บันทึกเลขนี้' }),
    );

    expect(post).toHaveBeenCalledWith('/attendance/scanner/unmapped/bind', {
      scannerNumber: '77',
      employeeId: 'e9',
      scope: 'THESE_DAYS',
      from: '2026-09-03',
      to: '2026-09-04',
    });
  });

  it('binds only the first to the last day HR picks out of the waiting stretch, and warns when the person is already scanned on another number (CW-115)', async () => {
    serve(
      [],
      [
        {
          scannerNumber: '999',
          name: 'บัตรชั่วคราว',
          days: 15,
          daysWithTimes: 15,
          firstDay: '2026-10-01',
          lastDay: '2026-10-21',
        },
      ],
      { days: 9, daysAlsoScannedOnAnotherNumber: 4 },
    );
    post.mockResolvedValue({ daysMatched: 9, punchesAdded: 18 });
    renderPage();

    await userEvent.type(await screen.findByLabelText('ค้นหาพนักงานของเลข 999'), 'มานี');
    await userEvent.selectOptions(await screen.findByLabelText('พนักงานของเลข 999'), 'e9');
    await userEvent.selectOptions(
      screen.getByLabelText('เลข 999 เป็นของคนนี้นานแค่ไหน'),
      'THESE_DAYS',
    );

    // The whole waiting stretch is the start; the last day is narrowed.
    const last = screen.getByLabelText('วันสุดท้ายของเลข 999');
    await userEvent.clear(last);
    await userEvent.type(last, '11/10/2569');
    await userEvent.tab();

    expect(
      await screen.findByText(/จะนับ 9 วันที่รออยู่ ตั้งแต่ 1 ต\.ค\. 2569 ถึง 11 ต\.ค\. 2569/),
    ).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'พนักงานคนนี้มีสแกนจากเลขอื่นอยู่แล้ว 4 วันในช่วงนี้',
    );
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/attendance/scanner/unmapped/bind-preview', {
        query: {
          scannerNumber: '999',
          employeeId: 'e9',
          from: '2026-10-01',
          to: '2026-10-11',
        },
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'บันทึกเลขนี้' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'บันทึกเลขนี้' }),
    );
    expect(post).toHaveBeenCalledWith('/attendance/scanner/unmapped/bind', {
      scannerNumber: '999',
      employeeId: 'e9',
      scope: 'THESE_DAYS',
      from: '2026-10-01',
      to: '2026-10-11',
    });
  });

  it('asks first, saying how many days it counts, and registers nothing when the answer is no (CW-112)', async () => {
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
      { days: 2 },
    );
    post.mockResolvedValue({ daysMatched: 2, punchesAdded: 4 });
    renderPage();

    await userEvent.type(await screen.findByLabelText('ค้นหาพนักงานของเลข 77'), 'มานี');
    await userEvent.selectOptions(await screen.findByLabelText('พนักงานของเลข 77'), 'e9');
    await userEvent.selectOptions(
      screen.getByLabelText('เลข 77 เป็นของคนนี้นานแค่ไหน'),
      'THESE_DAYS',
    );
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกเลขนี้' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('บันทึกเลข 77 ให้ มานี มีตา?');
    expect(dialog).toHaveTextContent('จะนับ 2 วันที่รออยู่');
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  describe('how long a waiting number is theirs (CW-109)', () => {
    const waiting = (over: Record<string, unknown>) => ({
      scannerNumber: '77',
      name: 'ชั่วคราว หนึ่ง',
      days: 5,
      daysWithTimes: 5,
      firstDay: '2026-09-03',
      lastDay: '2026-09-12',
      ...over,
    });

    it('says the day "from now on" would start and how many waiting days it would count', async () => {
      serve([], [waiting({ foreverPossible: true, foreverFrom: '2026-09-08', foreverDays: 3 })]);
      renderPage();

      const how = await screen.findByLabelText('เลข 77 เป็นของคนนี้นานแค่ไหน');
      expect(
        within(how).getByRole('option', {
          name: /ตั้งแต่ 8 ก\.ย\. 2569 จนกว่าจะสิ้นสุด \(นับวันที่รออยู่ให้คนนี้ 3 วัน\)/,
        }),
      ).toBeEnabled();
    });

    it('says it counts from the beginning when the number has never been anyone’s', async () => {
      serve([], [waiting({ foreverPossible: true, foreverFrom: null, foreverDays: 5 })]);
      renderPage();

      const how = await screen.findByLabelText('เลข 77 เป็นของคนนี้นานแค่ไหน');
      expect(
        within(how).getByRole('option', {
          name: 'ตั้งแต่ต้นจนกว่าจะสิ้นสุด (นับวันที่รออยู่ให้คนนี้ 5 วัน)',
        }),
      ).toBeEnabled();
    });

    it('closes "from now on" while someone holds the number, and says why', async () => {
      serve([], [waiting({ foreverPossible: false, foreverFrom: null, foreverDays: 0 })]);
      renderPage();

      const how = await screen.findByLabelText('เลข 77 เป็นของคนนี้นานแค่ไหน');
      expect(
        within(how).getByRole('option', {
          name: 'ตั้งแต่นี้ไป: ทำไม่ได้ เพราะตอนนี้มีคนถือเลขนี้อยู่',
        }),
      ).toBeDisabled();
    });
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

    async function bindNumber(label: { find: string; pick: string; how: string; save: string }) {
      await userEvent.type(await screen.findByLabelText(label.find), 'มานี');
      await userEvent.selectOptions(await screen.findByLabelText(label.pick), 'e9');
      await userEvent.selectOptions(screen.getByLabelText(label.how), 'ALWAYS');
      await userEvent.click(screen.getByRole('button', { name: label.save }));
      await userEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: label.save }),
      );
    }
    const thai = {
      find: 'ค้นหาพนักงานของเลข 999',
      pick: 'พนักงานของเลข 999',
      how: 'เลข 999 เป็นของคนนี้นานแค่ไหน',
      save: 'บันทึกเลขนี้',
    };
    const english = {
      find: 'Find an employee for number 999',
      pick: 'Employee for number 999',
      how: 'How long number 999 is theirs',
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
