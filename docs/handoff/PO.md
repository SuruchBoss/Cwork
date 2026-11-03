# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are (2026-11-03)

- **Done today:** CW-099 and the dependency advisories, #126 at `2c47dac`.
  QA re-test of CW-099 passes over the API.
- **Gates (owner 17:51):** regression passes except #127 (the monthly parallel
  run could not hold daily staff; the owner chose option B, CW-104). Security review done; the
  findings went to the owner privately, and the fixes are in the dev queue
  ahead of everything else. Performance: everything under 2 s at 200 people
  except the scanner import (41.5 s), CW-102 (#133). Blind test running.
- **Dev queue:** #128 (Web console timeout), the private security fixes,
  CW-103 compare page, CW-104, CW-102, CW-101 (#125), CW-100 (#124, waits on the law text).
- **Owner's choice (18:38, replacing 17:19):** daily staff stay half-monthly,
  and the compare page adds up the calendar month (CW-104, #127). The owner
  books the install date with HR.
- **Pilot A, all ten HR answers in (2026-11-03).** HR keys social security on
  the web (no upload file, CW-085 updated). It sends the accounting firm a
  one-sheet payroll register, which CW-089 is not, hence CW-099. The firm sets
  the ภ.ง.ด.1 income code. The receipt sheet is optional. Cash pay is proved by
  a cash bill and certificate. The first period runs in parallel (HR pays the
  old way), and HR tries the four guide tasks then (#69). The second approver
  is called "the approver role" in the repo. Real personal data never goes
  into a cloud session.
- **Social security, daily wages:** the sum and rounding are right (CW-084;
  372 × 23 = 8,556 gives 428). The pilot deducts once a month. Nothing changes
  until the owner decides (and #36 confirms the law).
- **Parked:** the petty-cash certificate (backlog § Parked ideas).
- **Storytelling draft:** `docs/drafts/storytelling-2026-10-18.th.md` on
  `claude/serene-carson-fr7k0k` (`e89a850`). Needs the owner's words: hero A
  or B, the six-problems heading now or with CW-094, and the post.
- **CW-031 (#29):** waiting on the owner to redeploy at `d08c985` or later and
  time a cold start (target 30 s; 64 s on 18 Oct).
- **CW-094:** direction B, after the Pilot A install. Not started.

## Waiting on the owner

- `./check.sh` on the pilot's NAS: **approved 2026-11-03 17:18** in this room
  (read-only, run on-site). Still needed: a backup drive, a password store for
  the key, the HR file (filled on-site).
- HR (asked by the owner): in a pay period spanning two months, which month
  does the monthly register count the days toward? Needed before comparing.
- #36: which month a cross-month period counts toward for social security,
  and whether the contribution may be deducted once a month.
- The landing cash-sheet picture and its alt text (public wording).
- Still to ask HR: whether it rounds the net, and the field order of the
  social security web form.
- #36: a qualified reviewer for the payroll rules.
- CW-087: the support channel (hours 18:00–24:00, temporary).
- Prices and timing for the CW-077 items.

## How the PO room works

- Dev room `session_01A6A6oX85qwkQqRwjcjFy48`, QA room
  `session_01FygupdPGTCw1Qe7C1BYSCg`, UX room `session_01LMneSyoUa7YYq8CstMChdg`.
- Reviews each branch against its acceptance, waits for every CI job, merges
  with a pinned sha, records the outcome in the backlog, reports once to the
  Asuna Bot room.
- CI cancels an in-progress run on a new push: docs go to `main` only while
  CI is idle, never straight after a merge.
- Licences, editions and other public wording need the owner's own words
  typed in this room. A vulnerability is never a public issue: draft an
  advisory for the owner to file.
