# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- **CW-048** (#45, monthly social security filing): built, waiting for the PO's
  review; the upload-file formatter is deliberately not built.
  - `payroll/domain/sso-filing.ts` works the form out from the month's payslips
    (a person's halves added up, then `computeSocialSecurity`); `SsoFilingService`
    checks the month is finished (every period has an approved or paid run, both
    halves of a half-month month), identifies each person (a Thai by national ID,
    an employee with a passport or work permit by social security card number),
    names anyone without the number, audits every read and file, and writes
    CSV, XLSX and (through `documents/sso-filing-renderer.ts`) PDF.
  - Route `GET /payroll/reports/sso-filing?year=&month=&format=`, `payroll:export`.
    Web page Payroll -> Social security filing. Thai guide
    `docs/guide/sso-filing.th.md`. `payroll/sso-slips.ts` is the payslip loader now
    shared with the shortfall report.
  - **Waits on the owner:** a sample upload file from e-Services (the "download
    upload file" icon on a past transaction). No public layout exists, so the
    formatter is not guessed; once there is a sample it is a small step.
  - Open for the accountant (#36): is "wage paid" the SSO wage or total pay
    including overtime. CW-048's last acceptance line (the pilot's November file)
    waits for their file.
- **CW-084** passed review earlier today (whole-baht contribution, floor applies).
- Earlier: CW-071 passed review; CW-082 (#85) is open, not queued.

## Next

- Wait for the PO's review of CW-048 and for the owner's e-Services sample.
