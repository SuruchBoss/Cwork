/**
 * Date helpers for the e2e suite.
 *
 * The seed builds its calendar from the current year, so the suite has to do
 * the same. A test that only passes in September 2026 is a test that starts
 * lying in October.
 */

/** `yyyy-MM-dd` in UTC, which is how the API takes calendar dates. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** 1 = Monday … 7 = Sunday, matching the API's working-weekday numbering. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

export interface LeaveWindow {
  /** A Friday. */
  startDate: string;
  /** The Monday three days later. */
  endDate: string;
}

/**
 * Finds a Friday-to-Monday window that costs exactly two working days: no
 * public holiday on either end, and both ends inside the same leave year the
 * employee has an entitlement for.
 *
 * Searching forward from today keeps the request in the future, which is what
 * the API expects of a leave request.
 */
export function findFridayToMondayWindow(holidayDates: Set<string>, from: Date): LeaveWindow {
  const year = from.getUTCFullYear();

  for (let offset = 3; offset <= 330; offset += 1) {
    const start = addDays(from, offset);
    if (isoWeekday(start) !== 5) continue;

    const end = addDays(start, 3);
    if (end.getUTCFullYear() !== year) break;

    if (holidayDates.has(isoDate(start)) || holidayDates.has(isoDate(end))) continue;
    return { startDate: isoDate(start), endDate: isoDate(end) };
  }

  throw new Error(
    `No clean Friday-to-Monday window left in ${year}. Running the suite in the ` +
      'final days of December needs the next leave year granted first.',
  );
}
