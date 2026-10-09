// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiError } from '@/lib/api-error';
import { formatDate } from '@/lib/format';

/**
 * Why leave HR is recording was refused, in the words the employee would get
 * (the app's `error_text.dart`), with the employee named where it reads better
 * (CW-067). The server's message is English for developers; the code is the
 * contract.
 */
export function recordLeaveErrorMessage(
  error: unknown,
  context: { name: string; type: string },
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!(error instanceof ApiError)) return t('Something went wrong');
  const details = (error.details ?? {}) as Record<string, unknown>;
  const days = (key: string) => formatDays(details[key]);

  switch (error.code) {
    case 'INSUFFICIENT_LEAVE_BALANCE':
      return t('{name} has {available} days of {type} left, and this needs {requested}', {
        ...context,
        available: days('available'),
        requested: days('requested'),
      });
    case 'OVERLAPPING_LEAVE': {
      const from = formatDate(details.from as string | undefined);
      const to = formatDate(details.to as string | undefined);
      return t('{name} already has leave on some of these days ({dates})', {
        name: context.name,
        dates: from === to ? from : `${from} – ${to}`,
      });
    }
    case 'LEAVE_NOTICE_TOO_SHORT':
      // A day already past can never have had notice; "needs 0 days' notice" would puzzle.
      return Number(details.noticeDays) < 0
        ? t(
            'A day already past cannot be sent for approval. If the manager has agreed, choose "Record as approved"',
          )
        : t(
            'This leave type needs {days} days\' notice. If the manager has agreed, choose "Record as approved"',
            {
              days: days('requiredDays'),
            },
          );
    case 'LEAVE_ATTACHMENT_REQUIRED':
      return t(
        'This leave type needs a document before it goes to the manager. Attach it, or choose "Record as approved"',
      );
    case 'NO_WORKING_DAYS_SELECTED':
      return t('The days picked are all days off, so no leave is taken');
    case 'HALF_DAY_NOT_ALLOWED':
      return t('This leave type is taken in full days only');
    case 'EXCEEDS_MAX_CONSECUTIVE':
      return t('More days in a row than this leave type allows');
    case 'LEAVE_TYPE_NOT_ELIGIBLE':
      return t('{name} is not eligible for this leave type', context);
    case 'INSUFFICIENT_SERVICE':
      return t('{name} has not worked here long enough for this leave type', context);
    case 'CANNOT_RECORD_OWN_LEAVE':
      return t('Your own leave goes to your manager. Choose "Send to the manager to approve"');
    default:
      return error.message;
  }
}

/** 1, 1.5 or 2 — a day count as people write it. */
export function formatDays(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
