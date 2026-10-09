// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiError } from '@/lib/api-error';

/** What a code may look like, said as the form's hint and as its refusal (CW-072). */
export const CODE_FORMAT =
  'Use capital English letters, digits, - or _, starting with a letter or digit, up to 32 characters. For example HR or SALES-01.';
export const LOCATION_CODE_FORMAT =
  'Use capital English letters, digits and -, starting with a letter or digit, 2 to 32 characters. For example HQ or BKK-01.';

/**
 * The API's refusal in words that say what to change. Validation and
 * uniqueness errors arrive with an English, column-level message, so they are
 * recognised by code and reworded; a refusal the server already words in Thai
 * (a locked work-location code) is shown as it came.
 */
export function orgErrorMessage(
  error: unknown,
  kind: 'department' | 'position' | 'location',
  code: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : t('Could not save');
  }
  if (error.code === 'DUPLICATE_VALUE') {
    return t('The code "{code}" is already used. Choose another code.', { code });
  }
  const details = Array.isArray(error.details) ? error.details.map(String) : [error.message];
  if (error.code === 'VALIDATION_FAILED' && details.some((d) => d.startsWith('code'))) {
    return kind === 'location' ? t(LOCATION_CODE_FORMAT) : t(CODE_FORMAT);
  }
  return error.message;
}
