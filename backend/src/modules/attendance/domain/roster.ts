/**
 * Roster rules that are pure enough to prove without a database (CW-010).
 *
 * A schedule assignment gives an employee a `WorkSchedule` over an inclusive
 * range of calendar days, `from` to `to`, where a null `to` is open-ended —
 * "from this date until further notice". Two assignments for the same employee
 * may not overlap: on an overlapping day `resolveShift` would have two schedules
 * to choose from, and which one it picked would depend on insertion order. The
 * roster has to be unambiguous, so the overlap is rejected at write time, and
 * this is the check that decides it.
 *
 * Date-only on purpose. Callers pass UTC-midnight dates — the `@db.Date`
 * representation the rest of the system uses — so this compares days, never
 * instants, and never shifts one across a timezone.
 */
export interface DateRange {
  from: Date;
  /** Inclusive last day, or null for open-ended. */
  to: Date | null;
}

/** Whether two inclusive day-ranges share at least one day. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const aTo = a.to ? a.to.getTime() : Infinity;
  const bTo = b.to ? b.to.getTime() : Infinity;
  // Standard interval overlap: each range starts on or before the other ends.
  return a.from.getTime() <= bTo && b.from.getTime() <= aTo;
}

/** The first existing range the candidate collides with, or null if it is clear. */
export function findOverlap(candidate: DateRange, existing: DateRange[]): DateRange | null {
  return existing.find((range) => rangesOverlap(candidate, range)) ?? null;
}

/** A range is well-formed when it is open-ended or ends on/after it starts. */
export function isValidRange(range: DateRange): boolean {
  return range.to === null || range.from.getTime() <= range.to.getTime();
}

/** What a single roster cell reads, for the calendar view. */
export interface RosterDayInput {
  /** ISO weekday of the day being resolved: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** A per-day override for this employee-day, if one exists. */
  override: { shiftId: string; shiftName: string; isDayOff: boolean } | null;
  /** The schedule covering this day, if the employee has one assigned. */
  schedule: {
    workingDays: number[];
    defaultShiftId: string | null;
    defaultShiftName: string | null;
  } | null;
}

export interface RosterDay {
  shiftId: string | null;
  shiftName: string | null;
  isDayOff: boolean;
  /** Where the answer came from, so the calendar can show why a cell is what it is. */
  source: 'override' | 'schedule' | 'none';
}

/**
 * Resolves one employee-day to the shift they are on, mirroring the precedence
 * `resolveShift` uses at punch time so the calendar shows what attendance will
 * actually measure against: a per-day override wins; otherwise the assigned
 * schedule's default shift on a working day, a day off on a non-working day; and
 * nothing at all when no schedule is assigned.
 */
export function resolveRosterDay(input: RosterDayInput): RosterDay {
  if (input.override) {
    return input.override.isDayOff
      ? { shiftId: null, shiftName: null, isDayOff: true, source: 'override' }
      : {
          shiftId: input.override.shiftId,
          shiftName: input.override.shiftName,
          isDayOff: false,
          source: 'override',
        };
  }

  if (input.schedule) {
    const working = input.schedule.workingDays.includes(input.weekday);
    if (working && input.schedule.defaultShiftId) {
      return {
        shiftId: input.schedule.defaultShiftId,
        shiftName: input.schedule.defaultShiftName,
        isDayOff: false,
        source: 'schedule',
      };
    }
    if (!working) {
      return { shiftId: null, shiftName: null, isDayOff: true, source: 'schedule' };
    }
  }

  return { shiftId: null, shiftName: null, isDayOff: false, source: 'none' };
}
