# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #153 (CW-101 to CW-110, CW-109 included) and the QA/PO notes after it.
- CW-111 (the nightly close-out closes the day that just ended) is on branch
  `claude/new-session-syszvt`, in review with the PO. Its tests: a unit spec with the clock fixed,
  and `test/scheduler-quiet` and `test/attendance-close-out` (a day closed absent is put right
  by a scanner file imported afterwards).
- **CW-112, in the working tree, not pushed (waits for CW-111 to merge):** ending a scanner number
  takes the per-number lock; Approve/Record payment shown closed with the reason; Thai wording for
  the three answers; own-leave preview refused as the submit is; waiting runs marked and the
  dashboard card opens them (`?waiting=me`); the pre-approval box no longer repeats its heading;
  the installer wording. Not done: "the parallel-run notice can be dismissed for the session"
  (the only such notice is a box inside the payment question, which is not shown on every visit:
  asked the PO which notice is meant).
- Known, outside CW-112: a shift that crosses midnight is not supported by punches or scanner days
  (a punch belongs to the calendar day it is made; the scan out in the morning is a lone scan of
  the next day). Reported to the PO, not changed.
- Counts: web 379; backend unit 903, domain 558; e2e 589.
- The Flutter app was not audited for dependency advisories (no toolchain here).

## Next (the PO's order)

1. When the PO says CW-111 is merged: merge main into the working branch, push CW-112 (one PR), tell
   the PO. Then ask which "parallel-run notice" CW-112 means, and whether the pilot has shifts that
   cross midnight.
2. CW-101 asks the PO for one decision from the owner: issue #36, which month a 14-day period that
   spans two months counts toward. `monthCountedFor` in `domain/pay-period.ts` is the only place to
   change, and the one e2e case that pins the month of the spanning period
   (`payroll-biweekly.e2e-spec.ts`, the period starting 19 December) with it.
3. CW-100 (#124): waits for the statute text. The two research questions (which month a
   straddling period counts for; whether the employee's share may be taken once a month) are
   research only, no code.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
