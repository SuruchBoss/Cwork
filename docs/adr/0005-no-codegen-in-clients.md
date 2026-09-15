# 5. No code generation in either client

**Status:** Accepted

## Context

Both clients have idiomatic codegen options: `openapi-typescript` for the web
console, and `freezed` + `json_serializable` + `riverpod_generator` for Flutter.
They eliminate hand-written boilerplate and keep models in sync with the API.

## Decision

Neither client uses code generation. Web API types are hand-written from the
documented contract; Flutter models are hand-written with `fromJson`/`toJson`;
Riverpod providers are written directly.

## Rationale

For an open-source project the cost is paid by contributors, not by us. A
generated client means `build_runner watch` running for a one-line change, a
generation step to forget before committing, and merge conflicts in files nobody
reads. For a first-time contributor fixing a typo, that is a real barrier.

The benefit is also smaller than it looks here: the API surface is stable, and
hand-written types give a place to document *why* a field exists — which the
generated version cannot carry.

## Consequences

**Good.** `flutter run` and `npm run dev` work immediately after clone. Types
carry comments. No generated files in review.

**Bad.** An API change must be mirrored by hand in up to two places, and nothing
catches it if you forget — the drift shows up as a runtime parse error, not a
compile error. Model files are longer.

**Revisit if** the API starts changing frequently, or a drift bug reaches
production. The mitigation short of full codegen is a contract test that asserts
the hand-written types match `/api/docs`.
