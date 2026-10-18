# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #110 (CW-092, CW-093 and the overflow half of CW-091 included).
- **On branch `claude/new-session-syszvt`, restarted from main `9baa043` (CW-095, pushed, the PO
  opens the PR):** the department filter on the employee register and on the shifts and roster page
  no longer calls `/departments` for someone without `org:read`. `useDepartmentOptions`
  (`web/src/lib/departments.ts`) asks `/departments` only with `org:read`; without it, it lists
  `/employees` (limit 200, the most the API allows) and offers the departments of those people,
  once each, by name. Without `org:read` and without any employee-read permission it asks nothing.
  No permission changed; the assign-a-schedule form on the roster page is HR-only and unchanged.
- Tests: hook (`lib/__tests__/departments.test.tsx`) and one per page, as manager and as HR; the
  manager ones fail on the old code (checked by stashing the page edits). Web tests 293; README,
  README.th, `docs/spec.md` and `verify-doc-counts.ts` say 293.
- **Not built, by the PO's decision:** pinned footer / 36 px rows of CW-091 and the "Report a
  problem" icon of CW-092 (direction B removes the left menu, built after the Pilot A install).
- `EmployeeCreatePage` and `AccountRolesCard` still call `/departments`; both are HR-only screens.
- Pictures: capture scripts change the database they run on; run them on a freshly seeded one.
- Waiting on others: CW-066's two owner items (a real HR person doing the four jobs before
  31 October; a second person who may approve a payroll run); CW-085 upload file needs the
  e-Services layout; CW-080 and CW-086 (#89) are not queued.

## Next

- PO opens the CW-095 PR, reviews and merges. Do not start CW-094 (direction B, after the Pilot A
  install), CW-085's upload file, CW-080 or CW-086, nor the support-scope page. Do not touch the
  real NAS until the owner approves.
