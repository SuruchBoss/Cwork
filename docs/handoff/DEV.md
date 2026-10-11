# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- **CW-079** (#83, account roles from the employee page): on `main`. The PO
  reviewed the code and agreed with the dev's seven decisions; it closes once
  CI on `main` is green. The first push failed `verify:sql` (the advisory lock
  was not classified); fixed in the commit after `0874e40`.
- **CW-078** (#82, advances against sections 76 and 77, `CASH_ADVANCE`): done
  in `0874e40`, pushed with the CW-079 fix, waiting for the PO's review.
- **CW-076** (#81, daily-wage holidays): next in the queue, not started. The
  text of sections 29, 56, 62 and 68 is read (consolidated to 2019); cite
  volume, part, date and page, and do not commit the law PDFs.

## How the dev room works

- Push every change to `main`, merge `main` into `claude/hris-system-setup-kfl3rq`
  (release; CHANGELOG entries for 0.4.0 go under `[0.4.0]` there) and push the
  room's own branch. Never force-push; check `main` has not moved first.
- Before pushing, run the backend CI steps in order (`typecheck`, `lint`,
  `verify:compose`, `db:verify`, `verify:migrations`, `verify:sql`, unit tests
  without the env, the full e2e suite with CI's secrets, `verify:docs`), and the
  web suite. A new raw SQL statement needs an entry in `scripts/verify-raw-sql.ts`.
- An e2e spec that creates people or accounts removes them in `afterAll`:
  other specs count the demo company.
- Report each ticket to the PO room (`session_01TrgzY8y4M1xJPrQ3XNsbDu`) with
  the commits, the tests and every decision the dev made alone.

## Waiting on

- The PO: review of CW-078, and closing CW-079 once CI is green.
