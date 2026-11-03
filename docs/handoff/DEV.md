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
     one migration (`20261103120000_payroll_run_calculated_by`), and a neutral CHANGELOG line.
- Counts: web 322; backend unit 809, domain 509; e2e 487 (two new specs).
- The Flutter app was not audited for dependency advisories (no toolchain here).

## Next (the PO's order)

1. After #128 merges: restart the branch from main, bring the two items above, push, tell the PO
   so the PR can be opened for review before QA retests.
2. CW-102: where the scanner import spends its time (about 10 ms a line, 41 s for 200 people);
   record it in the ticket first, then bring it to 10 s or show progress.
3. CW-101 (#125): the 14-day pay cycle for daily wages. The month-counting rule goes in one
   function. No single-period deduction option until the owner approves.
4. CW-100 (#124): waits for the statute text. The two research questions (which month a
   straddling period counts for; whether the employee's share may be taken once a month) are
   research only, no code.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
