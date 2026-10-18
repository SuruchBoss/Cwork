# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: CW-061, CW-089, CW-062 (cloud side), CW-090, CW-065, CW-073, #94-#97, the
  office pictures and clip, CW-085's PDF layout (#102), CW-066's HR half (#103) and CW-031's
  schema fix (#104).
- **PR #109 (open, head `bc6f5c4`, not touched since the PO reviewed it):** CW-093, the web cache
  is cleared when a session is adopted and at sign-out (`auth.store.ts`, three tests), plus the
  overflow half of CW-091 (the Thai sign-out button made the menu scroll sideways).
- **On top of it, on branch `claude/new-session-syszvt`, not pushed (the PO asked for CW-092 as
  a new branch after #109 merges):** CW-092's four items and the CHANGELOG fix. HR dashboard
  card and empty-box wording, a drawn check icon in place of ✓ (four pages), dark `--text-subtle`
  #8a94a2, the overdue badge and order on the approvals page (`overdue.ts`), and the CW-031
  CHANGELOG entry no longer says the inbox was emptied (the cache entry is labelled CW-093).
  Web counts 283, docs updated, `verify:docs`, tsc, eslint and licence headers pass.
- **Dropped by the PO at 15:00 and not in the branch:** the pinned footer, 36 px rows and
  inside-scrolling list of CW-091, and the "Report a problem" icon of CW-092, because direction B
  removes the left menu. The full version (menu changes, `capture.mjs` footer checks, the retaken
  HR guide pictures, the icon) exists only as local branch `backup-full-091-092` and as
  `full-091-footer-and-092.patch` in the Dev room's scratchpad; it is gone when the container is.
  Footer measured at 1366x768 as hr.manager: it fits when the list scrolls inside.
- Not done: README and landing pictures still show the old dashboard card wording (the HR
  guide's pictures do not show the dashboard). The ⏸ in the dashboard's recent-leave box is the
  same kind of character as the old ✓ and was left alone (not in the ticket).
- Pictures: capture scripts change the database they run on; run them on a freshly seeded one.
  `KEEP_SCRATCH=1` keeps the frames.
- Waiting on others: CW-066's two owner items (a real HR person doing the four jobs before
  31 October; a second person who may approve a payroll run); CW-085 upload file needs the
  e-Services layout; CW-080 and CW-086 (#89) are not queued.

## Next

- When #109 merges, restart the room branch from `main`, push CW-092 and report. Do not start
  CW-094 (direction B, after the Pilot A install), CW-085's upload file, CW-080 or CW-086, nor
  the support-scope page. Do not touch the real NAS until the owner approves.
