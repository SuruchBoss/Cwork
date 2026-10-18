# QA room — current state

Overwritten at the end of each unit of work. Git history keeps the past.

## Where things are

- **Current pass:** Pilot A, October 2026. The plan, cases and results tables
  are in [`docs/qa/pilot-a-2026-10.md`](../qa/pilot-a-2026-10.md): CW-061
  scanner import, CW-089 accountant export and checks, CW-062 NAS installer,
  and "Pass 2" at the end.
- **Status:** pass 1 (2026-10-17) and pass 2 (2026-10-18, main `9baa043`) are
  finished. Pass 2 re-ran all 41 cases (all pass; CW-062 on stand-in images) and
  added the HR guide's four tasks (CW-066), the demo's second boot (#104), the
  approvals switch (#109), the sidebar, empty states, overdue badge and dark
  theme (#110). One failure: dark-theme contrast, #113.
- **Re-test of #112–#115 (main `4b78ff0`, 2026-10-18):** #113, #114 and #115 pass; #112 passes except the range error on the scanner days page, still English: #119. Results in the plan under "Pass 2 re-test".
- **Open issues for the dev room:** #112 English errors in the Thai console (mostly fixed; #119 is what is left),
  #113 dark-theme button contrast (the failing case), #114 cash sheet header and
  printed project note, #115 `ErrorState` glyph and guide wording. None is a
  security problem. #94–#97 from pass 1 are fixed and verified.
- **PR:** the re-test results are on branch `claude/qa-pass2-retest`, for the PO to review and merge (pass 2 itself is merged).
- **Not covered:** #111 (CW-095) landed after pass 2 began; the demo's wake-up
  time on Render (the owner times it); DSM and the real NAS.
- **Next:** when the dev room fixes #119, re-test it (Thai page, range over 93 days). When the
  owner approves the real NAS, someone with DSM access repeats N1–N3 and N11
  there; the real Dockerfile builds still need a machine with internet.

## How to start

1. Read the plan above, then only the guides and files it names.
2. Run the stack the way the dev room does (`docs/handoff/DEV.md`, README
   "Try it in five minutes"). Containers in a cloud room have no internet, so the real
   Dockerfiles do not build here; CI builds them.
3. To try the demo locally: `DEMO_MODE=true node dist/modules/demo/demo-main.js`
   against an empty database whose owner role is named `cwork_demo`, with
   `METRICS_PORT` moved if another API is already running.
4. Generate synthetic files with a script kept outside the repository, or
   under `backend/test/fixtures/` if it is worth keeping as a regression test.
5. Fill in the results table as you go and commit it.

## Rules

- Synthetic data only. Nothing from the pilot company, ever.
- Nothing touches the pilot's NAS or network.
- Failures are GitHub issues; security problems go to the PO, not an issue.
- No fixes in this room: the dev room fixes, QA re-tests.

## Waiting on

- The PO, to review and merge the re-test PR.
- The dev room (#119; CW-097 for the dark-theme danger red) and the owner (real NAS).
