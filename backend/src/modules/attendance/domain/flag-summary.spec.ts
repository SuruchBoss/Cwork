// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  groundedFlagAmounts,
  summariseAttendanceFlags,
  ungroundedFlagAmounts,
  type FlaggedPunch,
} from './flag-summary';

const punch = (
  employeeId: string,
  flags: string[],
  over: Partial<Omit<FlaggedPunch, 'employeeId' | 'flags'>> = {},
): FlaggedPunch => ({
  employeeId,
  flags,
  locationName: null,
  distanceM: null,
  accuracyM: null,
  ...over,
});

describe('summariseAttendanceFlags', () => {
  it('groups by location and flag, counting punches and distinct employees', () => {
    const summary = summariseAttendanceFlags(
      [
        punch('e1', ['OUTSIDE_GEOFENCE'], { locationName: 'คลังสินค้า', distanceM: 40 }),
        punch('e2', ['OUTSIDE_GEOFENCE'], { locationName: 'คลังสินค้า', distanceM: 50 }),
        punch('e1', ['OUTSIDE_GEOFENCE'], { locationName: 'คลังสินค้า', distanceM: 45 }),
      ],
      '2026-09-01',
      '2026-09-30',
    );

    expect(summary.totalFlaggedPunches).toBe(3);
    // e1 punched twice — a distinct-employee count, not a punch count.
    expect(summary.totalEmployees).toBe(2);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0]).toMatchObject({
      location: 'คลังสินค้า',
      flag: 'OUTSIDE_GEOFENCE',
      punchCount: 3,
      employeeCount: 2,
    });
  });

  it('counts a multi-flag punch under each flag but only once in the total', () => {
    const summary = summariseAttendanceFlags(
      [
        punch('e1', ['OUTSIDE_GEOFENCE', 'CLOCK_DRIFT'], {
          locationName: 'ไซต์งาน',
          distanceM: 30,
        }),
      ],
      '2026-09-01',
      '2026-09-30',
    );

    expect(summary.totalFlaggedPunches).toBe(1);
    expect(summary.groups.map((g) => g.flag).sort()).toEqual(['CLOCK_DRIFT', 'OUTSIDE_GEOFENCE']);
    // The one punch appears in both groups; it is still one punch overall.
    expect(summary.groups.every((g) => g.punchCount === 1)).toBe(true);
  });

  it('reports a distance spread only for the flags where being outside is the point', () => {
    const summary = summariseAttendanceFlags(
      [
        punch('e1', ['OUTSIDE_GEOFENCE'], { locationName: 'ไซต์งาน', distanceM: 40 }),
        punch('e2', ['OUTSIDE_GEOFENCE'], { locationName: 'ไซต์งาน', distanceM: 60 }),
        punch('e3', ['OUTSIDE_GEOFENCE'], { locationName: 'ไซต์งาน', distanceM: 50 }),
        // A mock-location flag says nothing about distance, even if the punch carried one.
        punch('e4', ['MOCK_LOCATION'], { locationName: 'ไซต์งาน', distanceM: 999 }),
      ],
      '2026-09-01',
      '2026-09-30',
    );

    const outside = summary.groups.find((g) => g.flag === 'OUTSIDE_GEOFENCE')!;
    expect(outside.distanceM).toEqual({ min: 40, median: 50, max: 60 });
    const mock = summary.groups.find((g) => g.flag === 'MOCK_LOCATION')!;
    expect(mock.distanceM).toBeNull();
  });

  it('reports an accuracy spread only for the low-accuracy flag', () => {
    const summary = summariseAttendanceFlags(
      [
        punch('e1', ['LOW_GPS_ACCURACY'], { locationName: 'สำนักงาน', accuracyM: 70 }),
        punch('e2', ['LOW_GPS_ACCURACY'], { locationName: 'สำนักงาน', accuracyM: 90 }),
        punch('e3', ['OUTSIDE_GEOFENCE'], {
          locationName: 'สำนักงาน',
          accuracyM: 85,
          distanceM: 30,
        }),
      ],
      '2026-09-01',
      '2026-09-30',
    );

    const low = summary.groups.find((g) => g.flag === 'LOW_GPS_ACCURACY')!;
    expect(low.accuracyM).toEqual({ min: 70, median: 80, max: 90 });
    const outside = summary.groups.find((g) => g.flag === 'OUTSIDE_GEOFENCE')!;
    expect(outside.accuracyM).toBeNull();
  });

  it('puts the loudest cluster first — the one most likely to be a setting', () => {
    const summary = summariseAttendanceFlags(
      [
        punch('e1', ['LOW_GPS_ACCURACY'], { locationName: 'สำนักงาน', accuracyM: 70 }),
        punch('e2', ['OUTSIDE_GEOFENCE'], { locationName: 'ไซต์งาน', distanceM: 40 }),
        punch('e3', ['OUTSIDE_GEOFENCE'], { locationName: 'ไซต์งาน', distanceM: 50 }),
      ],
      '2026-09-01',
      '2026-09-30',
    );

    expect(summary.groups.map((g) => g.flag)).toEqual(['OUTSIDE_GEOFENCE', 'LOW_GPS_ACCURACY']);
  });

  it('labels a punch that carried no location and still groups it', () => {
    const summary = summariseAttendanceFlags(
      [punch('e1', ['NO_LOCATION'])],
      '2026-09-01',
      '2026-09-30',
    );

    expect(summary.groups[0]).toMatchObject({
      location: 'ไม่มีพิกัด',
      flag: 'NO_LOCATION',
      punchCount: 1,
    });
  });
});

describe('the tool summarises, the model narrates', () => {
  const summary = summariseAttendanceFlags(
    [
      punch('e1', ['OUTSIDE_GEOFENCE'], { locationName: 'คลังสินค้า', distanceM: 40 }),
      punch('e2', ['OUTSIDE_GEOFENCE'], { locationName: 'คลังสินค้า', distanceM: 50 }),
      punch('e1', ['OUTSIDE_GEOFENCE'], { locationName: 'คลังสินค้า', distanceM: 45 }),
      punch('e3', ['IMPOSSIBLE_TRAVEL'], { locationName: 'คลังสินค้า', distanceM: 8000 }),
      punch('e4', ['LOW_GPS_ACCURACY'], { locationName: 'สำนักงานใหญ่', accuracyM: 80 }),
    ],
    '2026-09-01',
    '2026-09-30',
  );

  it('accepts a narration that only states figures from the summary', () => {
    // 3 punches from 2 employees, median 45 m out (40–50) — every figure is in the summary.
    const honest =
      'ที่คลังสินค้ามีการลงเวลานอกพื้นที่ 3 ครั้งจากพนักงาน 2 คน ห่างกลาง 45 เมตร (40–50) ' +
      'น่าจะเป็นเพราะรัศมีพื้นที่แคบเกินไป มากกว่าจะเป็นการโกง';
    expect(ungroundedFlagAmounts(honest, summary)).toEqual([]);
  });

  it('catches a headcount the model invented that the summary never produced', () => {
    const fabricated = 'มีพนักงานถึง 27 คนที่ลงเวลานอกพื้นที่';
    expect(ungroundedFlagAmounts(fabricated, summary)).toContain('27');
  });

  it('groundedFlagAmounts offers both the raw and thousands-separated form of a figure', () => {
    const amounts = groundedFlagAmounts(summary);
    expect(amounts.has('8000')).toBe(true);
    expect(amounts.has('8,000')).toBe(true);
  });
});
