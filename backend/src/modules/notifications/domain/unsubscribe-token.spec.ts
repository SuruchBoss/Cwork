// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { createUnsubscribeToken, readUnsubscribeToken } from './unsubscribe-token';

const SECRET = 'a-session-secret-that-is-at-least-32-characters';
const USER = '11111111-2222-3333-4444-555555555555';

describe('unsubscribe tokens', () => {
  it('reads back the user it was made for', () => {
    const token = createUnsubscribeToken(USER, SECRET);

    expect(readUnsubscribeToken(token, SECRET)).toBe(USER);
  });

  it('survives a URL, which is the only place it is ever used', () => {
    const token = createUnsubscribeToken(USER, SECRET);

    expect(token).toBe(encodeURIComponent(token));
  });

  it('refuses a token signed with a different secret', () => {
    // Rotating the session secret invalidates old links. That is the intended
    // bargain, and the test that says so.
    const token = createUnsubscribeToken(USER, SECRET);

    expect(readUnsubscribeToken(token, 'another-secret-of-at-least-32-characters')).toBeNull();
  });

  it('refuses a token whose user id was swapped', () => {
    const [, signature] = createUnsubscribeToken(USER, SECRET).split('.');
    const someoneElse = Buffer.from('99999999-9999-9999-9999-999999999999').toString('base64url');

    expect(readUnsubscribeToken(`${someoneElse}.${signature}`, SECRET)).toBeNull();
  });

  it('returns null rather than throwing on rubbish', () => {
    // These arrive from a URL bar, so every one of them is a real request some
    // day; a throw here is a 500 where a 404 belongs.
    for (const rubbish of ['', '.', 'no-dot', 'a.b', '....', 'x'.repeat(5000)]) {
      expect(readUnsubscribeToken(rubbish, SECRET)).toBeNull();
    }
  });

  it('is stable, so a link in an old email still works', () => {
    expect(createUnsubscribeToken(USER, SECRET)).toBe(createUnsubscribeToken(USER, SECRET));
  });
});
