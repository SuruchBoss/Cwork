# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #111 (CW-095, the department filter that no longer asks
  `/departments` without `org:read`).
- **On branch `claude/new-session-syszvt`, restarted from main `43820ee` (CW-096, pushed, the PO
  opens the PR):** the four QA pass 2 issues in one branch, in the PO's order.
  1. #114 cash sheet: the red pilot note is gone from `cash-sheet.ts` and the renderer (and from the
     printing guide's wording); the "ลำดับ" column is 36 pt, and a renderer test measures every
     heading with the real font so none breaks.
  2. #113 dark primary buttons: text on `--brand` fills (`.btn--primary`, `.sidebar__logo`, the
     date-input day, the user chat bubble) uses `--text-inverse`, white in light and `#0f1116` in
     dark (7.2:1; hover 9:1). `styles/__tests__/theme.test.ts` checks the ratio of each theme's
     pair and that those four rules use the token.
  3. #112 scanner errors in Thai: `web/src/lib/api-messages.ts` maps the scanner flow's codes to
     message keys, filled from the error's `details`; both scanner pages use it. The backend now
     sends `{employeeCode, scannerNumber}` for `EMPLOYEE_HAS_SCANNER_NUMBER` and
     `DUPLICATE_SCANNER_ID`, and `max` for `RANGE_NOT_SUPPORTED` (e2e checks the first).
  4. #115 `ErrorState` draws the new `alert` icon; guide task 3 says card "ค่าจ้าง" and the button
     "เปลี่ยนค่าจ้าง" when pay exists.
- Not touched, and worth the PO's eye: the danger button and the nav badge are also white on a light
  fill in the dark theme (about 2.8:1); and a few Thai warnings in `messages.th.ts` (payroll run
  messages) still send HR to "หัวข้อค่าตอบแทน" on the employee page, where the card is called
  "ค่าจ้าง".
- Counts: web 313, backend unit 788 (README, README.th, `docs/spec.md`, `verify-doc-counts.ts`).
- **Not built, by the PO's decision:** pinned footer / 36 px rows of CW-091 and the "Report a
  problem" icon of CW-092 (direction B removes the left menu, built after the Pilot A install).
- Waiting on others: CW-066's two owner items (a real HR person doing the four jobs before
  31 October; a second person who may approve a payroll run); CW-085 upload file needs the
  e-Services layout; CW-080 and CW-086 (#89) are not queued.

## Next

- PO opens the CW-096 PR, reviews and merges; QA retests the four issues. Do not start CW-094
  (direction B, after the Pilot A install), CW-085's upload file, CW-080 or CW-086, nor the
  support-scope page. Do not touch the real NAS until the owner approves.
