# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #141 (CW-101 to CW-106, the performance measurement, the
  dependency updates and the access-check work), all retested by QA.
- **On branch `claude/new-session-syszvt` (the PO opens the PR):** three items from the PO,
  each with its own tests:
  1. a request for another person's tax declaration answers "not found" (404);
  2. the RecordLeavePanel test pastes the note instead of typing it and checks accessibility
     in its own test (timeouts untouched);
  3. CW-107 (#142): the register export and the comparison stop, in Thai, when the month has
     monthly-salaried staff and no monthly period (`hasMonthlyStaff`, `reconciled-period.ts`).
- Counts: web 330; backend unit 843, domain 539; e2e 523.
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
