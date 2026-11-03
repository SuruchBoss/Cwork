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
- **Install gate (2026-11-03, main `147829f`):** asked by the PO room. Regression S1–S17 and P1–P13 pass on a rebuilt database; N, G and D cases not re-run (reasons in the plan). New cases: daily wage 372 × 23 → social security 428 passes; the monthly parallel run with both kinds of staff fails (#127); CW-099 (PR #126) passes on main `2c47dac` (API); CW-100 is Blocked until merged. Security review done: results and method in the plan under "Install gate"; the findings themselves went to the PO room as advisory drafts, not into the repository.
- **Open issues for the dev room:** #127 (parallel run with daily staff), #129 (three 500s), #130 (Google Fonts), #131 (`zod` advisory). Earlier ones (#94–#97, #112–#115, #119) are fixed and verified.
- **PR:** the gate results are on branch `claude/qa-pilot-a-gate`, for the PO to review and merge.
- **Not covered:** #111 (CW-095) landed after pass 2 began; the demo's wake-up
  time on Render (the owner times it); DSM and the real NAS.
- **Re-test of the items fixed in PR #139 (2026-11-03):** done on the branch, closed; items outside that PR remain.
- **Final regression (2026-11-03, main `14fb65d`):** passed; details in the plan under "Final regression before install". The document-issue path was included.
- **Next:** CW-100 when it lands, the CW-099 button in the console, the G1–G4 browser tasks in the blind test on the installed stack, and each private finding as the PO says its fix is in. A real-NAS pass (N1–N3, N11, DSM) needs someone with DSM access and the owner's approval.

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

- The PO: review and merge of the gate PR; which reported items are ready to re-test.
- CW-100 to be merged.
- The owner: the real NAS.
