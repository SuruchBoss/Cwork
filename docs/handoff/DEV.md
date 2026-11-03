# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #143 (CW-101 to CW-107, the performance measurement, the
  dependency updates and the access-check work).
- **On branch `claude/new-session-syszvt` (the PO opens the PR):** the small items left from
  the review round, each with its own tests:
  1. sign-in answers the same for an address with no account and one with (a stand-in hash
     is checked, failures are counted and the same wait applies);
  2. signing out, ending a session from another device, or changing the password stops its
     access token at once (`sessionIsLive`, cached with the signed-in user);
  3. every API response carries `Cache-Control: private, no-store` unless it sets its own;
  4. `deploy/nas/install.sh` takes the database password and the saved key from a file, the
     environment or a hidden prompt; the old options still work and warn.
- Counts: web 330; backend unit 856, domain 544; e2e 539.
- The Flutter app was not audited for dependency advisories (no toolchain here).

## Next (the PO's order)

1. Wait for the PO's review of the branch above.
2. CW-101 asks the PO for one decision from the owner: issue #36, which month a 14-day period that
   spans two months counts toward. `monthCountedFor` in `domain/pay-period.ts` is the only place to
   change, and the one e2e case that pins the month of the spanning period
   (`payroll-biweekly.e2e-spec.ts`, the period starting 19 December) with it.
3. CW-100 (#124): waits for the statute text. The two research questions (which month a
   straddling period counts for; whether the employee's share may be taken once a month) are
   research only, no code.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
