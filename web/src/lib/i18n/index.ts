// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useUiStore, type Language } from '@/stores/ui.store';
import { thMessages } from './messages.th';

export type { Language };

/** The languages offered in the switcher; each label is written in its own script. */
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'English' },
];

/** Current language, read outside React (formatters, error mappers). */
export function getLanguage(): Language {
  return useUiStore.getState().language;
}

/**
 * Message keys ARE the English text (CW-016): English needs no catalogue, and a
 * missing Thai entry falls back to the readable English key rather than a blank.
 * `{name}` placeholders are filled from `params`.
 */
export function translate(
  key: string,
  language: Language,
  params?: Record<string, string | number>,
): string {
  const base = language === 'th' ? (thMessages[key] ?? key) : key;
  if (!params) return base;
  return base.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * English has a singular. Keys are the English text, so the singular wording is
 * its own key (with its own Thai entry, which is the same Thai: Thai does not
 * inflect) and `count` picks between the two: `t(plural(n, one, other), { count: n })`.
 */
export function plural(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}

/**
 * Translate outside a React component, against the current language. Components
 * should use `useT` instead so they re-render when the language changes.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(key, getLanguage(), params);
}
