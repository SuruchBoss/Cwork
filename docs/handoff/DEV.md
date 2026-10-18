# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: CW-061, CW-089, CW-062 (cloud side), CW-090, CW-065, CW-073, #94-#97, the
  office pictures and clip, the scanner import's plural, CW-085's PDF layout (#102) and
  CW-066's HR half (#103: screen fixes, `docs/guide/hr-daily-tasks.th.md`). `#62` stays open
  for the real NAS: the owner has to approve `./check.sh` on it.
- **On branch `claude/new-session-syszvt`, waiting for the PO to open the PR: CW-031 (#29),
  the demo on Render did not reset.** Render's database user is `cwork_demo`, the same as
  the demo's marker schema, so after the first boot `current_schema()` was the marker and
  four statements looked in the wrong place (migration check, "is the database empty"
  guard, the reset's truncate, the visitor-address triggers). They now name the
  application's schema (`appSchema()`: the `schema=` of `DATABASE_URL`, else `public`). The
  migration check moved to `demo-migrations.ts`. Five new e2e tests set the search path
  like Render's user and drop the URL's `schema=` (with it Prisma pins the path, which is
  why CI never saw this); they failed before the fix. `docs/demo.md` explains, the raw-SQL
  registry and the counts (447 e2e) are updated.
  - The manager's missing leave request is **not explained by the schema bug alone**. Booted
    twice on the old behaviour with nobody touching anything, the manager's box was intact
    (same leave, same approvals, dev1's manager still eng.manager). What the bug does is make
    every reset a no-op for visitors' changes: with one approval made between the boots, the
    old code kept it, the fixed code puts the request back. So someone approved, rejected or
    cancelled it between 11:27 and 13:52 and nothing could undo it. Who, is unknown: the
    owner says it was not him, and the demo is public. The audit page of the demo (sign in as
    HR) shows it with the time, until the next reset wipes it.
  - Render's database should recover by itself after the owner deploys this: the old reset
    left `cwork_demo.state` empty, the next boot's `prepareDemoSchema` inserts a row with
    no `seeded_at`, which is a `boot` reset that now truncates `public` and seeds. A test
    covers exactly that. If the first wake after the deploy still shows old data, the owner
    deletes and recreates the database (`docs/demo.md`, "When the free database expires").
  - Not checked, because this room cannot open onrender.com: the real wake time after the
    fix and the 64-second figure; the owner times it.
- Pictures: capture scripts change the database they run on; run them on a freshly seeded
  one. `KEEP_SCRATCH=1` keeps the frames.
- Waiting on others: CW-066's two owner items (a real HR person doing the four jobs before
  31 October; a second person who may approve a payroll run); CW-085 upload file needs the
  e-Services layout; CW-080 and CW-086 (#89) are not queued.

## Next

- Nothing queued after CW-031. Do not start CW-085's upload file, CW-080 or CW-086, nor
  the support-scope page. Do not touch the real NAS until the owner approves.
