# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #155 (CW-101 to CW-111, CW-115).
- **CW-112 is PR #156**, together with **CW-118** (test-only apart from the demo seed): the per-number
  lock on ending a number; Approve/Record payment shown closed with the reason; Thai wording for
  three answers; own-leave preview refused as the submit is; waiting runs marked and the dashboard
  card opens them (`?waiting=me`); the installer wording; the UX items from the blind rounds.
- **CW-118:** specs that file leave no longer count "today plus N" days. They use the organisation's
  calendar day and ask the leave calendar for a working day (`test/utils/leave-days.ts`), so they do
  not fail on the weekday when N lands on a weekend, nor when a run crosses midnight between two
  specs. `scanner-import` empties the scanner ledger first (`emptyScannerLedger`) because it counts
  whole tables. The demo seed (`demo-activity.ts`) dates its leave, expenses and payroll by the
  organisation's day.
- Known, outside CW-112: a shift that crosses midnight is not supported by punches or scanner days
  (CW-114 is the ticket).
- Counts: web 390; backend unit 903, domain 558; e2e 593.
- The Flutter app was not audited for dependency advisories (no toolchain here).

## Next (the PO's order)

1. #156 (CW-112 + CW-118) waits for CI and QA; then whatever the PO sends next.
2. CW-101 asks the PO for one decision from the owner: issue #36, which month a 14-day period that
   spans two months counts toward. `monthCountedFor` in `domain/pay-period.ts` is the only place to
   change, and the one e2e case that pins the month of the spanning period
   (`payroll-biweekly.e2e-spec.ts`, the period starting 19 December) with it.
3. CW-100 (#124): waits for the statute text. The two research questions (which month a
   straddling period counts for; whether the employee's share may be taken once a month) are
   research only, no code.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
