# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- Reviewed and accepted by the PO: CW-061, CW-089, CW-062 (cloud side), CW-090, #94-#97,
  CW-065. `#62` stays open for the real NAS: the owner has to approve `./check.sh` on it.
- **CI of `1f85420` was red on one test, now fixed here.** `telemetry.e2e-spec.ts` "writes
  outbox.delivery.failed ..." drains the outbox once; a drain claims only the oldest
  `OUTBOX_BATCH_SIZE` (20) pending events, so when earlier specs left more than 20
  pending, this test's two events (the newest) were never claimed and no log line
  appeared. Reproduced by adding 25 older pending events (same failure message), fixed
  by emptying the pending queue first, as `outbox.e2e-spec.ts` does; with the 25 events
  and the fix it passes. Nothing in product code was wrong; the spec count of pending
  events grows with every spec that pays a run or raises a notification.
- **CW-073 (#78), documents expiring, is built and waits for review.**
  `GET /employees/expiring-documents` (`employee:read`, names/codes/dates/window, no
  numbers), console page Employees -> Documents expiring, daily job `document-expiry-notices`
  (02:00 UTC, lock id 10) that tells every user who may update employees once as a document
  enters the 90, 60 and 30-day windows and once when expired (`employee_document_notices`,
  migration `20261017120000`). Logic in `domain/document-expiry.ts` and
  `document-expiry.service.ts`. A renewal is a new date and starts new windows. E2E in
  `employee-document-expiry.e2e-spec.ts` (8 cases, walks one date through 90/60/30/expired
  with an injected `now`). Thai guide `docs/guide/expiring-documents.th.md`. Not walked in a
  browser.
- QA re-ran S15 (#94/#95) on `main` 814ecc5: all four checks pass.
- **Small ticket from the PO, done here:** the scanner import's `lockedDays` (preview and
  result) now counts every day of the file that payroll has used, by the same `LockedDays`
  rule as the review page, so a new waiting day in a paid month reports 1. The import page
  says how many days will be left as they are. One e2e case added (preview and import).
  `sso-shortfall.e2e-spec.ts` now checks its empty year with 2041: it used 2035, which
  `period-check` pays a run in, so it failed whenever `period-check` ran first.
- `lockedDays` ticket is on `main` (4fe0cd1). CI of it is being watched.
- **Pictures for the READMEs and landing page (PO, separate PR):** branch
  `claude/new-session-syszvt` carries them on top of PR #98's branch
  (`claude/serene-carson-fr7k0k`, merged in): `docs/screenshots/capture-office.mjs`
  writes stills 24-29 (th and en), landing webp copies, and the clip
  (`docs/demo/office.<lang>.webp/.gif`); README.md, README.th.md and the landing
  page use them. Run it on a freshly seeded database; it changes that database.
  The cash sheet has one (Thai) edition and a red draft note about the pilot's
  paper form, which the picture shows: waiting on the PO's call.
- Waiting on others: CW-085 (#88) needs the owner's redacted sample file; CW-080 and
  CW-086 (#89) are not queued.

## Next

- Nothing queued. Do not start CW-085, CW-080 or CW-086, nor the
  support-scope page. Do not touch the real NAS until the owner approves.
