# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main` (482d405): everything up to #153: CW-101 to CW-110, including the blind-test
  fixes, CW-110's scan prefill and dashboard, and CW-109 (a scanner number bound for a period,
  with its race fixes).
- **On branch `claude/new-session-syszvt` (the PO opens the PR):** CW-111. The nightly
  attendance close-out now closes the day before `organizationToday()` (Asia/Bangkok), not
  the day before the UTC date. A unit spec pins the clock (01:00 Bangkok, just before midnight
  UTC, a UTC-timezone org, month and year ends) and an e2e case runs the job on a fixed date.
- Next: CW-112, one PR at a time, starting with ending a scanner number taking the same
  per-number lock as binding one, then payroll actions the user cannot take shown closed with
  a reason.
- One small wording nit, not urgent: the installer's source line reads "database password:
  from made new by this installer"; smooth it the next time the installer is touched.
- Counts: web 375; backend unit 903, domain 558; e2e 586.
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
