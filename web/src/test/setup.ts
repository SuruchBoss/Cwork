// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

// vitest-axe ships its matcher, but its own type augmentation targets the old
// `Vi` global namespace that Vitest no longer reads, so the fluent matcher is
// declared against the `vitest` module here. Extend `Matchers` — the shared
// base that both `Assertion` and `AsymmetricMatchersContaining` extend — and
// mirror its type parameters exactly, as of Vitest 5, or TS2428 rejects the
// merge.
expect.extend(axeMatchers);

afterEach(() => {
  cleanup();
});

interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

declare module 'vitest' {
  /* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type */
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends AxeMatchers<R> {}
  /* eslint-enable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type */
}
