// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import { HolidaysCard, type Holiday } from '../HolidaysCard';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), patch: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const get = vi.mocked(api.get);
const patch = vi.mocked(api.patch);

const holiday = (
  id: string,
  date: string,
  name: string,
  extra: Partial<Holiday> = {},
): Holiday => ({
  id,
  date,
  name,
  nameEn: null,
  workLocationId: null,
  substituteForId: null,
  substituteFor: null,
  substituteOnWeekdays: null,
  ...extra,
});

// Father's Day 2026 is a Saturday.
const fathersDay = holiday('h-5', '2026-12-05', 'วันพ่อแห่งชาติ', {
  substituteOnWeekdays: '2026-12-07',
});
const monday = holiday('h-7', '2026-12-07', 'ชดเชยวันพ่อ');
const constitution = holiday('h-10', '2026-12-10', 'วันรัฐธรรมนูญ');

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
});

afterEach(() => vi.clearAllMocks());

describe('Public holidays and their substitute days (CW-081)', () => {
  it('says where a weekend holiday is taken when no substitute is entered', async () => {
    get.mockResolvedValue([fathersDay, constitution]);
    const { container } = renderWithProviders(<HolidaysCard year={2026} canManage={false} />);

    expect(
      await screen.findByText(
        'ตรงกับวันเสาร์หรืออาทิตย์ คนที่ทำงานจันทร์ถึงศุกร์จะหยุดชดเชยวันที่ 7 ธ.ค. 2569 เว้นแต่จะระบุวันหยุดแถวอื่นเป็นวันชดเชยของวันนี้',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(get).toHaveBeenCalledWith('/holidays', { query: { year: 2026 } });
    await expectNoAxeViolations(container);
  });

  it('lets HR mark a later holiday as the substitute for an earlier one', async () => {
    get.mockResolvedValue([fathersDay, monday, constitution]);
    patch.mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithProviders(<HolidaysCard year={2026} canManage />);

    // The 5th has nothing before it to stand in for.
    expect(await screen.findAllByRole('combobox')).toHaveLength(2);
    const select = screen.getByRole('combobox', { name: 'เป็นวันชดเชยของ ชดเชยวันพ่อ' });
    await expectNoAxeViolations(container);
    await user.selectOptions(select, 'h-5');

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/holidays/h-7', { substituteForId: 'h-5' }),
    );
  });

  it('shows a marked substitute both ways, and can make it an ordinary holiday again', async () => {
    get.mockResolvedValue([
      { ...fathersDay, substituteOnWeekdays: null },
      {
        ...monday,
        substituteForId: 'h-5',
        substituteFor: { id: 'h-5', date: '2026-12-05', name: 'วันพ่อแห่งชาติ' },
      },
      constitution,
    ]);
    patch.mockRejectedValueOnce(new ApiError(409, 'HOLIDAY_ALREADY_HAS_SUBSTITUTE', 'taken'));
    const user = userEvent.setup();
    renderWithProviders(<HolidaysCard year={2026} canManage />);

    const fifth = (await screen.findByText('วันพ่อแห่งชาติ')).closest('tr')!;
    expect(
      within(fifth).getByText(
        'ตรงกับวันหยุดประจำสัปดาห์ หยุดชดเชยวันที่ 7 ธ.ค. 2569 ตามที่ฝ่ายบุคคลระบุ',
      ),
    ).toBeInTheDocument();
    const seventh = screen.getByText('ชดเชยวันพ่อ').closest('tr')!;
    expect(
      within(seventh).getByText('วันหยุดชดเชยของวันพ่อแห่งชาติ 5 ธ.ค. 2569'),
    ).toBeInTheDocument();

    await user.click(within(seventh).getByRole('button', { name: 'ไม่ใช่วันชดเชย' }));
    expect(patch).toHaveBeenCalledWith('/holidays/h-7', { substituteForId: null });
    expect(await screen.findByRole('alert')).toHaveTextContent('วันหยุดนั้นมีวันชดเชยแล้ว');
  });
});
