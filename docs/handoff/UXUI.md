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
- **CW-092 (PR #110, `claude/new-session-syszvt`), screen review done 18 Oct.** It
  passes, except for one fix requested before merge: the "overdue by N days" badge
  counts 24-hour blocks (`Math.ceil` in `web/src/features/approvals/overdue.ts`), so a
  task due on 4 Oct reads "15 days" on 18 Oct. It should count calendar days in the
  company's time zone.
- CW-091 (sidebar horizontal scrollbar) is on `main` via #109. Verified: at 1366 px the
  sidebar's `scrollWidth` equals its `clientWidth` for both Thai and English.

## Next

- Re-check only the overdue badge once the dev room pushes the fix to PR #110.
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
