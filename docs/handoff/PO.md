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
- **Pilot A HR answers (2026-11-03), questions 1-6:** HR keys social security
  on the web person by person (no upload file, CW-085 updated); it sends the
  accounting firm a one-sheet payroll register, which the CW-089 export is not
  (CW-099, #123, sent to Dev); the firm sets the ภ.ง.ด.1 income code; everyone
  signs a book, so the receipt sheet is optional; a cash payday is proved by a
  cash bill and certificate, no company form. Questions 7-10 (parallel run, HR
  trying the four tasks, second approver, install date) not answered: nothing
  that depends on them is started. Real personal data never goes into a cloud
  session; CW-062 (#62) waits for the real NAS.

## Waiting on the owner

- The landing page's cash-sheet picture (`landing/assets/shots/cash-sheet.*.webp`)
  and its Thai and English alt text still show and describe the red note that
  named the pilot company. A new picture is ready (CW-097); landing wording needs
  the owner's own words in this room.
- HR answers 7-10 (2026-11-03): the first period runs in parallel (HR pays
  the old way, Cwork is compared, nothing paid from it); HR tries the four
  tasks during that period (#69); the second approver is a company founder,
  called only "the approver role" in the repo; the install date is ours to
  propose. Before proposing it: CW-099 merged and QA-checked on synthetic
  data (estimate Thu 5 Nov), then CW-100 and the 8,556 tests (Fri 6 Nov). The
  PO's estimate is ready to book from Mon 9 Nov. Two things block that date,
  neither code: `./check.sh` on the real NAS needs the owner's own words in
  this room, and the half-month social security timing needs a decision
  before a daily worker's first-half payday.
- CW-062: approval to run the read-only `./check.sh` on the pilot's NAS, a
  backup drive, a password store for the key, the HR import file.
- Social security timing (2026-11-03): the pilot takes a daily worker's social
  security once a month, on the month's total wage. Cwork's sum is right
  (rounded to the baht, 50 satang up, verified in CW-084: 372 × 23 = 8,556
  gives 427.80, so 428). But a daily wage is paid SEMI_MONTHLY, and the first
  half already deducts 5% of its own wage. If the pilot pays daily staff twice
  a month, Cwork deducts in both halves where the pilot deducts once. Not
  changed: the owner decides, and the #36 reviewer should confirm the law
  allows deducting only at month end. Dev asked for unit tests of the
  8,556 example.
- CW-100 (#124, sent to Dev): HR skips social security in a leaver's month;
  Cwork does not, and will warn HR once the rule is confirmed from official
  sources.
- Still to ask HR: whether it rounds the 5% or the net pay (it says its figures
  have no satang), and the field order of the social security web form.
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
