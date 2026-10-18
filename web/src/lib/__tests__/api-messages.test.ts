// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { describeApiError } from '@/lib/api-messages';
import { ApiError } from '@/lib/api-error';
import { translate } from '@/lib/i18n';

const th = (key: string, params?: Record<string, string | number>) => translate(key, 'th', params);
const en = (key: string, params?: Record<string, string | number>) => translate(key, 'en', params);

const refusal = (code: string, message: string, details?: unknown) =>
  new ApiError(422, code, message, details);

describe('describeApiError (CW-096)', () => {
  it('turns a code it knows into Thai, filling the sentence from the details', () => {
    const error = refusal(
      'DUPLICATE_SCANNER_ID',
      'Scanner number 77 already belongs to employee E-1',
      {
        employeeCode: 'E-1',
        scannerNumber: '77',
      },
    );
    expect(describeApiError(error, th, 'x')).toBe('เลขสแกน 77 เป็นของพนักงาน E-1 อยู่แล้ว');
  });

  it('gives English readers the same sentence the server sent', () => {
    const message = 'Employee E-1 already has scanner number 77';
    const error = refusal('EMPLOYEE_HAS_SCANNER_NUMBER', message, {
      employeeCode: 'E-1',
      scannerNumber: '77',
    });
    expect(describeApiError(error, en, 'x')).toBe(message);
  });

  it.each([
    ['SCANNER_NUMBER_NOT_REGISTERED'],
    ['SCANNER_DAY_HAS_NO_TIMES'],
    ['DAY_LOCKED'],
    ['DECISION_NOTHING_TO_USE'],
    ['DECISION_TIME_NOT_ON_DAY'],
    ['DECISION_OUT_NOT_AFTER_IN'],
    ['DECISION_IGNORE_TAKES_NO_TIMES'],
  ])('has Thai for %s, so the server sentence never reaches a Thai screen', (code) => {
    const shown = describeApiError(refusal(code, 'SERVER ENGLISH'), th, 'x');
    expect(shown).not.toBe('SERVER ENGLISH');
    expect(shown).toMatch(/[฀-๿]/);
  });

  it('shows the server message for a code it does not know, or when the details lack a value', () => {
    expect(describeApiError(refusal('SOMETHING_NEW', 'Server words'), th, 'x')).toBe(
      'Server words',
    );
    expect(
      describeApiError(
        refusal('RANGE_NOT_SUPPORTED', 'Choose a range of 1 to 93 days', { from: 'a' }),
        th,
        'x',
      ),
    ).toBe('Choose a range of 1 to 93 days');
  });

  it('shows the fallback for anything that is not an API error', () => {
    expect(describeApiError(new Error('boom'), th, 'ผิดพลาด')).toBe('ผิดพลาด');
  });
});
