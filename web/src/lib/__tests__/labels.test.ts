// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { thMessages } from '@/lib/i18n/messages.th';
import * as labels from '@/lib/labels';

/**
 * Every label that stands in for a system code has a Thai translation.
 *
 * A label missing from the catalogue does not fail loudly: `t()` falls back to
 * the English key, so a Thai screen quietly shows one English word in a badge.
 * Screens used to show the raw code itself (CLOSED, DRAFT, LOGIN) the same way,
 * which is what an HR officer who is not a developer cannot read.
 */
describe('labels', () => {
  const maps = Object.entries(labels).filter(
    (entry): entry is [string, Record<string, string>] =>
      typeof entry[1] === 'object' && entry[1] !== null,
  );

  it.each(maps)('%s are all translated into Thai', (_name, map) => {
    const missing = Object.values(map).filter((label) => !(label in thMessages));
    expect(missing).toEqual([]);
  });
});
