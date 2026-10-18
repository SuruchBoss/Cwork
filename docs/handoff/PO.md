# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are (2026-10-18, evening)

- **Dev:** queue empty. Merged tonight under the standing permissions: CW-096
  (#117, `4b78ff0`; its first CI run was red on a cash-sheet e2e that still
  wanted the removed note, fixed in `c107be8`), CW-097 (#118, `31bf0a8`),
  CW-098 (#121, `d08c985`, closes #119). Deploy the demo from `d08c985` or later.
- **QA:** pass 2 (#116) and its re-tests (#120, #122) done: #112–#115, #119 and
  CW-097 pass on `d08c985`, no new issues. The four payroll warnings were
  checked from source and the card names, not rendered on screen. Nothing
  waits on QA except the real NAS. Not covered: #111, the Render wake-up time.
- **Scanner number on the employee page:** already done, CW-090 (closed
  2026-10-17). Not a new ticket.
- **Standing permissions:** on `main` in `CLAUDE.md` (`9baa043`, pasted by the
  owner on the web after the auto-mode classifier refused the push). Merging
  a reviewed PR with green CI no longer needs asking; public wording still does.
- **Storytelling draft:** `docs/drafts/storytelling-2026-10-18.th.md` on
  branch `claude/serene-carson-fr7k0k` (`e89a850`), not on `main`. Waiting on
  the owner, typed in this room: hero A or B, whether the six-problems heading
  changes now or with CW-094, and the post. Then one PR for
  `landing/index.html`, the COPY map in `landing/build-en.mjs` and both READMEs.
- **CW-031 (#29):** fixes merged (#104, #109). Waiting on the owner: redeploy
  at `8e1b32d` or later, then time a cold start with HR → manager inside 30 s
  (64 s at 13:52; one-minute target; the Starter plan is his call). Close #29
  when that passes.
- **CW-094:** direction B, top menu, earth tones, olive main colour, after the
  Pilot A install. Not started.
- **Pilot A (by 31 October):** HR files social security itself; an outside
  accounting firm files ภ.ง.ด.1. Real personal data never goes into a cloud
  session. CW-062 (#62) stays open for the pilot's real NAS, untouched until
  the owner approves.

## Waiting on the owner

- The landing page's cash-sheet picture (`landing/assets/shots/cash-sheet.*.webp`)
  and its Thai and English alt text still show and describe the red note that
  named the pilot company. A new picture is ready (CW-097); landing wording needs
  the owner's own words in this room.
- #69: the pilot's HR doing the four tasks in `docs/guide/hr-daily-tasks.th.md`
  unaided before 31 October, and a second person to approve payroll runs.
- CW-062: approval to run the read-only `./check.sh` on the pilot's NAS, a
  backup drive, a password store for the key, the HR import file.
- CW-085: the e-Services upload template HR uses, blanked.
- After CW-088 and CW-089: remainders under 25 satang, the blank paper form,
  proof of a cash payday, what HR sends the accountant, the e-Filing income
  code, whether the first payroll runs beside HR's method.
- #36: a qualified reviewer for the payroll rules.
- CW-087: the support channel and response time (hours 18:00–24:00, temporary).
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
