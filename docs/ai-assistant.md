# The HR assistant

An assistant that answers HR questions and files requests on an employee's
behalf. It is **off by default** — `ASSISTANT_ENABLED=false` — and the rest of
the HRIS works identically without it.

Off means invisible, not broken. Both clients read `GET /config`, a public
endpoint that reports the flag, and neither offers a way in when it is false:
the console drops the sidebar entry, the app drops the bottom-navigation tab.
That is a separate question from permissions — every role carries
`assistant:use`, so permissions alone would have put an entry in front of every
employee that opened onto an apology. A bookmark saved while the assistant was
on still resolves, to a screen that explains it is switched off rather than to a
404.

## Design premise

An HR assistant is only useful if people trust its answers, and only safe if a
compromised model cannot reach data the user could not already see. Everything
below follows from those two constraints.

### It never queries the database

The model calls tools. Every tool is executed server-side and resolves the
subject from the authenticated principal — **no tool accepts an employee id**.

That is the whole security model in one sentence. There is no parameter a prompt
injection could set to read someone else's payslip, because the parameter does
not exist. The blast radius of a fully compromised model is bounded by what the
signed-in user could already see through the normal UI.

### It answers policy from a corpus, not from memory

Policy answers come from the HR knowledge base, retrieved and cited. The system
prompt instructs the model to say it cannot find something rather than invent
it — a confidently wrong answer about sick leave entitlement is worse than no
answer.

Retrieval is Postgres full-text plus trigram similarity, which needs no
embedding provider and no external API call. Thai has no whitespace word
boundaries, so `to_tsvector('simple', …)` alone under-matches; the trigram term
catches what tokenisation misses. Semantic search over pgvector is available but
optional — the default install answers policy questions with no AI provider
involved in retrieval at all.

### Write actions need a human "yes"

`submit_leave_request` and `request_document` require `confirmed: true`, and the
prompt requires the model to summarise the request and get an explicit
confirmation first. Both set `createdViaAssistant`, which the web console and
mobile app display, so HR can always tell an assistant-filed request apart.

The assistant **cannot** approve anything, change salary, edit employee records,
or act for another employee.

## Tools

| Tool | Reads | Writes |
|---|---|---|
| `get_my_profile` | own employee record | — |
| `get_leave_balance` | own balances | — |
| `list_my_leave_requests` | own requests | — |
| `preview_leave_request` | computes cost + resulting balance | — |
| `submit_leave_request` | — | own leave request (confirmed) |
| `get_attendance_today` | own clock-in status | — |
| `get_attendance_summary` | own monthly totals | — |
| `get_latest_payslip` | own published payslips | — |
| `request_document` | — | own document request (confirmed) |
| `search_hr_policy` | knowledge base (role-filtered) | — |
| `list_holidays` | org holiday calendar | — |
| `get_pending_approvals` | own approval queue (managers) | — |

Every call is written to the audit log with its arguments under `AI_TOOL_CALL`.

Tools compose the same services the REST API uses, so every rule those services
enforce — balance checks, notice periods, overlap detection, approval routing —
applies identically whether a request comes from a human or the assistant. The
assistant cannot take a shortcut a person could not.

## Guardrails

**Before the model is called:** messages matching crisis or harassment patterns
are never sent. They get a fixed reply that refers the person to a human and, in
Thailand, the Department of Mental Health hotline (1323). An LLM is the wrong
thing to put between someone in crisis and help.

**In the system prompt:** scope to the current user, refuse to answer about
other employees, cite the knowledge base or admit ignorance, confirm before
writing, never give legal advice, escalate discipline and dispute topics.

**After the model replies:** a redactor masks anything resembling a Thai national
ID or a bank account number. Defence in depth — those values should never reach
the model in the first place.

**Around the loop:** the tool-calling loop is bounded at 6 iterations, history at
20 messages, and each user has daily message and token caps.

## Provider

`LlmProvider` is a four-method interface. The default implementation uses
Anthropic (`claude-sonnet-5`); `DisabledProvider` is selected when the assistant
is off, so the endpoints return a clear
`ASSISTANT_DISABLED` rather than failing oddly.

`ASSISTANT_PROVIDER` accepts exactly the two names that have an implementation,
`anthropic` and `none`, and `ASSISTANT_ENABLED=true` without a provider that can
answer is refused at boot. A name the factory cannot honour would otherwise boot
clean, report the assistant through `GET /config`, and fail every question.

Implementing another provider — including against a self-hosted model — means
implementing `complete()`, registering it in `AssistantModule` and adding its
name to the validated set. This matters for an HRIS: an operator must be able to
choose which model sees payroll data, or run one themselves. That is not
something the project ships today; [CW-018](https://github.com/SuruchBoss/Cwork/issues/16)
tracks it for the OpenAI-compatible APIs that Ollama, vLLM and LiteLLM expose.

## Operating it

The quality of the assistant is the quality of the knowledge base. Two habits:

1. **Write policy into the knowledge base, not into the prompt.** The prompt
   describes behaviour; the corpus holds facts. Editing a document re-indexes it
   and bumps its version, so an answer can be traced to a policy revision.
2. **Work the flagged queue.** `GET /assistant/flagged` returns answers rated
   thumbs-down or blocked by a guardrail. Each one is either a gap in the corpus
   or a prompt that needs tightening. HR admins see it at **ฐานความรู้ HR** in
   the console.

## Costs and data flow

With the assistant enabled, each turn sends the employee's name, code, position,
department, retrieved policy passages and the conversation to your model
provider. Tool *results* — balances, payslip figures — are also sent, because the
model needs them to answer.

That is a real data-flow decision and it should be made deliberately, not by
default. It is why the feature ships off.
