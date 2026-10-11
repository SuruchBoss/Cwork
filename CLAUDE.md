## Context economy

Claude Code resends the whole conversation on every turn, so context that isn't needed is paid for again each message. Keep the working context small.

* Read scoped, not whole. Use search (grep/glob) and targeted line ranges to read only what the task needs. Don't re-read a file already in context unless it may have changed (merge, formatter, another tool, another room's push).
* Keep raw output out of context. Filter logs, test runs and build output with `head`/`tail`/`grep`, or write them to a file and read back only the relevant lines. When something fails, quote the failing lines and the first error verbatim; don't paraphrase them.
* Delegate broad searches. When answering needs a sweep across many files, use a subagent (Explore) and keep only its conclusion in the main context.
* Make focused edits. Change only what the task needs. Verifying results is not optional and does not count as re-reading: still run the tests, open generated output, and confirm remote state (e.g. `git ls-tree origin/<branch>`) before reporting done.
* One unit of work at a time. When a unit of work is finished, first record its state where the next session will look (handoff, backlog, or the issue), then suggest the user run `/clear` before unrelated work, or `/compact` at a phase break in a long task. Leave the decision to the user; never clear or compact unprompted.
