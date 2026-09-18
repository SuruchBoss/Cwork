# 4. No assistant tool parameter widens the caller's reach

**Status:** Accepted · **Amended** 2026-09-18 (CW-042)

> **Amendment (2026-09-18).** This ADR was titled *Assistant tools take no
> employee id*, and on a literal reading it forbade the manager-facing tools in
> CW-039, CW-040 and CW-041. That was never the property it was protecting. The
> decision below is reworded to state the rule the original was reaching for —
> *no tool parameter may extend the caller's reach* — with "takes no employee
> id" kept as the specific case that first motivated it. The reasoning has not
> changed; only its scope is stated correctly. This is an amendment, not a new
> ADR, because the decision stands.

## Context

The HR assistant answers questions about the user's own data. The natural tool
signature is `get_leave_balance(employeeId)` — it mirrors the REST API and lets
a manager ask about their team.

Prompt injection makes that dangerous. An employee could paste a "policy
document" into a chat that instructs the model to call
`get_leave_balance("some-other-uuid")`. The model has no reliable way to
distinguish an instruction from its operator from one embedded in the data it
was asked to read.

## Decision

**No tool parameter may extend the caller's reach.** Whatever a tool takes, a
prompt injection that fills that parameter in must not let the model see, or
act on, anything the signed-in user could not already reach through the normal
UI.

Three shapes follow from that rule:

- **No tool accepts an employee id.** The subject of a personal query
  (`get_leave_balance`, `get_latest_payslip`) is always the authenticated
  principal, resolved server-side. This is the original case: an employee id is
  precisely a parameter that *would* widen reach, so it does not exist.
- **A manager-facing tool takes no subject at all.** It resolves its scope from
  the caller's permissions through the same `employeeVisibilityFilter` the
  console uses, so a manager sees their reports and nobody else's — by the same
  code path, whether they clicked or asked. The model never names whose data to
  return.
- **An id the caller already owns is allowed, because it does not widen reach.**
  A payroll run id or a performance review id identifies a record the caller can
  already open in the console; the tool re-checks that ownership server-side
  (`payroll:approve` for a run, `reviewerEmployeeId` for a review) exactly as
  the UI does. An employee id is different in kind: it names a *person* the
  caller may have no relationship to, and the model choosing which person is the
  attack. A run id names a *thing* whose access is already decided by a
  permission, not by the id.

Additionally, unchanged: write tools require `confirmed: true` and an explicit
human yes; every tool call is audited with its arguments; the assistant cannot
approve anything or edit employee records.

## Consequences

**Good.** There is no parameter a prompt injection can set to read someone
else's payslip. For personal tools the parameter does not exist; for a
run-scoped tool the parameter names a record the permission system already
guards, and the guard runs on every call regardless of who — or what — supplied
the id. The blast radius of a fully compromised model is bounded by what the
signed-in user could already see through the normal UI. This is a structural
guarantee, not a prompt that might be talked around.

**The test that keeps it honest.** A manager-facing or run-scoped tool must
prove, in an e2e test, that a caller lacking the permission is refused before
any data is read, and that an id belonging to another organisation resolves to
"not found" rather than to its owner's data. CW-040's `explain_payroll_run` is
the first tool to take an id, and carries both.

**Bad.** A manager still cannot ask "how much leave does Somchai have left?" by
name — the model would be choosing the person, which is the attack. They use the
console, or a manager-facing tool that returns their whole team with the server
deciding who that is.

**Revisit carefully if** a tool ever needs to take an id that names a person
rather than a record — that is the line this ADR draws, and crossing it needs a
new decision, not a wider reading of this one.
