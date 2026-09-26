// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { SETUP_TOKEN_TTL_MINUTES, classifySetupToken, setupTokenExpiry } from './setup-token';

describe('setup token rules', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');

  it('expires an hour after it is minted', () => {
    expect(setupTokenExpiry(now).toISOString()).toBe('2026-09-15T11:00:00.000Z');
    expect(SETUP_TOKEN_TTL_MINUTES).toBe(60);
  });

  it('accepts a token that exists, is unspent and has not expired', () => {
    const fresh = { expiresAt: new Date('2026-09-15T10:30:00.000Z'), usedAt: null };
    expect(classifySetupToken(fresh, now)).toBe('valid');
  });

  it('rejects a token nobody ever issued', () => {
    expect(classifySetupToken(null, now)).toBe('unknown');
  });

  it('rejects a token that has already been used', () => {
    const spent = {
      expiresAt: new Date('2026-09-15T10:30:00.000Z'),
      usedAt: new Date('2026-09-15T10:05:00.000Z'),
    };
    expect(classifySetupToken(spent, now)).toBe('spent');
  });

  it('rejects an expired token', () => {
    const stale = { expiresAt: new Date('2026-09-15T09:59:59.000Z'), usedAt: null };
    expect(classifySetupToken(stale, now)).toBe('expired');
  });

  it('counts the moment of expiry as expired, not as the last usable instant', () => {
    expect(classifySetupToken({ expiresAt: now, usedAt: null }, now)).toBe('expired');
  });

  it('prefers "spent" over "expired" — a used token is used whenever you ask', () => {
    const both = { expiresAt: new Date('2026-09-15T09:00:00.000Z'), usedAt: new Date() };
    expect(classifySetupToken(both, now)).toBe('spent');
  });
});
