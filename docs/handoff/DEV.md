# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #126 (CW-099 the payroll register).
- **#128** (dependency updates, the 8,556 social security test, the e2e count): open, all checks
  green on the latest run, waiting for the PO to merge.
- **On branch `claude/new-session-syszvt` (pushed; the PO opens the PR or PRs):** commits in this
  order, each with its own tests:
  1. the Pilot A performance measurement, `docs/qa/performance-pilot-a.md`;
  2. the access-check changes (ADV-1 to ADV-7), one migration (`..._payroll_run_calculated_by`);
  3. CW-102 (#133): the scanner import reads and writes in groups; 200 people took 4.1 s in the
     2 CPU / 2 GB stack, 41.5 s before (no migration);
  4. CW-101 (#125): 14-day periods, `BIWEEKLY`, one migration (`..._biweekly_pay_periods`), the month
     rule in one function (`monthCountedFor`, provisional: the month the period is paid in);
  5. CW-106 (#137): a past day with one scan is INCOMPLETE; the import summary counts them;
  6. CW-105 (#136): the register's summary row, Thai refusal, print setup and borders;
  7. CW-103 + CW-104 (#134, #127): the compare page reads the calendar month and HR's own register
     (title and stacked headings, total row skipped, code column asked for); the second half, and a
     later 14-day period, is calculated once the earlier ones are **approved**; the claims an approved
     run pays are held for it (`payrollRunId`), released if it is cancelled.
  The six commits before CW-106 were pushed first; CW-103 to CW-106 are stacked on them because a
  single branch cannot carry separate PRs. CW-106, 105 and 103/104 do not depend on CW-102 or CW-101.
- Counts: web 329; backend unit 843, domain 539; e2e 519.
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
