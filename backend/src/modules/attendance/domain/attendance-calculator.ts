import { AttendanceStatus, PunchType } from '@prisma/client';
import { minutesBetween, zonedInstant } from '../../../core/utils/date.util';

/**
 * Derives the daily attendance summary from the raw punch stream.
 *
 * This is a pure reducer: given the same punches and shift it always produces
 * the same record, so the daily aggregate can be safely recomputed after a
 * correction rather than patched in place.
 */

export interface PunchInput {
  type: PunchType;
  punchedAt: Date;
  isOutsideGeofence?: boolean;
  anomalyFlags?: string[];
}

export interface ShiftDefinition {
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  breakMinutes: number;
  graceInMinutes: number;
  graceOutMinutes: number;
  standardWorkMinutes: number;
  isFlexible: boolean;
}

export interface DeriveAttendanceInput {
  workDate: Date;
  timezone: string;
  punches: PunchInput[];
  shift: ShiftDefinition | null;
  isWorkingDay: boolean;
  isHoliday: boolean;
  /** Fraction of the day covered by approved leave (0, 0.5 or 1). */
  leaveDayValue?: number;
}

export interface DerivedAttendance {
  firstClockInAt: Date | null;
  lastClockOutAt: Date | null;
  breakMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: AttendanceStatus;
  isOutsideGeofence: boolean;
  anomalyFlags: string[];
}

export function deriveAttendance(input: DeriveAttendanceInput): DerivedAttendance {
  const ordered = [...input.punches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());

  const clockIns = ordered.filter((p) => p.type === PunchType.CLOCK_IN);
  const clockOuts = ordered.filter((p) => p.type === PunchType.CLOCK_OUT);

  const firstClockInAt = clockIns[0]?.punchedAt ?? null;
  const lastClockOutAt = clockOuts.at(-1)?.punchedAt ?? null;

  const breakMinutes = sumBreakMinutes(ordered);
  const anomalyFlags = new Set<string>(ordered.flatMap((p) => p.anomalyFlags ?? []));
  const isOutsideGeofence = ordered.some((p) => p.isOutsideGeofence);

  if (ordered.length === 0) {
    return {
      firstClockInAt: null,
      lastClockOutAt: null,
      breakMinutes: 0,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      status: statusForEmptyDay(input),
      isOutsideGeofence: false,
      anomalyFlags: [],
    };
  }

  if (!lastClockOutAt) {
    return {
      firstClockInAt,
      lastClockOutAt: null,
      breakMinutes,
      workedMinutes: 0,
      lateMinutes: computeLateMinutes(input, firstClockInAt),
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      // Still on the clock, or they forgot to clock out — either way the day is
      // not scoreable yet. The nightly job flips stale rows to INCOMPLETE.
      status: AttendanceStatus.PRESENT,
      isOutsideGeofence,
      anomalyFlags: [...anomalyFlags],
    };
  }

  const grossMinutes = Math.max(0, minutesBetween(firstClockInAt!, lastClockOutAt));
  const deductedBreak = breakMinutes > 0 ? breakMinutes : (input.shift?.breakMinutes ?? 0);
  const workedMinutes = Math.max(0, grossMinutes - deductedBreak);

  const lateMinutes = computeLateMinutes(input, firstClockInAt);
  const earlyLeaveMinutes = computeEarlyLeaveMinutes(input, lastClockOutAt);

  const standard = input.shift?.standardWorkMinutes ?? 480;
  const overtimeMinutes =
    !input.isWorkingDay || input.isHoliday ? workedMinutes : Math.max(0, workedMinutes - standard);

  return {
    firstClockInAt,
    lastClockOutAt,
    breakMinutes: deductedBreak,
    workedMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    status: resolveStatus(input, lateMinutes, earlyLeaveMinutes),
    isOutsideGeofence,
    anomalyFlags: [...anomalyFlags],
  };
}

