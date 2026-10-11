// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  isDayOff,
  isHoliday,
  resolveWorkCalendar,
  type CalendarHoliday,
  type ScheduledDay,
} from './work-calendar';

/**
 * December 2026: Saturday the 5th is Father's Day, so for a Monday-to-Friday
 * week its substitute is Monday the 7th (Labour Protection Act s.29).
 */
const december = (
  from: number,
  to: number,
  options: { workingDays?: number[]; employed?: (day: number) => boolean } = {},
): ScheduledDay[] =>
  Array.from({ length: to - from + 1 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 11, from + i));
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    return {
      date: date.toISOString().slice(0, 10),
      scheduled: (options.workingDays ?? [1, 2, 3, 4, 5]).includes(weekday),
      employed: options.employed?.(from + i) ?? true,
    };
  });

const holiday = (day: number, extra: Partial<CalendarHoliday> = {}): CalendarHoliday => ({
  date: `2026-12-${String(day).padStart(2, '0')}`,
  isPaid: true,
  substituteFor: null,
  ...extra,
});
const entered = (day: number, forDay: number) =>
  holiday(day, { substituteFor: `2026-12-${String(forDay).padStart(2, '0')}` });

const on = (days: ReturnType<typeof resolveWorkCalendar>, day: number) =>
  days.find((d) => d.date === `2026-12-${String(day).padStart(2, '0')}`)!;

describe('The work calendar (CW-081)', () => {
  it('moves a holiday on Saturday to Monday by itself', () => {
    const days = resolveWorkCalendar(december(4, 9), [holiday(5)]);

    expect(on(days, 5)).toMatchObject({ holiday: { isPaid: true }, substitutedOn: '2026-12-07' });
    expect(on(days, 7)).toMatchObject({ holiday: null, substituteFor: '2026-12-05' });
    expect(isHoliday(on(days, 7))).toBe(true);
    expect(isDayOff(on(days, 7))).toBe(true);
    expect(isDayOff(on(days, 8))).toBe(false);
  });

  it('gives the same answer when HR entered Monday as the substitute', () => {
    const automatic = resolveWorkCalendar(december(4, 9), [holiday(5)]);
    const withRow = resolveWorkCalendar(december(4, 9), [holiday(5), entered(7, 5)]);

    expect(withRow).toEqual(automatic);
    // Monday is not a holiday of its own, so Tuesday stays a working day.
    expect(on(withRow, 8)).toMatchObject({ holiday: null, substituteFor: null });
  });

  it('takes the day HR chose instead of the automatic one', () => {
    const days = resolveWorkCalendar(december(4, 9), [holiday(5), entered(8, 5)]);

    expect(on(days, 7)).toMatchObject({ substituteFor: null });
    expect(isDayOff(on(days, 7))).toBe(false);
    expect(on(days, 8)).toMatchObject({ substituteFor: '2026-12-05' });
    expect(on(days, 5).substitutedOn).toBe('2026-12-08');
  });

  it('owes no substitute to someone who works Saturdays, for whom the entered day is a working day', () => {
    const days = resolveWorkCalendar(december(4, 9, { workingDays: [1, 2, 3, 4, 5, 6] }), [
      holiday(5),
      entered(7, 5),
    ]);

    expect(on(days, 5)).toMatchObject({ holiday: { isPaid: true }, substitutedOn: null });
    expect(isHoliday(on(days, 5))).toBe(true);
    expect(on(days, 7)).toMatchObject({ holiday: null, substituteFor: null });
    expect(isDayOff(on(days, 7))).toBe(false);
  });

  it('falls back to the automatic day when HR chose one the employee does not work', () => {
    // Works Tuesday to Saturday, so Sunday 6 and Monday 7 are both days off:
    // a holiday on the Sunday cannot be taken on the Monday HR chose.
    const days = resolveWorkCalendar(december(4, 10, { workingDays: [2, 3, 4, 5, 6] }), [
      holiday(6),
      entered(7, 6),
    ]);

    expect(on(days, 7)).toMatchObject({ substituteFor: null });
    expect(on(days, 8)).toMatchObject({ substituteFor: '2026-12-06' });
  });

  it('gives two holidays on days off the next two free working days, past a holiday on a working day', () => {
    const days = resolveWorkCalendar(december(4, 11), [holiday(5), holiday(6), holiday(7)]);

    expect(on(days, 7)).toMatchObject({ holiday: { isPaid: true }, substituteFor: null });
    expect(on(days, 8).substituteFor).toBe('2026-12-05');
    expect(on(days, 9).substituteFor).toBe('2026-12-06');
  });

  it('owes nothing for a holiday before the employee joined, and no substitute after they leave', () => {
    const joinedMonday = resolveWorkCalendar(december(4, 9, { employed: (d) => d >= 7 }), [
      holiday(5),
    ]);
    expect(joinedMonday.every((d) => d.substituteFor === null)).toBe(true);

    const leftFriday = resolveWorkCalendar(december(4, 9, { employed: (d) => d <= 5 }), [
      holiday(5),
    ]);
    expect(on(leftFriday, 5).substitutedOn).toBeNull();
    expect(on(leftFriday, 7).substituteFor).toBeNull();
  });

  it('moves no unpaid holiday', () => {
    const days = resolveWorkCalendar(december(4, 9), [holiday(5, { isPaid: false })]);

    expect(on(days, 5)).toMatchObject({ holiday: { isPaid: false }, substitutedOn: null });
    expect(on(days, 7).substituteFor).toBeNull();
  });
});
