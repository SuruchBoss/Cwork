# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- **CW-076** (#81, daily-wage holidays): done, waiting for the PO's review. A
  half's run works out substitute days from each employee's schedule
  (`substituteHolidays` in `payroll/domain/daily-wage.ts`) and raises rest-day
  overtime to the s.62 minimum (`dailyWageOvertime`). Sections 29, 56 and
  61–63, 68 cited in `docs/payroll-thailand.md` against the consolidated text
  to 2019; the law PDFs are not in the repo.
- Raised with the PO, not built: attendance, leave and overtime requests do not
  know substitute days for anyone, so a salaried employee who stays home on an
  unlisted substitute day is marked absent (see Known gaps there).
- CW-079 and CW-078 closed on 2026-10-11. Next in the PO's queue: CW-071, CW-048.

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

- The PO: review of CW-076, and the next ticket.
