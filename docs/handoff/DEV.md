# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to CW-098 (`ed2272a`).
- **On branch `claude/new-session-syszvt`, restarted from main `7e8e499` (CW-099, pushed, the PO
  opens the PR):** the payroll register, `GET /payroll/periods/:id/export?format=register`.
  - A new `ExportFormat` kind: binary (`BinaryExportFormat`, built from the same `ReconciledPeriod`
    by `domain/payroll-register.ts` with `writeXlsx`). The CSV and accountant formats are untouched
    (`TextExportFormat`, same code).
  - Payslip lines are read only for a format with `needsItems`; `reconcilePeriod` then checks them
    against the payslip (earnings = gross, deductions = total, `WHT` line = withholding tax, `SSO`
    line = employee social security, gross − deductions = net) and refuses by name when they do
    not add up. `ReconciledRow.items` is `[]` for every other format.
  - **Decision for the PO to confirm — the register reads the whole month, not one period.** A
    daily-wage employee must be `SEMI_MONTHLY` (`assertPayBasis`), so a month is up to three periods:
    the monthly one and the two halves. The acceptance (one monthly and one daily employee on one
    sheet) cannot hold inside a single period, so `format=register` (`wholeMonth: true`) reads every
    period of the same year/month from whichever one it is asked for, adds a person's halves into
    one row, names the file `payroll-register-YYYY-MM.xlsx`, and audits the periods it read. It
    refuses a period with no run, a run not APPROVED/PAID, or a semi-monthly month missing a half
    (a register short of the second half would look finished). Easy to cut back to one period.
  - **Second decision — the descriptions.** "อื่นๆ (ระบุ)" is two numeric columns, so the names go
    in one extra last column ("รายละเอียดอื่นๆ", `เงินได้อื่นๆ: A 1,000.00; B 2,000.00 | หักอื่นๆ: C 500.00`),
    after the 14 columns of the form, which stay in order. Provident fund counts as an "other"
    deduction. Salary, daily-wage and overtime cells are empty when there is nothing; tax and
    social security are always numbers. Figures stay to the satang.
  - The employer's social security share is only on the second sheet ("สรุปยอด", month totals).
  - The payroll page has an "Export payroll register" button (Thai: ส่งออกทะเบียนเงินเดือน) beside
    "Export for the accountant"; `docs/guide/period-check.th.md` has a section saying which file
    to send; CHANGELOG has the entry.
  - Tests: `domain/payroll-register.spec.ts` (10), `test/payroll-register.e2e-spec.ts` (13, a
    monthly employee with a standing allowance and loan plus a daily worker with overtime in two
    halves, all synthetic), and the button in `PeriodCheckPage.test.tsx`.
- Counts: web 322; backend unit 798, domain 505 (README, README.th, `docs/spec.md`,
  `backend/README.md`, `docs/architecture.md`, ADR 0002); e2e in `verify-doc-counts.ts` is raised
  by the 13 new checks.
- **Not touched, for the owner:** the landing still shows the old cash-sheet picture
  (`landing/assets/shots/cash-sheet.{th,en}.webp`) and its two alt texts still mention the red line.
- **Not built, by the PO's decision:** pinned footer / 36 px rows of CW-091 and the "Report a
  problem" icon of CW-092 (direction B removes the left menu, built after the Pilot A install).
- Waiting on others: CW-066's two owner items; CW-085 upload file needs the e-Services layout;
  CW-080 and CW-086 (#89) are not queued; the satang question (HR says no satang) is not asked yet.

## Next

- PO opens the CW-099 PR, reviews against the backlog, and answers the two decisions above. Do not
  start CW-094, CW-085's upload file, CW-080 or CW-086, nor the support-scope page. Do not touch
  the real NAS until the owner approves. The pilot's real register stays on the owner's machine:
  only the layout is in the repository.
