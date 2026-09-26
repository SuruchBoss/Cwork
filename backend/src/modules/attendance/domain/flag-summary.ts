// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Groups a team's flagged attendance punches so their likely cause is legible
 * (CW-039).
 *
 * Attendance already raises `OUTSIDE_GEOFENCE`, `IMPOSSIBLE_TRAVEL`,
 * `MOCK_LOCATION`, `CLOCK_DRIFT`, `LOW_GPS_ACCURACY` and `NO_LOCATION`, and a
 * manager sees a flat list of them. The list does not say whether they are
 * looking at a dishonest employee or a badly drawn geofence — and it is almost
 * always the geofence. This turns the flat list into groups by location and
 * flag, with the distances and counts that tell the two apart: forty punches
 * `OUTSIDE_GEOFENCE` at one site, all a median 45 m out, is a geofence set too
 * tight; one punch 8 km out is worth a look.
 *
 * Pure on purpose, like the payroll variance. Every number the assistant is
 * allowed to state comes from here, and `groundedFlagAmounts` is what lets a
 * test reject a narration that invents one.
 */

/** A flagged punch, reduced to what a summary reads. */
export interface FlaggedPunch {
  employeeId: string;
  /** The flags on this punch, already including OUTSIDE_GEOFENCE where it applies. */
  flags: string[];
  /** The work location's name, or null when the punch carried no location. */
  locationName: string | null;
  /** Metres outside the geofence, when the punch was measured against one. */
  distanceM: number | null;
  /** Reported GPS accuracy in metres, when the punch carried a location. */
  accuracyM: number | null;
}

export interface FlagStat {
  min: number;
  median: number;
  max: number;
}

export interface FlagGroup {
  location: string;
  flag: string;
  punchCount: number;
  employeeCount: number;
  /** Distance spread, only for flags where being outside the fence is the point. */
  distanceM: FlagStat | null;
  /** Accuracy spread, only for the low-accuracy flag. */
  accuracyM: FlagStat | null;
}

export interface AttendanceFlagSummary {
  from: string;
  to: string;
  totalFlaggedPunches: number;
  totalEmployees: number;
  groups: FlagGroup[];
}

/** A location name for a punch that carried none — kept out of the number set. */
const NO_LOCATION_LABEL = 'ไม่มีพิกัด';

function stat(values: number[]): FlagStat | null {
  const present = values.filter((v): v is number => typeof v === 'number');
  if (present.length === 0) return null;
  const sorted = [...present].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  return { min: sorted[0], median, max: sorted[sorted.length - 1] };
}

/**
 * Summarises `punches` into groups by location and flag over `[from, to]`.
 *
 * A punch with several flags is counted under each of them, because a manager
 * reads the list one flag at a time — "why are there twelve MOCK_LOCATION at
 * the warehouse" is the question, and a punch that is also CLOCK_DRIFT belongs
 * in that answer too. `totalFlaggedPunches` counts each punch once.
 */
export function summariseAttendanceFlags(
  punches: FlaggedPunch[],
  from: string,
  to: string,
): AttendanceFlagSummary {
  const groups = new Map<
    string,
    {
      location: string;
      flag: string;
      employees: Set<string>;
      punches: number;
      distances: number[];
      accuracies: number[];
    }
  >();

  for (const punch of punches) {
    const location = punch.locationName ?? NO_LOCATION_LABEL;
    for (const flag of punch.flags) {
      const key = JSON.stringify([location, flag]);
      let group = groups.get(key);
      if (!group) {
        group = { location, flag, employees: new Set(), punches: 0, distances: [], accuracies: [] };
        groups.set(key, group);
      }
      group.punches += 1;
      group.employees.add(punch.employeeId);
      if (punch.distanceM !== null) group.distances.push(punch.distanceM);
      if (punch.accuracyM !== null) group.accuracies.push(punch.accuracyM);
    }
  }

  const distanceFlags = new Set(['OUTSIDE_GEOFENCE', 'IMPOSSIBLE_TRAVEL']);

  const grouped: FlagGroup[] = [...groups.values()]
    .map((g) => ({
      location: g.location,
      flag: g.flag,
      punchCount: g.punches,
      employeeCount: g.employees.size,
      distanceM: distanceFlags.has(g.flag) ? stat(g.distances) : null,
      accuracyM: g.flag === 'LOW_GPS_ACCURACY' ? stat(g.accuracies) : null,
    }))
    // Loudest first: the biggest cluster is the one most likely to be a setting.
    .sort((a, b) => b.punchCount - a.punchCount || a.location.localeCompare(b.location));

  return {
    from,
    to,
    totalFlaggedPunches: punches.length,
    totalEmployees: new Set(punches.map((p) => p.employeeId)).size,
    groups: grouped,
  };
}

/**
 * Every countable and metric figure in a summary, as a set of strings — the
 * ground truth a narration is checked against, exactly as for payroll. Location
 * names are excluded; only figures are checked.
 */
export function groundedFlagAmounts(summary: AttendanceFlagSummary): Set<string> {
  const out = new Set<string>();
  const add = (n: number): void => {
    out.add(String(n));
    out.add(n.toLocaleString('en-US'));
  };

  add(summary.totalFlaggedPunches);
  add(summary.totalEmployees);
  for (const g of summary.groups) {
    add(g.punchCount);
    add(g.employeeCount);
    for (const s of [g.distanceM, g.accuracyM]) {
      if (s) {
        add(s.min);
        add(s.median);
        add(s.max);
      }
    }
  }
  return out;
}

/** Numbers a narration states that the summary does not contain (see run-variance). */
export function ungroundedFlagAmounts(narration: string, summary: AttendanceFlagSummary): string[] {
  const grounded = groundedFlagAmounts(summary);
  const spoken = narration.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const offending: string[] = [];
  for (const token of spoken) {
    const normalised = token.replace(/,/g, '');
    if (grounded.has(token) || grounded.has(normalised)) continue;
    offending.push(token);
  }
  return offending;
}
