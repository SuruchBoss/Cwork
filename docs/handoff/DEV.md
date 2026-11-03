# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #153 (CW-101 to CW-110) and, when #154 merges, CW-111.
- **CW-115 (local, pushed after #154 merges):** "these days only" takes a first and last day inside
  the waiting stretch (`from`/`to` on `POST /attendance/scanner/unmapped/bind`),
  `GET /attendance/scanner/unmapped/bind-preview` counts the days and how many the person already
  has scans for under another number (the page warns), and a period that has ended can be made
  shorter through the same end/preview/confirm/payroll-run refusal (`planEnd` limits itself to the
  days between the new and the old end). Left open: whether a day with scans from two numbers of
  one person should wait for HR instead of counting both; it is only warned about at binding time.
- **CW-112 (local, pushed after CW-115 merges):** all items done: the per-number lock on ending a
  number; Approve/Record payment shown closed with the reason; Thai wording for three answers;
  own-leave preview refused as the submit is; waiting runs marked and the dashboard card opens
  them (`?waiting=me`); the pre-approval box no longer repeats its heading; the installer wording;
  and the four UX items (what an end did, a plain no-number state, "Register this number" asking
  first, a Thai employment-type label), plus UXUI's three after #155's test (the row starts over after saving and dates in refusals read as Thai dates, "from now on" closed with a reason for someone who has a number, labels on the two date fields). The dismissible parallel-run notice was cut by the PO.
- Known, outside CW-112: a shift that crosses midnight is not supported by punches or scanner days
  (CW-114 is the ticket).
- Counts: web 390; backend unit 903, domain 558; e2e 593.
- The Flutter app was not audited for dependency advisories (no toolchain here).

## Next (the PO's order)

1. When the PO says #154 (CW-111) is merged: merge main into `cw115`, push it (one PR), tell the PO.
   Then CW-112 (four UX items still to do), pushed after CW-115 merges.
2. CW-101 asks the PO for one decision from the owner: issue #36, which month a 14-day period that
   spans two months counts toward. `monthCountedFor` in `domain/pay-period.ts` is the only place to
   change, and the one e2e case that pins the month of the spanning period
   (`payroll-biweekly.e2e-spec.ts`, the period starting 19 December) with it.
3. CW-100 (#124): waits for the statute text. The two research questions (which month a
   straddling period counts for; whether the employee's share may be taken once a month) are
   research only, no code.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
