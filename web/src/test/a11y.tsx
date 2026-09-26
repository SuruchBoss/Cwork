// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect } from 'vitest';
import { axe } from 'vitest-axe';

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
}
