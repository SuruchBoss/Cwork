# 4. Assistant tools take no employee id

**Status:** Accepted

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

**No assistant tool accepts an employee id.** Every tool resolves the subject
from the authenticated principal server-side.

Additionally: write tools require `confirmed: true` and an explicit human yes;
every tool call is audited with its arguments; the assistant cannot approve
anything or edit employee records.

## Consequences

**Good.** There is no parameter a prompt injection can set to read someone
else's payslip, because the parameter does not exist. The blast radius of a
fully compromised model is bounded by what the signed-in user could already see
through the normal UI. This is a structural guarantee, not a prompt that might
be talked around.

**Bad.** A manager cannot ask "how much leave does Somchai have left?" — they use
the console. Team-scoped tools would need a separate, carefully designed
mechanism.

**Revisit carefully if** team queries become important. The safe shape would be a
tool that takes no id and returns the caller's whole team, with the server
deciding who that is — never a tool that takes a name or id from the model.
