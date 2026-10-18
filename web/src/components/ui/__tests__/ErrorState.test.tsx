// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorState } from '../index';

describe('ErrorState (CW-096)', () => {
  it('draws its icon, as every empty state does, instead of typing a ⚠ character', () => {
    const { container } = render(<ErrorState error={new Error('boom')} />);

    expect(container.querySelector('.empty__icon svg.icon')).not.toBeNull();
    expect(container.querySelector('.empty__icon')?.textContent).toBe('');
    expect(container.textContent).not.toContain('⚠');
  });
});
