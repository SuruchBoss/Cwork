// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { AttendanceStatus, PunchType } from '@prisma/client';
import { toDateOnly } from '../../../core/utils/date.util';
import {
  deriveAttendance,
  detectImpossibleTravel,
  type ShiftDefinition,
} from './attendance-calculator';
import { checkGeofence, distanceMeters } from './geo';

const TZ = 'Asia/Bangkok';

const dayShift: ShiftDefinition = {
  startTime: '09:00',
  endTime: '18:00',
  crossesMidnight: false,
  breakMinutes: 60,
  graceInMinutes: 5,
  graceOutMinutes: 5,
  standardWorkMinutes: 480,
  isFlexible: false,
};

/** Helper: an instant at a Bangkok wall-clock time on 2026-09-15. */
const bkk = (hhmm: string) => new Date(`2026-09-15T${hhmm}:00+07:00`);

describe('deriveAttendance', () => {
  it('marks a clean full day as PRESENT with 8 worked hours', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [
        { type: PunchType.CLOCK_IN, punchedAt: bkk('08:55') },
        { type: PunchType.CLOCK_OUT, punchedAt: bkk('18:02') },
      ],
    });

    expect(result.status).toBe(AttendanceStatus.PRESENT);
    expect(result.workedMinutes).toBe(487); // 9h07m gross − 60m break
    expect(result.lateMinutes).toBe(0);
    expect(result.earlyLeaveMinutes).toBe(0);
  });

  it('counts lateness beyond the grace period only', () => {
    const withinGrace = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [
        { type: PunchType.CLOCK_IN, punchedAt: bkk('09:04') },
        { type: PunchType.CLOCK_OUT, punchedAt: bkk('18:00') },
      ],
    });
    const late = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [
        { type: PunchType.CLOCK_IN, punchedAt: bkk('09:35') },
        { type: PunchType.CLOCK_OUT, punchedAt: bkk('18:00') },
      ],
    });

    expect(withinGrace.lateMinutes).toBe(0);
    expect(withinGrace.status).toBe(AttendanceStatus.PRESENT);
    expect(late.lateMinutes).toBe(30);
    expect(late.status).toBe(AttendanceStatus.LATE);
  });

  it('flags leaving early', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [
        { type: PunchType.CLOCK_IN, punchedAt: bkk('09:00') },
        { type: PunchType.CLOCK_OUT, punchedAt: bkk('16:30') },
      ],
    });

    expect(result.earlyLeaveMinutes).toBe(85);
    expect(result.status).toBe(AttendanceStatus.EARLY_LEAVE);
  });

  it('treats every worked minute on a holiday as overtime', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: true,
      punches: [
        { type: PunchType.CLOCK_IN, punchedAt: bkk('10:00') },
        { type: PunchType.CLOCK_OUT, punchedAt: bkk('15:00') },
      ],
    });

    expect(result.status).toBe(AttendanceStatus.HOLIDAY);
    expect(result.overtimeMinutes).toBe(result.workedMinutes);
    expect(result.lateMinutes).toBe(0);
  });

  it('counts only minutes past the standard day as overtime on a normal day', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [
        { type: PunchType.CLOCK_IN, punchedAt: bkk('09:00') },
        { type: PunchType.CLOCK_OUT, punchedAt: bkk('20:00') },
      ],
    });

    expect(result.workedMinutes).toBe(600); // 11h − 1h break
    expect(result.overtimeMinutes).toBe(120);
  });

  it('subtracts explicit break punches instead of the shift default', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [
        { type: PunchType.CLOCK_IN, punchedAt: bkk('09:00') },
        { type: PunchType.BREAK_START, punchedAt: bkk('12:00') },
        { type: PunchType.BREAK_END, punchedAt: bkk('12:30') },
        { type: PunchType.CLOCK_OUT, punchedAt: bkk('18:00') },
      ],
    });

    expect(result.breakMinutes).toBe(30);
    expect(result.workedMinutes).toBe(510);
  });

  it('never reports lateness for a flexible shift', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: { ...dayShift, isFlexible: true },
      isWorkingDay: true,
      isHoliday: false,
      punches: [
        { type: PunchType.CLOCK_IN, punchedAt: bkk('11:30') },
        { type: PunchType.CLOCK_OUT, punchedAt: bkk('20:30') },
      ],
    });

    expect(result.lateMinutes).toBe(0);
    expect(result.status).toBe(AttendanceStatus.PRESENT);
  });

  it('reports NOT_STARTED for a working day with no punches', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [],
    });

    expect(result.status).toBe(AttendanceStatus.NOT_STARTED);
    expect(result.workedMinutes).toBe(0);
  });

  it('reports ON_LEAVE when the whole day is covered by approved leave', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [],
      leaveDayValue: 1,
    });

    expect(result.status).toBe(AttendanceStatus.ON_LEAVE);
  });

  it('does not score a day that has no clock-out yet', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [{ type: PunchType.CLOCK_IN, punchedAt: bkk('09:00') }],
    });

    expect(result.lastClockOutAt).toBeNull();
    expect(result.workedMinutes).toBe(0);
    expect(result.status).toBe(AttendanceStatus.PRESENT);
  });

  it('carries anomaly flags and geofence breaches through to the daily record', () => {
    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: dayShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [
        {
          type: PunchType.CLOCK_IN,
          punchedAt: bkk('09:00'),
          isOutsideGeofence: true,
          anomalyFlags: ['OUTSIDE_GEOFENCE'],
        },
        { type: PunchType.CLOCK_OUT, punchedAt: bkk('18:00') },
      ],
    });

    expect(result.isOutsideGeofence).toBe(true);
    expect(result.anomalyFlags).toContain('OUTSIDE_GEOFENCE');
  });

  it('handles a night shift that ends the next morning', () => {
    const nightShift: ShiftDefinition = {
      ...dayShift,
      startTime: '22:00',
      endTime: '06:00',
      crossesMidnight: true,
    };

    const result = deriveAttendance({
      workDate: toDateOnly('2026-09-15'),
      timezone: TZ,
      shift: nightShift,
      isWorkingDay: true,
      isHoliday: false,
      punches: [
        { type: PunchType.CLOCK_IN, punchedAt: new Date('2026-09-15T22:00:00+07:00') },
        { type: PunchType.CLOCK_OUT, punchedAt: new Date('2026-09-16T06:00:00+07:00') },
      ],
    });

    expect(result.workedMinutes).toBe(420); // 8h − 1h break
    expect(result.earlyLeaveMinutes).toBe(0);
    expect(result.lateMinutes).toBe(0);
  });
});

