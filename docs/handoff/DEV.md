# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- **CW-071** (#74, printable payslips and a wage receipt): done, waiting for
  the PO's review.
  - `documents/payslip-sheet.ts` is the pure model (what a slip and the receipt
    say, `payslipDiscrepancy`, `payslipNotes`); `documents/payslip-renderer.ts`
    draws it with pdfkit and Sarabun: 1/2/4 to an A4 sheet, a font ladder
    (10 → 7pt), a slip that will not fit its cell gets a page of its own.
  - `payroll/payslip-print.service.ts` loads the run, refuses unless the run is
    APPROVED or PAID and every slip adds up, and audits each print as `EXPORT`
    on the `PayrollRun`. Routes are on `PayrollController` under
    `runs/:id/print/payslips`, `runs/:id/print/receipts`, `payslips/:id/print`,
    all `payroll:read`.
  - Web: a print card on the run page (layout choice, two buttons, disabled
    until approval). Thai guide `docs/guide/printing-payslips.th.md`.
- Walked on a fresh `db:init` install in a real browser: the holidays page and
  the run page. The walk found two defects on the holiday page (cramped side
  column; the automatic Monday-to-Friday note shown beside HR's own substitute),
  both fixed in this unit.
- Earlier: CW-081 (#84) and CW-076 (#81) passed review; CW-082 (#85, monthly
  proration on the work calendar) is open and not queued.

## Decisions for the PO to check

- Only `payroll:read` prints. An employee cannot print their own slip; if the
  pilot wants that it is a separate ticket (the slip is theirs, but a print is
  audited as an export).
- The payslip's `warnings` are for HR, so only `SUBSTITUTE_HOLIDAY` is printed,
  as a note. Rest-day rate notes and the like stay off the slip.
- "Matches the screen" is tested against the payslip record the API returns
  (`GET /payroll/payslips/:id`): the console has no payslip detail page, only the
  run's summary table.
- The receipt's statement line is a template; the accountant should confirm the
  wording (asked in #36).

## Next

- Wait for the PO's review of CW-071; then whatever the PO queues.
