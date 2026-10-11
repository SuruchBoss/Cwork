# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- **CW-082** (#85, monthly proration over the work calendar): built, waiting for
  the PO's review.
  - `PayrollService.workingDaysFor` asks `WorkCalendarService.daysFor` (new
    `wholePeriod` option: resolve the days as if the employee were employed all of
    them) and counts the days that are not `isDayOff`. `workingDaysInPeriod` (the
    divisor of a day's value) is per employee now; `employeeWorkingDays` is the
    part from hire date to last working day. The method is unchanged.
  - The organisation-wide Monday-to-Friday count and `holidayDateSet` are gone.
  - e2e `payroll-proration-calendar.e2e-spec.ts` (December 2026: 20 working days
    with the 7th, 10th and 31st out; joiner on the 9th 15,000; leaver after the 4th
    4,000; one absence 19,000; full month 20,000). Mutation-checked: counting the
    substitute day as a working day gives the old 14,285.71 / 3,809.52 / 19,047.62.
  - A schedule with Saturday work now counts its Saturdays in the divisor; it was
    Monday to Friday for everybody. Worth the PO knowing.
- **CW-048** passed review (the upload-file formatter is CW-085 #88, waits on the
  owner's e-Services sample). Open for the accountant (#36): "wage paid" for the
  filing, rounding, floor, nil month.

## Next

- Wait for the PO's review of CW-082.
- Do not start CW-083 or CW-085.
