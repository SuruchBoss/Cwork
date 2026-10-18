// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The menu must never scroll sideways. jsdom lays nothing out, so this cannot
 * measure it; it keeps the two rules that stop it. The measurement itself is
 * in docs/screenshots/capture.mjs, which fails when the menu is wider than its
 * column, in both languages.
 */
const css = readFileSync(join(__dirname, '..', 'app.css'), 'utf8');

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[1];
}

describe('The side menu stays inside its column', () => {
  it('says it does not scroll sideways, since overflow-y alone makes overflow-x auto', () => {
    const sidebar = rule('.sidebar');
    expect(sidebar).toMatch(/overflow-y:\s*auto/);
    expect(sidebar).toMatch(/overflow-x:\s*hidden/);
  });

  it('lets the wide footer button shrink instead of pushing the row out (Thai "ออกจากระบบ")', () => {
    expect(rule('.sidebar__control--wide')).toMatch(/min-width:\s*0/);
  });
});
