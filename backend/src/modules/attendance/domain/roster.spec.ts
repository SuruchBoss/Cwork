import {
  findOverlap,
  isValidRange,
  rangesOverlap,
  resolveRosterDay,
  type DateRange,
} from './roster';

/** UTC-midnight calendar day, the `@db.Date` representation. */
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const range = (from: string, to: string | null): DateRange => ({
  from: d(from),
  to: to ? d(to) : null,
});

describe('rangesOverlap', () => {
  it('detects two closed ranges that share days', () => {
    expect(
      rangesOverlap(range('2026-01-01', '2026-01-31'), range('2026-01-15', '2026-02-15')),
    ).toBe(true);
  });

  it('treats a single shared day at the boundary as an overlap', () => {
    // One ends the very day the other begins — that day belongs to both.
    expect(
      rangesOverlap(range('2026-01-01', '2026-01-15'), range('2026-01-15', '2026-01-31')),
    ).toBe(true);
  });

  it('does not flag ranges that merely abut (a gap of one day)', () => {
    expect(
      rangesOverlap(range('2026-01-01', '2026-01-14'), range('2026-01-15', '2026-01-31')),
    ).toBe(false);
  });

  it('treats a null end as open-ended: it overlaps anything from its start on', () => {
    expect(rangesOverlap(range('2026-01-01', null), range('2027-06-01', '2027-06-30'))).toBe(true);
    // …but not a range that ends before the open-ended one begins.
    expect(rangesOverlap(range('2026-06-01', null), range('2026-01-01', '2026-05-31'))).toBe(false);
  });

  it('treats two open-ended ranges as overlapping', () => {
    expect(rangesOverlap(range('2026-01-01', null), range('2030-01-01', null))).toBe(true);
  });
});

describe('findOverlap', () => {
  const existing = [range('2026-01-01', '2026-03-31'), range('2026-07-01', null)];

  it('returns the first colliding range', () => {
    expect(findOverlap(range('2026-03-15', '2026-04-15'), existing)).toEqual(existing[0]);
  });

  it('returns null when the candidate fits in the gap between them', () => {
    expect(findOverlap(range('2026-04-01', '2026-06-30'), existing)).toBeNull();
  });
});

describe('isValidRange', () => {
  it('accepts an open-ended range and one that ends on or after it starts', () => {
    expect(isValidRange(range('2026-01-01', null))).toBe(true);
    expect(isValidRange(range('2026-01-01', '2026-01-01'))).toBe(true);
    expect(isValidRange(range('2026-01-01', '2026-01-31'))).toBe(true);
  });

  it('rejects a range that ends before it starts', () => {
    expect(isValidRange(range('2026-01-31', '2026-01-01'))).toBe(false);
  });
});

describe('resolveRosterDay', () => {
  const schedule = {
    workingDays: [1, 2, 3, 4, 5],
    defaultShiftId: 'shift-day',
    defaultShiftName: 'กะกลางวัน',
  };

  it('lets a per-day override win over the schedule', () => {
    expect(
      resolveRosterDay({
        weekday: 3,
        override: { shiftId: 'shift-night', shiftName: 'กะดึก', isDayOff: false },
        schedule,
      }),
    ).toEqual({ shiftId: 'shift-night', shiftName: 'กะดึก', isDayOff: false, source: 'override' });
  });

  it('reads a day-off override as a day off, whatever the schedule says', () => {
    expect(
      resolveRosterDay({
        weekday: 2,
        override: { shiftId: 'shift-day', shiftName: 'กะกลางวัน', isDayOff: true },
        schedule,
      }),
    ).toEqual({ shiftId: null, shiftName: null, isDayOff: true, source: 'override' });
  });

  it('falls back to the schedule’s default shift on a working day', () => {
    expect(resolveRosterDay({ weekday: 1, override: null, schedule })).toEqual({
      shiftId: 'shift-day',
      shiftName: 'กะกลางวัน',
      isDayOff: false,
      source: 'schedule',
    });
  });

  it('reads a non-working weekday as a scheduled day off', () => {
    // Sunday (7) is not in the schedule's working days.
    expect(resolveRosterDay({ weekday: 7, override: null, schedule })).toEqual({
      shiftId: null,
      shiftName: null,
      isDayOff: true,
      source: 'schedule',
    });
  });

  it('reads no schedule and no override as nothing rostered', () => {
    expect(resolveRosterDay({ weekday: 3, override: null, schedule: null })).toEqual({
      shiftId: null,
      shiftName: null,
      isDayOff: false,
      source: 'none',
    });
  });
});
