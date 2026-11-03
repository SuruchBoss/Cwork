# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #145 (CW-101 to CW-107, the performance measurement, the
  dependency updates, the access-check work, the sign-in and session changes, the response
  cache header and the installer's secret handling), and the UX room's guide (#138).
- **On branch `claude/new-session-syszvt` (the PO opens the PR):**
  1. CW-108 (#146): the compare page's picker reads "เดือน (เลือกงวดไหนของเดือนก็ได้)" (Thai and
     English), the register's row number and days worked are aligned right, and the two HR
     guides name the box the same way (the pictures are not retaken);
  2. a refused sign-in is answered no sooner than `AUTH_REFUSED_SIGN_IN_MIN_MS` (default 150)
     after the request began (`RefusalPacer`, the clock is injected in tests);
  3. the no-store header is set by middleware for every route under the API prefix, refusals
     and unknown routes included;
  4. the web console shows a note on the sign-in page when a session has ended, the mobile
     app's note names the same reasons (the Flutter side is untested here), and the
     password-change endpoint says it ends every session.
- Counts: web 337; backend unit 866, domain 544; e2e 550.
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
