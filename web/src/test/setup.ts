import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

// vitest-axe ships its matcher, but its type augmentation targets the old `Vi`
// global namespace that Vitest 3 no longer reads, so the fluent matcher is
// declared against the `vitest` module here.
expect.extend(axeMatchers);

afterEach(() => {
  cleanup();
});

interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

declare module 'vitest' {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
  interface Assertion<T = any> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
}
