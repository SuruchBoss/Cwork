# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- Accepted by the PO and on `main`: CW-061, CW-089, CW-062 (cloud side), CW-090, CW-065,
  CW-073, #94-#97, the scanner import's `lockedDays`, the office pictures (#98, #99), the
  sharper clip (#100), the English plural on the scanner import page, and the social
  security filing PDF layout (CW-085, #102). `#62` stays open for the real NAS: the owner
  has to approve `./check.sh` on it.
- **On branch `claude/new-session-syszvt`, waiting for the PO to open the PR(s): CW-066,
  the HR half.** The four jobs of the pilot's HR at a PC (scanner file, leave, shadow
  payroll for 15 days and a month, payslips and receipt sheet) walked in Thai at 1366×768:
  - Screen fixes (web only, with tests): scanner review says what a decision did and labels
    each time in/out, keeps the date on one line, no longer shows "days with no punch" under
    the unregistered numbers; the import page says not to open the file in Excel; leave
    moves the list to the status it was recorded as; the pay date follows the period end,
    creating a run opens it, a refused run says why, an empty run says whether nobody has a
    daily wage or a salary and where to set it, left-out employees are named, the approval
    note says who approves; date fields select on entry; "1 problems" on the spreadsheet
    imports uses `plural()`. Web counts: 267.
  - The guide `docs/guide/hr-daily-tasks.th.md`, a picture per step
    (`docs/guide/img/hr-NN-*.png`), made by `docs/guide/capture-hr-tasks.mjs` on a freshly
    seeded database (it imports, records leave and runs payroll for real).
  - Re-shot because the screens changed: `07-payroll` (th, en), `24-scanner-days`,
    `25-scanner-preview` and the landing stills of the same, the office clip and GIF. A
    full `capture.mjs` run was thrown away except `07-payroll`: every other still is
    unchanged apart from today's date.
  - Splitting is possible: screen fixes and tests on one side, guide and pictures on the
    other.
- Not done, and the ticket's own acceptance: a real HR person doing the four jobs unaided
  before 31 October, with what stopped them written in the ticket. Items 3 and 6 of the
  re-aimed list and the mobile app are out of this ticket.
- Pictures: `docs/screenshots/capture-office.mjs` takes its own 2x pictures (Playwright's
  video is 1x whatever the pixel ratio) and encodes the landing clip. Run any capture
  script on a freshly seeded database; they change it. `KEEP_SCRATCH=1` keeps the frames.
- Waiting on others: CW-085 upload file needs the e-Services layout (the owner will ask the
  pilot's HR); CW-080 and CW-086 (#89) are not queued. Whether the pilot has a second
  person who may approve a payroll run is for the owner (the guide tells HR to ask them).

## Next

- Nothing queued after CW-066. Do not start CW-085's upload file, CW-080 or CW-086, nor the
  support-scope page. Do not touch the real NAS until the owner approves.
