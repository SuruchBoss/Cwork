# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- CW-061, CW-089, CW-062 (cloud side) and CW-090 (#93) passed review. `#62` stays open
  for the real NAS: the owner has to approve `./check.sh` on it, and backups need a
  USB drive or another machine.
- **QA found four things; all four are done and wait for review.**
  - #94 + #95 (scanner days and a paid month): `lockedSet()` in
    `scanner-import.service.ts` now also treats a day as locked when the employee has
    a payslip in a PAID run whose period covers it (what `markPaid` locks, whether or
    not a record existed). A decision on it is `422 DAY_LOCKED` and a file adds no
    punch. Locked days leave the default WAITING list and `totals.waiting` and have a
    `LOCKED` filter ("Payroll has used it") in the API and the console. E2E in
    `scanner-import.e2e-spec.ts` (last block, year 2038); the new cases fail without
    the fix. QA's S15 can be run again.
  - #96: `check.sh` reads `/proc/net/tcp` when `ss` and `netstat` are missing and warns
    when it cannot tell. Checked against a real listener here.
  - #97: new `deploy/nas/change-address.sh`; Thai guide has the authenticator and
    recovery-code step, the true effect of an address change (the authority does not
    change) and a `PATH` for the Task Scheduler line; `install.sh` text fixed. The
    script was run against a stand-in `docker` (the recreate itself is what QA saw work);
    nothing here was run on a Synology.
- **CW-065 (#68), add one employee from the console, is built and waits for review.**
  `/employees/new` (`EmployeeCreatePage`, rules in `new-employee.ts`), same route and
  checks as the import; `POST /employees` takes an optional `bankAccount` (encrypted)
  and refuses a probation before the hire date. Offering a sign-in waits for CW-064.
- Full e2e 433, web 249 passed; doc counts updated.
- Waiting on others: CW-085 (#88) needs the owner's redacted sample file; CW-080 and
  CW-086 (#89) are not queued.

## Next

- CW-073 (#78): passports and work permits expiring in 30/60/90 days, one notice per
  band, no document numbers in the list or the notice. Start it once the PO has said
  the four fixes and CW-065 are accepted.
- Do not start CW-085, CW-080 or CW-086, nor the support-scope page. Do not touch the
  real NAS until the owner approves.
