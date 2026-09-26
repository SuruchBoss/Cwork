// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useCallback } from 'react';
import { useUiStore } from '@/stores/ui.store';
import { translate } from './index';

/**
 * Returns a `t(key, params?)` bound to the current language. Reads the language
 * from the store reactively, so every component that translates re-renders when
 * the language is switched.
 */
export function useT() {
  const language = useUiStore((s) => s.language);
  return useCallback(
    (key: string, params?: Record<string, string | number>) => translate(key, language, params),
    [language],
  );
}
