// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { tokenPredatesInvalidation } from './session-validity';

/** A whole-second `iat`, the way a JWT records one. */
const iatAt = (ms: number): number => Math.floor(ms / 1000);

describe('tokenPredatesInvalidation', () => {
  const noon = Date.UTC(2026, 8, 17, 12, 0, 5);

  it('accepts a token signed in the same second the invalidation landed', () => {
    // The bug this exists for. A password change at .740 and a sign-in at .900
    // share a second, so the token's `iat` reads as .000 — earlier than the
    // timestamp it is compared against, though it was issued after it.
    expect(tokenPredatesInvalidation(iatAt(noon + 900), new Date(noon + 740))).toBe(false);
  });

  it('accepts a token signed before the invalidation but inside the same second', () => {
    // Deliberate, and documented: `iat` does not record the millisecond, so
    // this cannot be told apart from the case above.
    expect(tokenPredatesInvalidation(iatAt(noon + 100), new Date(noon + 740))).toBe(false);
  });

  it('refuses a token from any earlier second', () => {
    expect(tokenPredatesInvalidation(iatAt(noon - 1), new Date(noon + 740))).toBe(true);
    expect(tokenPredatesInvalidation(iatAt(noon - 60_000), new Date(noon + 740))).toBe(true);
  });

  it('accepts a token from a later second', () => {
    expect(tokenPredatesInvalidation(iatAt(noon + 1_000), new Date(noon + 740))).toBe(false);
  });

  it('accepts a token issued in the same second as an invalidation on the second', () => {
    // `sessionsValidFrom` with no milliseconds — what setup.service.ts records
    // for a brand-new account, where nothing has been invalidated at all.
    expect(tokenPredatesInvalidation(iatAt(noon), new Date(noon))).toBe(false);
  });

  it('refuses the second before an invalidation on the second', () => {
    expect(tokenPredatesInvalidation(iatAt(noon - 1_000), new Date(noon))).toBe(true);
  });
});
