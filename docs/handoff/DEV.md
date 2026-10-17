# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- CW-061 (#61), CW-089 (#92) and CW-062 (#62, cloud side) passed review. `#62`
  stays open for the real NAS; `docker compose run --rm migrate npm run db:verify`
  works and is proved by the CI job "Tools image runs db:verify" (green on `main`).
- **CW-090 (#93), the scanner number on the employee page, is built; waiting on
  review.** `web/src/features/employees/ScannerNumberCard.tsx` (text, so `007` stays
  `007`; clearing sends `null`; `DUPLICATE_SCANNER_ID` shown in words). Saving an
  employee with a new number calls `ScannerImportService.rematchNumber`, which
  attaches only the unowned days of that number and counts the ones with two times;
  days HR decided, days already counted under an old number and locked days are not
  touched. The old and new number are in the audit log (the field diff), and a second
  entry says how many days were counted. `EmployeesModule` now imports
  `AttendanceModule`. Thai guide `docs/guide/scanner-import.th.md` updated (the line
  saying the page had no field is gone). Tests: four e2e cases in
  `backend/test/scanner-import.e2e-spec.ts` (kept as text, days counted, earlier days
  stay, locked day untouched, duplicate refused, number cleared) and
  `ScannerNumberCard.test.tsx`. Full e2e 423 and web 234 passed; doc counts updated.
  Not walked on a real browser in this room.
- Rehearsal of the NAS install is on a clean Docker host, not a Synology
  (`docs/nas-rehearsal-2026-10.md` says what was and was not tried). Open for the
  owner: approval to run `./check.sh` on the pilot's NAS, a USB drive or another
  machine for backups.
- Waiting on others: CW-085 (#88) needs the owner's redacted sample file; CW-080 and
  CW-086 (#89) are not queued.

## Next

- Queue from the PO, in order: CW-065 (#68) add one employee from the console, same
  fields and checks as the import, sensitive fields encrypted the same way; then
  CW-073 (#78) passports and work permits expiring in 30/60/90 days, one notice per
  band, no document numbers in the list or the notice.
- Do not start CW-085, CW-080 or CW-086, nor the support-scope page. Do not touch the
  real NAS until the owner approves.