describe('geofencing', () => {
  const office = { latitude: 13.7563, longitude: 100.5018 };

  it('measures a known distance accurately', () => {
    // ~1.1 km north of the office.
    const nearby = { latitude: 13.7663, longitude: 100.5018 };
    expect(distanceMeters(office, nearby)).toBeGreaterThan(1050);
    expect(distanceMeters(office, nearby)).toBeLessThan(1150);
  });

  it('accepts a punch inside the radius', () => {
    const inside = { latitude: 13.7565, longitude: 100.502 };
    expect(checkGeofence(inside, office, 200).isInside).toBe(true);
  });

  it('rejects a punch well outside the radius', () => {
    const far = { latitude: 13.8, longitude: 100.6 };
    const result = checkGeofence(far, office, 200);
    expect(result.isInside).toBe(false);
    expect(result.distanceM).toBeGreaterThan(5000);
  });

  it('gives the benefit of the doubt within the reported GPS accuracy', () => {
    const justOutside = { latitude: 13.7585, longitude: 100.5018 };
    expect(checkGeofence(justOutside, office, 200, 0).isInside).toBe(false);
    expect(checkGeofence(justOutside, office, 200, 100).isInside).toBe(true);
  });
});

describe('detectImpossibleTravel', () => {
  it('flags 300 km covered in 10 minutes', () => {
    const flagged = detectImpossibleTravel(
      { punchedAt: bkk('09:00'), distanceFromM: 300_000 },
      bkk('09:10'),
    );
    expect(flagged).toBe(true);
  });

  it('accepts a normal commute', () => {
    const flagged = detectImpossibleTravel(
      { punchedAt: bkk('08:00'), distanceFromM: 20_000 },
      bkk('09:00'),
    );
    expect(flagged).toBe(false);
  });

  it('never flags the first punch of the day', () => {
    expect(detectImpossibleTravel(null, bkk('09:00'))).toBe(false);
  });
});
