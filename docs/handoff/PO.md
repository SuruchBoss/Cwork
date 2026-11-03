# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are (2026-11-04, early morning)

- **Merged:** #126 to #147 on 2026-11-03 (see the backlog's Done), #151
  (e2e leave window takes Bangkok's today), #148 (UX blind test report,
  squashed), #150 (blind test fixes and CW-110; the test app now stops its
  cron jobs), `main` at `a93751d`.
- **Dev queue:** CW-109 (scanner number bound for a period) is ready in the
  Dev room and opens as a PR on `claude/new-session-syszvt` once `main` is
  green; then CW-111 (close-out closes the day that just ended), then
  CW-112 (small items from the re-check).
- **Next:** QA runs its regression on `main`. The UX room re-checked #150 on
  an installed stack (`a93751d`): passed; small items are CW-112 and CW-113.
  It re-checks CW-109 once that merges.
- **Install gates (owner 17:51):** QA regression, security, performance, blind
  test. Security review done; findings went to the owner privately. Regression passed (#144).
  Blind test ran on a stack installed with `deploy/nas/install.sh`
  (2 CPU / 2 GB); it passes once its fixes merge and are re-checked. Report the gates to the Asuna Bot
  room before the install date is booked (target Saturday 14 Nov).
- **Owner's choices today:** daily staff stay half-monthly and the compare
  page adds up the calendar month (18:38, CW-104); the second half may run
  after an approved first half, counted once (19:21, option 1).
- **CW-100 (#124):** waits on the law texts.
- **Parked:** the petty-cash certificate (backlog § Parked ideas).
- **CW-031 (#29), CW-094, storytelling draft:** unchanged, see the backlog.

## Waiting on the owner

- File the private advisory (fixes are in #139, #145 and #147), and two design choices
  sent privately. The pilot NAS's RAM, for the install checklist.
- The law texts for CW-100 (sections 33, 34, 46, 47 and the สปส.6-09 page),
  or the domains to fetch them.
- HR: which month a cross-month period counts toward, whether it rounds the
  net, and the field order of the social security web form.
- #36: the law questions and a qualified reviewer for the payroll rules;
  how HR pays a daily-wage employee who works on a public holiday.
- `./check.sh` on the pilot's NAS: approved 2026-11-03 17:18 (read-only,
  on-site). Still needed on the day: a backup drive, a password store, the HR
  file.
- Public wording: the landing cash-sheet picture and alt text; CW-087 support
  channel; prices and timing for CW-077.

## How the PO room works

- Dev room `session_01A6A6oX85qwkQqRwjcjFy48`, QA room
  `session_01FygupdPGTCw1Qe7C1BYSCg`, UX room `session_01LMneSyoUa7YYq8CstMChdg`.
- Reviews each branch against its acceptance, waits for every CI job, merges
  with a pinned sha, records the outcome in the backlog, reports once to the
  Asuna Bot room.
- Docs go to `main` only while CI is idle, never straight after a merge.
- Public wording needs the owner's own words typed in this room. A
  vulnerability is never a public issue, PR or commit text: draft an advisory
  for the owner to file.