function statusForEmptyDay(input: DeriveAttendanceInput): AttendanceStatus {
  if (input.isHoliday) return AttendanceStatus.HOLIDAY;
  if (!input.isWorkingDay) return AttendanceStatus.DAY_OFF;
  if ((input.leaveDayValue ?? 0) >= 1) return AttendanceStatus.ON_LEAVE;
  return AttendanceStatus.NOT_STARTED;
}

function resolveStatus(
  input: DeriveAttendanceInput,
  lateMinutes: number,
  earlyLeaveMinutes: number,
): AttendanceStatus {
  if (input.isHoliday) return AttendanceStatus.HOLIDAY;
  if (!input.isWorkingDay) return AttendanceStatus.DAY_OFF;
  if (lateMinutes > 0) return AttendanceStatus.LATE;
  if (earlyLeaveMinutes > 0) return AttendanceStatus.EARLY_LEAVE;
  return AttendanceStatus.PRESENT;
}

function computeLateMinutes(input: DeriveAttendanceInput, firstClockInAt: Date | null): number {
  // Flexible shifts have no fixed start, so lateness is not a meaningful metric.
  if (
    !input.shift ||
    input.shift.isFlexible ||
    !firstClockInAt ||
    !input.isWorkingDay ||
    input.isHoliday
  ) {
    return 0;
  }
  const expectedStart = zonedInstant(input.workDate, input.shift.startTime, input.timezone);
  const late = minutesBetween(expectedStart, firstClockInAt) - input.shift.graceInMinutes;
  return Math.max(0, late);
}

function computeEarlyLeaveMinutes(
  input: DeriveAttendanceInput,
  lastClockOutAt: Date | null,
): number {
  if (
    !input.shift ||
    input.shift.isFlexible ||
    !lastClockOutAt ||
    !input.isWorkingDay ||
    input.isHoliday
  ) {
    return 0;
  }
  const expectedEnd = zonedInstant(
    input.workDate,
    input.shift.endTime,
    input.timezone,
    input.shift.crossesMidnight ? 1 : 0,
  );
  const early = minutesBetween(lastClockOutAt, expectedEnd) - input.shift.graceOutMinutes;
  return Math.max(0, early);
}

/** Pairs BREAK_START/BREAK_END punches; an unclosed break contributes nothing. */
function sumBreakMinutes(ordered: PunchInput[]): number {
  let total = 0;
  let openedAt: Date | null = null;

  for (const punch of ordered) {
    if (punch.type === PunchType.BREAK_START) {
      openedAt = punch.punchedAt;
    } else if (punch.type === PunchType.BREAK_END && openedAt) {
      total += Math.max(0, minutesBetween(openedAt, punch.punchedAt));
      openedAt = null;
    }
  }
  return total;
}

/** Anti-fraud flags raised at punch time, surfaced to HR rather than blocking. */
export const AnomalyFlag = {
  MOCK_LOCATION: 'MOCK_LOCATION',
  ROOTED_DEVICE: 'ROOTED_DEVICE',
  OUTSIDE_GEOFENCE: 'OUTSIDE_GEOFENCE',
  NO_LOCATION: 'NO_LOCATION',
  LOW_GPS_ACCURACY: 'LOW_GPS_ACCURACY',
  CLOCK_DRIFT: 'CLOCK_DRIFT',
  NEW_DEVICE: 'NEW_DEVICE',
  IMPOSSIBLE_TRAVEL: 'IMPOSSIBLE_TRAVEL',
} as const;

export type AnomalyFlagKey = (typeof AnomalyFlag)[keyof typeof AnomalyFlag];

/**
 * Flags a punch whose two positions are too far apart to be physically
 * plausible in the elapsed time (default threshold: 200 km/h).
 */
export function detectImpossibleTravel(
  previous: { punchedAt: Date; distanceFromM: number } | null,
  current: Date,
  maxSpeedKmh = 200,
): boolean {
  if (!previous) return false;
  const minutes = minutesBetween(previous.punchedAt, current);
  if (minutes <= 0) return false;
  const speedKmh = previous.distanceFromM / 1000 / (minutes / 60);
  return speedKmh > maxSpeedKmh;
}
