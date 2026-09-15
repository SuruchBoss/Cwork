## What this changes

## Why

<!-- The reasoning is the part that is hard to recover later. If you made a
     non-obvious trade-off, consider an ADR in docs/adr/. -->

## Checklist

- [ ] Business rules live in a `domain/` directory and have unit tests
- [ ] New queries filter by `organizationId`
- [ ] New endpoints declare `@RequirePermissions`
- [ ] Money uses `Decimal`, never a float
- [ ] If a migration was generated, I removed any DROP targeting the
      hand-written objects, and `npm run db:verify` passes
- [ ] `npm run typecheck && npm run lint && npm test` passes in the affected
      package (`flutter analyze && flutter test` for mobile)

## How to verify

<!-- What should a reviewer run or click to see this working? -->
