# QA room — current state

Overwritten at the end of each unit of work. Git history keeps the past.

## Where things are

- **Current pass:** Pilot A, October 2026. The plan, cases and results table
  are in [`docs/qa/pilot-a-2026-10.md`](../qa/pilot-a-2026-10.md): CW-061
  scanner import, CW-089 accountant export and checks, CW-062 NAS installer.
- **Status:** not started. No QA room has run yet.

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

- Nobody. Report to the PO room when the pass is done or blocked.
