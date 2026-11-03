# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are (2026-11-03, evening)

- **Merged today:** #126 (CW-099), #128, #132, #135, #139 (access checks and
  the performance note), #140, #141 (CW-101 to CW-106, `14fb65d`), #144 (QA
  final regression, passed), #143 (CW-107 and two small follow-ups, `82e5009`).
- **Next:** UX guide #138 (CW-103 part) after a merge of `main`, then the
  final blind test. Dev's next branch is being prepared from `main`.
- **Install gates (owner 17:51):** QA regression, security, performance, blind
  test. Security review done; findings went to the owner privately. Regression passed (#144).
  Still to run: the final blind test on a stack installed with
  `deploy/nas/install.sh` (2 CPU / 2 GB). Report the gates to the Asuna Bot
  room before the install date is booked (target Saturday 14 Nov).
- **Owner's choices today:** daily staff stay half-monthly and the compare
  page adds up the calendar month (18:38, CW-104); the second half may run
  after an approved first half, counted once (19:21, option 1).
- **CW-100 (#124):** waits on the law texts.
- **Parked:** the petty-cash certificate (backlog § Parked ideas).
- **CW-031 (#29), CW-094, storytelling draft:** unchanged, see the backlog.

## Waiting on the owner

- File the private advisory (fixes are in #139), and two design choices
  sent privately. The pilot NAS's RAM, for the install checklist.
- The law texts for CW-100 (sections 33, 34, 46, 47 and the สปส.6-09 page),
  or the domains to fetch them.
- HR: which month a cross-month period counts toward, whether it rounds the
  net, and the field order of the social security web form.
- #36: the law questions and a qualified reviewer for the payroll rules.
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
