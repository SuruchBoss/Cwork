// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect } from 'vitest';
import { axe } from 'vitest-axe';
import { useUiStore } from '@/stores/ui.store';

/**
 * Renders a screen with the providers it needs to mount in isolation. A fresh
 * QueryClient per render keeps tests from sharing cache, and retries are off so
 * a rejected query surfaces immediately instead of stalling the test.
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/**
 * Runs axe over rendered DOM and asserts no violations.
 *
 * `color-contrast` is disabled on purpose: jsdom applies no stylesheets, so
 * `getComputedStyle` returns no colours and axe cannot judge contrast in this
 * environment (it would report every node as "incomplete", not pass or fail).
 * Contrast is validated numerically against the theme tokens instead — see the
 * ratios worked out for `--text-subtle` in styles/theme.css. Everything axe can
 * judge without layout — accessible names, labels, roles, ARIA — is enforced.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results).toHaveNoViolations();
  expectBuddhistEraYears(container);
}

/** Thai month names and abbreviations, as the console writes them. */
const THAI_MONTH =
  '(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|' +
  'ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.)';

/** A year as a Thai reader would see it, and the forms that give a Gregorian one away. */
const GREGORIAN_ON_THAI_SCREEN = [
  // "28 ก.ย. 2026", "สิงหาคม 2026"
  new RegExp(`${THAI_MONTH}\\s*(?:19|20)\\d{2}\\b`),
  // An ISO date or a pay period's code, shown as the API sends it: 2026-10-01, 2026-08
  /(?<![\w-])(?:19|20)\d{2}-(?:0[1-9]|1[0-2])(?:-\d{2})?(?![\w-])/,
];

/**
 * Fails when a Thai screen shows a Gregorian year (CW-058). Thai counts years
 * in the Buddhist era, so a date is "28 ก.ย. 2569", never "28 ก.ย. 2026", and
 * an ISO date or a period code such as "2026-08" is the API's value leaking
 * onto the screen. Every screen test reaches this through
 * expectNoAxeViolations, so a new screen is checked without anyone having to
 * remember to. Form fields are checked too: a value shown in an input is on
 * the screen as much as text is.
 */
export function expectBuddhistEraYears(container: Element): void {
  if (useUiStore.getState().language !== 'th') return;
  const shown = [
    container.textContent ?? '',
    ...Array.from(container.querySelectorAll('input:not([type=hidden]), textarea')).map(
      (field) => (field as HTMLInputElement).value,
    ),
  ].join('\n');
  for (const pattern of GREGORIAN_ON_THAI_SCREEN) {
    const found = pattern.exec(shown);
    expect(
      found?.[0],
      'a Gregorian year on a Thai screen; format it with lib/format',
    ).toBeUndefined();
  }
}
