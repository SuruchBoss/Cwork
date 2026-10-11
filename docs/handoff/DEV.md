# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- **CW-083** (#86, department limit does not narrow pay): built, waiting for the
  PO's review.
  - `organization/role-grants.ts`: `OUTSIDE_THE_DEPARTMENT_LIMIT` lists the
    permissions a department limit does not narrow (pay: payroll and
    compensation, resignations: offboarding, the audit log) and `unlimitedAreas`
    returns the areas a role carries. `GET /employees/:id/roles` gives each role
    `unlimitedByDepartment`.
  - `AccountRolesCard` shows the note once a department is chosen on a role
    whose list is not empty; it does not block saving. Thai strings in
    `messages.th.ts`, `docs/security.md` and `docs/guide/account-roles.th.md`.
  - **For the PO:** MANAGER carries `employee:read:team`, not `employee:read`, so
    the console never offers it a department limit; the acceptance line about
    MANAGER holds because the limit does not apply, and the test says so. The
    roles the note appears on today are PAYROLL_OFFICER (pay), HR_OFFICER
    (resignations) and AUDITOR (pay, resignations, audit log). Checked the
    other areas against the code: only these three sit outside the filter.
- **CW-082** passed review. **CW-048** passed review (the upload-file formatter
  is CW-085 #88, waits on the owner's e-Services sample).

## Next

- Wait for the PO's review of CW-083. Do not start CW-085.
