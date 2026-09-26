// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  ORGANIZATION_CODE_PATTERN,
  isKnownTimezone,
  suggestOrganizationCode,
} from './organization-code';

describe('suggestOrganizationCode', () => {
  it('takes the first real word of an English name', () => {
    expect(suggestOrganizationCode('Acme Co., Ltd.')).toBe('ACME');
    expect(suggestOrganizationCode('Bangkok Widgets Limited')).toBe('BANGKOK');
  });

  it('skips the words every company name has', () => {
    expect(suggestOrganizationCode('The Siam Group')).toBe('SIAM');
    expect(suggestOrganizationCode('Co Ltd Northwind')).toBe('NORTHWIND');
  });

  it('falls back to MAIN for a Thai name rather than guessing a transliteration', () => {
    expect(suggestOrganizationCode('บริษัท ซีเวิร์ค จำกัด')).toBe('MAIN');
  });

  it('falls back to MAIN rather than suggesting something the API would reject', () => {
    // One character is below the two the pattern demands.
    expect(suggestOrganizationCode('X Holdings')).toBe('MAIN');
    expect(suggestOrganizationCode('   ')).toBe('MAIN');
    expect(suggestOrganizationCode('บริษัท Co Ltd')).toBe('MAIN');
  });

  it('never suggests something the pattern would refuse', () => {
    const names = [
      'Acme Co., Ltd.',
      'บริษัท ซีเวิร์ค จำกัด',
      '株式会社テスト',
      'A-Very-Long-Company-Name-Indeed',
      '123 Logistics',
      '',
    ];
    for (const name of names) {
      expect(ORGANIZATION_CODE_PATTERN.test(suggestOrganizationCode(name))).toBe(true);
    }
  });
});

describe('isKnownTimezone', () => {
  it('accepts the ones an installer is likely to type', () => {
    expect(isKnownTimezone('Asia/Bangkok')).toBe(true);
    expect(isKnownTimezone('UTC')).toBe(true);
  });

  it('refuses a typo rather than silently storing it', () => {
    expect(isKnownTimezone('Asia/Bangkock')).toBe(false);
    expect(isKnownTimezone('')).toBe(false);
  });
});
