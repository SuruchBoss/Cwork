# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- **CW-081** (#84, one answer for substitute holidays): done, waiting for the
  PO's review. `organization/domain/work-calendar.ts` decides each employee's
  day (working, day off, holiday, substitute); `WorkCalendarService` feeds it
  the schedule, roster changes and holidays, and attendance, leave, overtime
  and the daily-wage run all call it. `holidays.substituteForId` lets HR mark a
  substitute; the organisation page shows and sets it.
- Left as known gaps in `docs/payroll-thailand.md`: a monthly run's proration
  still counts Monday to Friday less holidays, and days derived before the
  upgrade keep their old answer until recalculated.
- CW-076, CW-079 and CW-078 closed on 2026-10-11. Next in the PO's queue:
  CW-071, CW-048.

## How the dev room works

- Push every change to `main`, merge `main` into `claude/hris-system-setup-kfl3rq`
  (release; CHANGELOG entries for 0.4.0 go under `[0.4.0]` there) and push the
  room's own branch. Never force-push; check `main` has not moved first.
- Before pushing, run the backend CI steps in order (`typecheck`, `lint`,
  `verify:compose`, `db:verify`, `verify:migrations`, `verify:sql`, unit tests
  without the env, the full e2e suite with CI's secrets, `verify:docs`), and the
  web suite. A new raw SQL statement needs an entry in `scripts/verify-raw-sql.ts`.
- A restarted container has Postgres stopped: `service postgresql start`
  before any e2e run.
- An e2e spec that creates people or accounts removes them in `afterAll`:
  other specs count the demo company.
- Report each ticket to the PO room (`session_01TrgzY8y4M1xJPrQ3XNsbDu`) with
  the commits, the tests and every decision the dev made alone.

## Waiting on

- The PO: review of CW-081, and the next ticket.
