// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Both ways of getting the dark theme must give the same quiet text colour:
 * the OS preference and the console's own switch. They drifted once, and the
 * switch's #6f7887 on the dark surface is only about 3.9:1, under the 4.5:1
 * that small text needs.
 */
const css = readFileSync(join(__dirname, '..', 'theme.css'), 'utf8');

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('dark theme text colours', () => {
  it('uses the same --text-subtle in the switch as in the OS preference', () => {
    const values = [...css.matchAll(/--text-subtle:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
    // light, prefers-color-scheme: dark, [data-theme='dark']
    expect(values).toHaveLength(3);
    expect(values[2]).toBe(values[1]);
  });

  it('reads at 4.5:1 or better on the dark surface', () => {
    const [, , dark] = [...css.matchAll(/--text-subtle:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
    expect(contrast(dark, '#171a21')).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * Text on a filled brand surface (CW-096): white on the dark theme's light blue
 * was 2.62:1. The text takes --text-inverse, which is white in the light theme
 * and near-black in the dark one, so each theme has its own readable pair.
 */
const app = readFileSync(join(__dirname, '..', 'app.css'), 'utf8');

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(app);
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[1];
}

describe('text on the brand colour', () => {
  /** Each theme's brand, brand on hover, and inverse text, in the order the file writes them. */
  const pairs = (name: string) =>
    [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'gi'))].map((m) => m[1]);

  it('reads at 4.5:1 or better in the light theme and in both ways of getting the dark one', () => {
    const brand = pairs('brand');
    const hover = pairs('brand-hover');
    const inverse = pairs('text-inverse');
    // light, prefers-color-scheme: dark, [data-theme='dark']
    expect([brand.length, hover.length, inverse.length]).toEqual([3, 3, 3]);
    for (let theme = 0; theme < 3; theme++) {
      expect(contrast(inverse[theme], brand[theme])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(inverse[theme], hover[theme])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reads at 4.5:1 or better on the red fills too, in every theme (CW-097: 2.8:1 in the dark one)', () => {
    const danger = pairs('danger');
    const inverse = pairs('text-inverse');
    expect([danger.length, inverse.length]).toEqual([3, 3]);
    for (let theme = 0; theme < 3; theme++) {
      expect(contrast(inverse[theme], danger[theme])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    '.btn--primary',
    '.sidebar__logo',
    ".date-input__day[aria-pressed='true']",
    '.chat__bubble--user',
    '.btn--danger',
    '.nav-link__badge',
  ])('is set from --text-inverse, not a fixed white, on %s', (selector) => {
    expect(declarations(selector)).toMatch(/color:\s*var\(--text-inverse\)/);
  });
});
