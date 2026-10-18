# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: CW-061, CW-089, CW-062 (cloud side), CW-090, CW-065, CW-073, #94-#97, the
  office pictures and clip, CW-085's PDF layout (#102), CW-066's HR half (#103) and CW-031's
  schema fix (#104: the demo's SQL names the application's schema, `appSchema()`, instead of
  asking `current_schema()`; five e2e tests). `#62` stays open for the real NAS: the owner
  has to approve `./check.sh` on it.
- **On branch `claude/new-session-syszvt`, waiting for the PO to open the PR: why the
  manager's inbox looked empty on the demo at 13:5x (CW-031 follow-up).** The owner found it
  full again at 14:3x, so nothing was lost; the earlier theory (a visitor approved the
  request) is dropped. Cause found in the web app: the approvals list has one query key for
  everyone (`['approvals','tasks','PENDING']`) and an answer stays fresh for 30 seconds, and
  nothing cleared the cache when the session changed (only the demo's reset overlay did).
  Landing as HR asks for the approvals once, an empty answer, so "View as manager" straight
  after showed HR's empty list. The cache is now cleared when a session is adopted (password,
  second factor, enrolment, demo) and at sign-out, in `auth.store.ts`. Three tests in
  `stores/__tests__/auth.store.test.tsx`: the HR-to-manager switch shows the manager's request
  (failed before the fix), and both drops. Web counts 270. Not proved: that this, and not
  something else, is what the owner saw at 13:5x, since this room cannot reach onrender.com;
  the mechanism is reproduced. The owner's next timing run after the manual deploy answers it.
  Ordinary users on one shared PC (the pilot's HR) were exposed to the same thing.
- **Same branch, its own commit (`59ea39a`): CW-091 (#105), the side menu scrolls sideways.**
  Thai only, every desktop width: the footer's "ออกจากระบบ" button kept the row from
  shrinking, 6 px past the column, and `overflow-y` alone makes `overflow-x` scroll. Fix is
  padding 10 to 8, `min-width: 0` on the wide button and `overflow-x: hidden` on `.sidebar`;
  a stylesheet test keeps both rules (it failed before) and `docs/screenshots/capture.mjs`
  now fails when the menu is wider than its column. Measured 247 px of 247 at 1280, 1366 and
  1920, Thai and English. It is independent of the cache fix: the PO can split the two commits
  into two PRs. Web counts 272 with both.
- Pictures: capture scripts change the database they run on; run them on a freshly seeded
  one. `KEEP_SCRATCH=1` keeps the frames.
- Waiting on others: CW-066's two owner items (a real HR person doing the four jobs before
  31 October; a second person who may approve a payroll run); CW-085 upload file needs the
  e-Services layout; CW-080 and CW-086 (#89) are not queued.

## Next

- Do not start CW-085's upload file, CW-080 or CW-086, nor the support-scope page. Do not
  touch the real NAS until the owner approves. The UXUI room is proposing a new look; the
  menu fix is only the overflow.
