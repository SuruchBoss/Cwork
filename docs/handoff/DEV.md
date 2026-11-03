# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #126 (CW-099 the payroll register).
- **#128** (dependency updates, the 8,556 social security test, the e2e count): open, all checks
  green on the latest run, waiting for the PO to merge.
- **On branch `claude/new-session-syszvt`, not pushed until #128 merges:**
  1. the Pilot A performance measurement, `docs/qa/performance-pilot-a.md`;
  2. a set of access-check changes (tickets ADV-1 to ADV-7 of the PO's list), with their tests,
     one migration (`20261103120000_payroll_run_calculated_by`), and a neutral CHANGELOG line;
  3. CW-102 (#133): the scanner import reads and writes in groups; 200 people took 4.1 s in the
     2 CPU / 2 GB stack, 41.5 s before;
  4. CW-101 (#125): 14-day periods, `BIWEEKLY`, with a migration (`20261103130000_biweekly_pay_periods`,
     the check on `half`), the month rule in one function (`monthCountedFor`, provisional: the month
     the period is paid in), the monthly outputs adding a month's periods and waiting for the last,
     and the web form and pay card to set it up. Not built, by the PO's decision: any option to
     take the contribution once a month.
- Counts: web 326; backend unit 829, domain 529; e2e 502.
- The Flutter app was not audited for dependency advisories (no toolchain here).

## Next (the PO's order)

1. After #128 merges: restart the branch from main, bring the items above, push, tell the PO
   so the PR can be opened for review before QA retests.
2. CW-101 asks the PO for one decision from the owner: issue #36, which month a 14-day period that
   spans two months counts toward. `monthCountedFor` in `domain/pay-period.ts` is the only place to
   change, and the one e2e case that pins the month of the spanning period
   (`payroll-biweekly.e2e-spec.ts`, the period starting 19 December) with it.
3. CW-100 (#124): waits for the statute text. The two research questions (which month a
   straddling period counts for; whether the employee's share may be taken once a month) are
   research only, no code.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
