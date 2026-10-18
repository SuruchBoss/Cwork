# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: CW-061, CW-089, CW-062 (cloud side), CW-090, CW-065, CW-073, #94-#97, the
  office pictures and clip, CW-085's PDF layout (#102), CW-066's HR half (#103) and CW-031's
  schema fix (#104).
- **#109 merged (8e1b32d):** CW-093 (the web cache is cleared when a session is adopted and at
  sign-out) and the overflow half of CW-091.
- **On branch `claude/new-session-syszvt`, restarted from main after #109 (CW-092, pushed, the PO
  opens the PR):** HR dashboard card and empty-box wording; every empty state in the console draws
  a named icon (`EmptyState icon` is an `IconName`, so a character is a type error; `check`, `ban`,
  `search` added) instead of ✓ ⏸ ⌗ ◷ and the like, which the PO asked for in one pass; dark
  `--text-subtle` #8a94a2; overdue badge (red, calendar days from the due date as `formatDate`
  shows it, so "Due 4 Oct" on 18 Oct is 14) and order on the approvals page (`overdue.ts`); the
  CW-031 CHANGELOG entry no longer says the inbox was emptied and the cache entry is CW-093.
- **Not in it, by the PO's decision:** pinned footer / 36 px rows of CW-091 and the "Report a
  problem" icon of CW-092 (direction B removes the left menu, built after the Pilot A install).
  README and landing pictures keep the old card wording until the UX-25 retake.
- Pictures: capture scripts change the database they run on; run them on a freshly seeded one.
  `KEEP_SCRATCH=1` keeps the frames.
- Waiting on others: CW-066's two owner items (a real HR person doing the four jobs before
  31 October; a second person who may approve a payroll run); CW-085 upload file needs the
  e-Services layout; CW-080 and CW-086 (#89) are not queued.

## Next

- PR #110 (CW-092): UXUI's review fixes pushed (day count, red badge, comment, scanner icon); wait
  for the PO's merge. Do not start CW-094 (direction B, after the Pilot A
  install), CW-085's upload file, CW-080 or CW-086, nor the support-scope page. Do not touch the
  real NAS until the owner approves.
