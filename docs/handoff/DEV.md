# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #156 (CW-101 to CW-115, CW-118). CW-112 and CW-118 merged as #156.
- **CW-119 is PR #157** (waiting for CI): the remaining specs take their dates from `calendarToday()`
  and `firstWorkingDay()` (`test/utils/leave-days.ts`), and `npm run verify:spec-dates` (a CI step after
  `verify:sql`) fails when a spec turns the UTC clock into a calendar date; a line that is right on
  purpose says `// utc-ok: why`. The check reads lines, so it catches the usual shapes, not every one.
- Lessons from CW-118: `scanner-import` counts whole tables, so it starts with `emptyScannerLedger`
  and reads only the audit entries written after it began (audit is append-only and shared); the demo
  spec resets the whole database mid-run, so a local ordered run must put it first to mean anything.
- The demo seed (`demo-activity.ts`) dates leave, expenses, payroll and the review cycle by the
  organisation's day.
- Known, outside CW-112: a shift that crosses midnight is not supported by punches or scanner days
  (CW-114 is the ticket).
- Counts: web 390; backend unit 903, domain 558; e2e 593.
- The Flutter app was not audited for dependency advisories (no toolchain here).

## Next (the PO's order)

1. #157 (CW-119) waits for CI; then whatever the PO sends next.
2. CW-101 asks the PO for one decision from the owner: issue #36, which month a 14-day period that
   spans two months counts toward. `monthCountedFor` in `domain/pay-period.ts` is the only place to
   change, and the one e2e case that pins the month of the spanning period
   (`payroll-biweekly.e2e-spec.ts`, the period starting 19 December) with it.
3. CW-100 (#124): waits for the statute text. The two research questions (which month a
   straddling period counts for; whether the employee's share may be taken once a month) are
   research only, no code.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
