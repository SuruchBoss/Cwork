## Context economy

Claude Code resends the whole conversation on every turn, so context that isn't needed is paid for again each message. Keep the working context small.

* Read scoped, not whole. Use search (grep/glob) and targeted line ranges to read only what the task needs. Don't re-read a file already in context unless it may have changed (merge, formatter, another tool, another room's push).
* Keep raw output out of context. Filter logs, test runs and build output with `head`/`tail`/`grep`, or write them to a file and read back only the relevant lines. When something fails, quote the failing lines and the first error verbatim; don't paraphrase them.
* Delegate broad searches. When answering needs a sweep across many files, use a subagent (Explore) and keep only its conclusion in the main context.
* Make focused edits. Change only what the task needs. Verifying results is not optional and does not count as re-reading: still run the tests, open generated output, and confirm remote state (e.g. `git ls-tree origin/<branch>`) before reporting done.
* One unit of work at a time. When a unit of work is finished, first record its state where the next session will look (handoff, backlog, or the issue), then suggest the user run `/clear` before unrelated work, or `/compact` at a phase break in a long task. Leave the decision to the user; never clear or compact unprompted.

## Waiting

* Before ending a turn to wait on something that will not wake this session by itself (CI on GitHub, a reply from another room, a review), arm a wake-up first: subscribe to the PR's activity, or schedule a check-in with send_later. Background tasks started in this session already wake it when they finish, so they need nothing extra.
* When the wait is on the user, say exactly what you need from them in the closing message instead of stopping silently.

## Session handoff

* Each room keeps its current state in one short file in this repo, under about 60 lines. Use an existing file when one is already that short (the UX room's `docs/handoff-uxui.th.md`); otherwise use `docs/handoff/ROLE.md`. The backlog is the PO's record of every ticket, not a short state file.
* Overwrite it with the current state instead of appending history: what is in progress, the next step, open questions, and who is waiting on whom. Git history keeps the past.
* Update it at the end of each unit of work and before suggesting /clear or /compact.
* A new or cleared session reads that file first, then only the files it points to, instead of re-reading broadly to rebuild context.
