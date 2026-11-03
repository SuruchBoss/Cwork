# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #147: CW-101 to CW-108, the performance measurement, the
  dependency updates, the access-check work, the sign-in and session changes, the response
  cache header, the installer's secret handling (the full install uses the password it is
  given), and the UX room's guide (#138). Nothing of the dev room is open.
- Waiting on the QA retest and the UX room's blind test; the PO sends the next piece of work.
- One small wording nit, not urgent: the installer's source line reads "database password:
  from made new by this installer"; smooth it the next time the installer is touched.
- Counts: web 337; backend unit 875, domain 544; e2e 550.
- The Flutter app was not audited for dependency advisories (no toolchain here).

## Next (the PO's order)

1. Wait for the PO's next piece of work.
2. CW-101 asks the PO for one decision from the owner: issue #36, which month a 14-day period that
   spans two months counts toward. `monthCountedFor` in `domain/pay-period.ts` is the only place to
   change, and the one e2e case that pins the month of the spanning period
   (`payroll-biweekly.e2e-spec.ts`, the period starting 19 December) with it.
3. CW-100 (#124): waits for the statute text. The two research questions (which month a
   straddling period counts for; whether the employee's share may be taken once a month) are
   research only, no code.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
