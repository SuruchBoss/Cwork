# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- CW-061 (the fingerprint scanner import, #61) passed review. Its code lives in
  `backend/src/modules/attendance/scanner-*`, the web pages in
  `web/src/features/attendance/Scanner*`; guide `docs/guide/scanner-import.th.md`.
  Not built, on purpose: lateness, overtime and shifts from scanner times, and a
  scanner-number field on the employee page (the PO has it as a later ticket).
- CW-089 (#92), the accountant's month and the check against what was filed, is
  built and pushed; waiting on review.
  - **Payroll → Export for the accountant** is `GET /payroll/periods/:id/export?format=accountant`:
    the existing CSV plus `Tax ID` (stored tax ID, else the national ID, else
    empty) and `Income type` (`40(1)` for everyone: Cwork computes employment
    income only). Tax IDs are decrypted for this format alone; the audit entry
    counts rows with none (`missingTaxId`), never the numbers.
  - **Payroll → Check against filings** (`/payroll/compare`, `PeriodCheckPage.tsx`):
    `POST /payroll/periods/:id/compare` (tax total and/or social security total,
    employee + employer together, to the satang) and `POST …/parallel-run`
    (HR's per-person figures: code, gross, tax, social security, net). Both need
    `payroll:export`, store nothing, change no payslip. Pure rules in
    `domain/period-check.ts`, service `period-check.service.ts`, shared period
    loader `reconciled-period.ts`. Guide `docs/guide/period-check.th.md`.
  - **Behaviour change to know about:** `reconcilePeriod` now accepts runs that are
    `PAID` as well as `APPROVED`, so a period is exportable and comparable after
    payday. Before, the CW-044 export refused a paid period, which is the only time
    an accountant files.
  - Assumptions to confirm with the owner, not guessed further: the tax ID is the
    national ID unless one is stored; the income type is `40(1)` on every row; the
    accountant's columns follow the existing export until the owner says what HR
    sends today.
- Waiting on others, nothing for the dev room to start: the owner (what HR sends
  the accountant today, whether the first payroll runs beside HR's method, the
  support channel for CW-087's page, the pilot's blank paper form, the
  accountant's answer on proof of cash payment); CW-085 (#88) needs the owner's
  sample file; CW-080 and CW-086 (#89) are not queued.

## Next

- CW-062 (#62): the three Synology installers, once the PO queues it. Do not touch
  the real NAS until the owner approves. Do not start CW-085, CW-080 or CW-086,
  nor the support-scope page.
