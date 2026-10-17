# QA room — current state

Overwritten at the end of each unit of work. Git history keeps the past.

## Where things are

- **Current pass:** Pilot A, October 2026. The plan, cases and results table
  are in [`docs/qa/pilot-a-2026-10.md`](../qa/pilot-a-2026-10.md): CW-061
  scanner import, CW-089 accountant export and checks, CW-062 NAS installer.
- **Status:** pass 1 finished 2026-10-17. 41 of 41 cases run, all pass; CW-062 on stand-in images, N11 with notes. Issues #94–#97 are open for the dev room (none is a security problem). The results table and how it was run are at the end of the plan.
- **Next:** when the dev room fixes #94/#95, re-test S15. When the owner approves the real NAS, someone with DSM access repeats N1–N3, N11 there; the real Dockerfile builds still need a machine with internet.

## How to start

1. Read the plan above, then only the guides and files it names.
2. Run the stack the way the dev room does (`docs/handoff/DEV.md`, README
   "Try it in five minutes"). Containers in a cloud room have no internet, so the real
   Dockerfiles do not build here; CI builds them.
3. Generate synthetic files with a script kept outside the repository, or
   under `backend/test/fixtures/` if it is worth keeping as a regression test.
4. Fill in the results table as you go and commit it.

## Rules

- Synthetic data only. Nothing from the pilot company, ever.
- Nothing touches the pilot's NAS or network.
- Failures are GitHub issues; security problems go to the PO, not an issue.
- No fixes in this room: the dev room fixes, QA re-tests.

## Waiting on

- The dev room (issues #94–#97) and the owner (real NAS).
