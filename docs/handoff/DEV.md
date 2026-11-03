# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #147 (CW-101 to CW-108, the performance measurement, the
  dependency updates, the access-check work, the sign-in and session changes, the response
  cache header and the installer's secret handling), and the UX room's guide (#138).
- **On branch `claude/new-session-syszvt` (the PO opens the PR):** the round of fixes after the
  blind test of 09fc821 that is public in wording:
  1. a scanner day that belongs to the person deciding it is left to another holder of the
     attendance permission (API answer in Thai, buttons closed on that row); where nobody else
     holds it the person may decide, and the decision is marked, listed on the payslip and
     audited;
  2. approving a run that includes the approver's own payslip asks first and is audit-logged;
  3. approving a run and recording its payment each ask one question first (a shared
     `ConfirmDialog`); the payment one says it cannot be undone.
  Recording leave as approved for oneself was already refused (`CANNOT_RECORD_OWN_LEAVE`).
- One small wording nit, not urgent: the installer's source line reads "database password:
  from made new by this installer"; smooth it the next time the installer is touched.
- Counts: web 348; backend unit 881, domain 548; e2e 562.
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
