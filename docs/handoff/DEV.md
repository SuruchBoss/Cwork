# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- **CW-084** (#87, social security as the official form says): done, waiting
  for the PO's review. `computeSocialSecurity` in `payroll/domain/thai-tax.ts`
  is the one function for a person's monthly contribution: wage, floor and
  ceiling for the period's year, rounded half up to the baht, employer the same,
  nil when nothing was paid. A first half takes 5% of its own wage in whole baht
  with no floor; a second half is the month less the first. Approved and paid
  runs are never recalculated (`PAYROLL_RUN_LOCKED` already refuses it), so a
  month paid before this stays in satang and the shortfall report shows the
  difference. Source cited in `docs/payroll-thailand.md`: the 2025 gazette
  announcement on the form (vol. 142, special 405 Ngor, pp. 23-27). Three
  questions for the accountant are in #36.
- **CW-048** (#45, monthly social security filing) is next and part built, on the
  local branch `wip-cw048` (not pushed): the pure filing domain, the service
  (`sso-filing.service.ts`, month-finished check, identifier rules, audit, CSV
  and XLSX), the route `GET /payroll/reports/sso-filing`, an e2e spec and the web
  page. It still has to be rebased onto CW-084 so it uses `computeSocialSecurity`
  (a month with no wage is listed with nil, per note 6 of the form), then
  gates, docs and a report. The upload-file formatter waits for the owner's
  sample file from e-Services; no public layout was found.
- Earlier: CW-071 passed review (printing); CW-082 (#85) is open, not queued.

## Next

- Wait for the PO's review of CW-084, then finish CW-048 from `wip-cw048`.
