// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The organisation's short code.
 *
 * `Organization.code` is unique and required, and it is what shows up in log
 * lines and scheduled-job output (`[CWORK] rolled over 12 entitlements`). Asking
 * a first-time installer to invent one is a poor first question, so setup
 * suggests one from the organisation's name and lets them overwrite it.
 */

/** Anything outside this is refused rather than silently mangled. */
export const ORGANIZATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,11}$/;

export const ORGANIZATION_CODE_RULE =
  'Use 2–12 characters: A–Z, 0–9, hyphen or underscore, starting with a letter or digit.';

/**
 * A code derived from a name, or `MAIN` when nothing usable survives.
 *
 * A Thai name — which is the common case here — has no ASCII to work with, and
 * a transliteration would be a guess. `MAIN` is honest about being a placeholder
 * and is a perfectly good code for an install that will only ever hold one
 * organisation.
 */
export function suggestOrganizationCode(name: string): string {
  const ascii = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .trim();
  if (!ascii) return 'MAIN';

  // Drop the words that appear in every company name and carry no identity. If
  // that leaves nothing — "บริษัท Co Ltd" reduces to exactly that — then the
  // name has no ASCII identity in it and `MAIN` beats suggesting `CO`.
  const NOISE = new Set(['CO', 'LTD', 'INC', 'LLC', 'PLC', 'COMPANY', 'LIMITED', 'THE', 'GROUP']);
  const candidate = (ascii.split(/\s+/).find((word) => !NOISE.has(word)) ?? '').slice(0, 12);

  return ORGANIZATION_CODE_PATTERN.test(candidate) ? candidate : 'MAIN';
}

/** Whether a timezone is one this runtime actually knows about. */
export function isKnownTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
