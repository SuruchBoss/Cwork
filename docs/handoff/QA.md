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
  theme (#110). One failure then: dark-theme contrast, #113 (fixed since).
- **Re-tests (main `d08c985`, 2026-10-18):** #112–#115 pass and so does #119 (the range error is Thai in the Thai console, English unchanged). CW-097 passes: danger button and sidebar count 6.74:1 in the dark theme, 0 low-contrast nodes on seven pages. Results in the plan under "Pass 2 re-test" and "Pass 2 re-test of #119 and CW-097". The payroll warning wording ("การ์ดค่าจ้าง" / "Pay card") was checked from source, not rendered.
- **Open issues for the dev room:** none from this room. #94–#97 and #112–#115, #119 are fixed and verified.
- **PR:** the #119 / CW-097 re-test is on branch `claude/qa-119-retest`, for the PO to review and merge.
- **Not covered:** #111 (CW-095) landed after pass 2 began; the demo's wake-up
  time on Render (the owner times it); DSM and the real NAS.
- **Next:** nothing is waiting on this room. When the owner approves the real NAS,
  someone with DSM access repeats N1–N3 and N11 there; the real Dockerfile builds
  still need a machine with internet.

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

- The PO, to review and merge the #119 / CW-097 re-test PR.
- The owner (real NAS).
