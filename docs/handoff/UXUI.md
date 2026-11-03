# UX/UI room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the UX/UI room stands. The older, longer write-up of the
30 Sep round is [`docs/handoff-uxui.th.md`](../handoff-uxui.th.md).

## Where things are

- **CW-094, top-menu redesign (direction B, earth tones), after Pilot A is installed.**
  The owner confirmed it in the PO room on 18 Oct. UX-20 to UX-25 are in the backlog.
  The primary colour is olive `#5b6b34`. Success states use teal `#24574a` on
  `#dcebe4`, always as a soft badge with a check icon; solid olive is kept for primary
  buttons. Links are dark olive `#46532a`; rust `#8a3c1e` is only for overdue and
  warnings. The dark-theme palette was sent to the PO room. Every text pair was
  checked against WCAG 4.5:1.
- The prototype is a private canvas owned by the project owner. Other rooms can open it
  only after the owner shares it.
- **CW-092 (PR #110), screen review passed on 18 Oct at `a930a07`.** The overdue badge
  now counts calendar days in the browser's time zone (the same one `formatDate` shows),
  is red, and the scanner-days empty state uses the clock icon. Merging is the PO's call.
- CW-091 (sidebar horizontal scrollbar) is on `main` via #109. Verified: at 1366 px the
  sidebar's `scrollWidth` equals its `clientWidth` for both Thai and English.

- **Blind test of the four HR jobs (CW-066 guide), 3 Nov.** Report:
  [`docs/qa/blind-test-2026-11-03.md`](../qa/blind-test-2026-11-03.md), with the CW-099
  register check. On `main` via #135. The PO opened CW-103 (#134), CW-105 (#136) and
  CW-106 (#137, single-scan days and clock-out-only days) from it.
- **CW-103 guide part, in review (#138).** `docs/guide/hr-daily-tasks.th.md` covers the
  sign-in and first 2FA setup, unregistered scanner numbers, single-scan days as CW-106
  made them (INCOMPLETE, counted in the import summary, a payslip warning for daily
  staff), the month compare step with a `รหัสพนักงาน` column (picture `hr-15`), and the
  no-payment warning. All guide pictures were taken again on `main` at `9a99475`.
- **CW-105 register printing, checked on #141 (`a1e460c`).** LibreOffice prints it
  landscape, one page wide, borders, centred group headings, rows 1-4 repeated on every
  page; the summary sheet adds up to the net. The register code has not changed since.

## Next

- Final blind test after the security fixes, CW-103 and CW-104: install with
  `deploy/nas/install.sh` in docker at 2 CPU and 2 GB (method in
  `docs/qa/performance-pilot-a.md`), with a new tester, noting every hesitation.
  Wait for the PO to say it is ready.
- Before UX-20 starts, re-read the backlog entries for CW-094 and answer the dev room's
  questions about the two APIs it needs. `GET /approvals/pending` (organisation-wide,
  with the approver) does not exist yet. The leave balance after approval already
  exists as `available` in `GET /leave/balances/:employeeId`.

## Open, not ours

- On the manager account, the employee and roster pages call `GET /api/v1/departments`
  and get 403 (console only; the pages still render). It was there before PR #110.
  Reported to the PO room.

## How to look at screens locally

- Run `npm run db:seed` with `SEED_PASSWORD`. The accounts use the shared TOTP secret
  read by `docs/demo/totp.mjs`.
- `cwork-demo.onrender.com` is blocked by the cloud room's network policy, so run
  `main` locally instead.
- `prisma migrate reset` is refused when Claude Code runs it; use
  `prisma migrate deploy` followed by `db:seed`.
- A fresh container has no pgvector: `apt-get install -y postgresql-16-pgvector`.
- `db:seed` pays every month up to last month. To test a parallel run on last month,
  seed a new database with the clock moved back (a `--require` preload that shifts `Date`).
- Stop the API by pid, never `pkill -f` (it matches the shell running the command).
