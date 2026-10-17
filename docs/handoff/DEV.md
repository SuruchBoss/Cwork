# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- CW-061 (#61), the fingerprint scanner import, is built and pushed; waiting on
  review. **Time & leave → Scanner days** (`/attendance/scanner`, needs
  `attendance:manage`, refused to a department-limited user). Backend:
  `backend/src/modules/attendance/scanner-import.service.ts` (+ controller,
  DTOs), the pure file and day rules in `domain/scanner-export.ts`, tables
  `scanner_imports`, `scanner_days`, `scanner_day_decisions`,
  `scanner_punch_links` (migration `20261017100000_scanner_import`). Web:
  `web/src/features/attendance/ScannerImportPage.tsx`, `ScannerReviewPage.tsx`.
  Guide: `docs/guide/scanner-import.th.md`; API in `docs/api.md`; privacy note in
  `docs/security.md`.
- How it works: the file is read by its byte-order mark, never its extension.
  Two times = counted (first in, last out); none = no punch; one, or three or
  more = waits for HR; an unregistered scanner number is listed apart, not an
  error. HR's decision is stored beside the raw times and only applies while the
  day has the times it was made about. Counted times are ordinary `BIOMETRIC`
  punches (key `scan:{number}:{date}:{HH:mm}:IN|OUT`, so a re-import adds only
  what is new); a punch that stops counting is marked on its link and every
  reader of punches leaves it out through `ACTIVE_PUNCH`
  (`attendance/active-punch.ts`). A day payroll has used is not touched.
- Known limits, not guessed: shifts, lateness, overtime and shifts across
  midnight are not worked out from scanner times; an employee who already has a
  scanner number cannot be given another from the review card, and the employee
  page has no scanner-number field (set it in the employee import or by API).
- Acceptance on the pilot's real export is run by the owner on their own
  machine; no real or real-derived file is in the repo (`.gitignore` refuses
  `Export*.xls`, `Export*.XLS`, `Export*.txt`).
- Waiting on others, nothing for the dev room to start: the owner (support
  channel/hours for CW-087's page, the pilot's blank paper form, the accountant's
  answer); CW-085 (#88) needs the owner's sample file; CW-080, CW-086 (#89) are
  not queued.

## Next

- After CW-061 passes review, the PO's order is CW-089 (#92: accountant monthly
  summary, e-Filing comparison, parallel run), then CW-062 (#62: three Synology
  installers; do not touch the real NAS until the owner approves). Wait for the
  PO to queue them. Do not start CW-085, CW-080, CW-086 or the support-scope page.
