# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- Accepted by the PO and on `main`: CW-061, CW-089, CW-062 (cloud side), CW-090, CW-065,
  CW-073, #94-#97, the scanner import's `lockedDays`, the office pictures (#98, #99) and the
  sharper clip (#100). `#62` stays open for the real NAS: the owner has to approve
  `./check.sh` on it.
- **On branch `claude/new-session-syszvt`, waiting for the PO to open the PR:**
  - English singular/plural on the scanner import page (`a20df9b`): `plural(count, one,
    other)` in `web/src/lib/i18n` picks between two keys; each singular has its own Thai
    entry. `SpreadsheetImport.tsx` still says "{count} problems" for one (shared key, not
    touched).
  - CW-085 layout of the social security filing PDF (`87a55c0`): total of line 4 in Thai
    words (new `core/utils/baht-text.util.ts`, the first amount-in-words in Cwork), name
    column headed "คำนำหน้านาม-ชื่อ-ชื่อสกุล" with `Employee.titleTh` in front where HR
    recorded one (passed by `exportFile`; `sheet()` and the calculation untouched), the rate
    and "แผ่นที่ N ในจำนวน M แผ่น" in the heading of each part 2 sheet, a rule above "รวม".
    Not on the PDF because Cwork has no such field: the establishment's social security
    account number and the six-digit branch number. Counts now 787 backend unit, 255 web.
- Pictures: `docs/screenshots/capture-office.mjs` takes its own 2x pictures (Playwright's
  video is 1x whatever the pixel ratio) and encodes the landing clip as mp4/webm with a
  poster and the README GIF. Run it on a freshly seeded database; it changes it.
  `KEEP_SCRATCH=1` keeps the pictures.
- Waiting on others: CW-085 upload file needs the e-Services layout (the owner will ask the
  pilot's HR); CW-080 and CW-086 (#89) are not queued.

## Next

- Nothing queued. Do not start CW-085's upload file, CW-080 or CW-086, nor the
  support-scope page. Do not touch the real NAS until the owner approves.
