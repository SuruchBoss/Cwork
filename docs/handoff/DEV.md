# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #153 (CW-101 to CW-110) and, when #154 merges, CW-111.
- **CW-115, in the working tree, not pushed (waits for #154 to merge):** "these days only" takes a
  first and last day inside the waiting stretch (`from`/`to` on `POST /attendance/scanner/unmapped/bind`),
  `GET /attendance/scanner/unmapped/bind-preview` counts the days and how many the person already has
  scans for under another number (the page warns), and a period that has ended can be made shorter
  through the same end/preview/confirm/payroll-run refusal (`planEnd` limits itself to the days between
  the new and the old end). Left open: whether a day with scans from two numbers of one person should
  wait for HR instead of counting both; it is only warned about at binding time (a bigger change to
  the day statuses, to be a ticket of its own if the PO wants it).
- CW-112 waits behind CW-115 on a local branch (`blind-round`): see its commits. Counts there differ
  and are reconciled on merge.
- Counts: web 374; backend unit 903, domain 558; e2e 591.
- The Flutter app was not audited for dependency advisories (no toolchain here).

## Next (the PO's order)

1. Wait for the PO's review of the branch above, then CW-110 (public bugs, wording as in its
   issue), then CW-109 (a scanner number bound for a period; the PO's decisions are in the
   backlog).
2. CW-101 asks the PO for one decision from the owner: issue #36, which month a 14-day period that
   spans two months counts toward. `monthCountedFor` in `domain/pay-period.ts` is the only place to
   change, and the one e2e case that pins the month of the spanning period
   (`payroll-biweekly.e2e-spec.ts`, the period starting 19 December) with it.
3. CW-100 (#124): waits for the statute text. The two research questions (which month a
   straddling period counts for; whether the employee's share may be taken once a month) are
   research only, no code.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
