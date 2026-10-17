// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { bahtText } from './baht-text.util';

describe('bahtText', () => {
  it.each([
    ['0', 'ศูนย์บาทถ้วน'],
    ['1', 'หนึ่งบาทถ้วน'],
    ['10', 'สิบบาทถ้วน'],
    ['11', 'สิบเอ็ดบาทถ้วน'],
    ['20', 'ยี่สิบบาทถ้วน'],
    ['21', 'ยี่สิบเอ็ดบาทถ้วน'],
    ['101', 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    ['111', 'หนึ่งร้อยสิบเอ็ดบาทถ้วน'],
    ['1,000'.replace(',', ''), 'หนึ่งพันบาทถ้วน'],
    ['25050', 'สองหมื่นห้าพันห้าสิบบาทถ้วน'],
    ['1234', 'หนึ่งพันสองร้อยสามสิบสี่บาทถ้วน'],
    ['100000', 'หนึ่งแสนบาทถ้วน'],
    ['1000000', 'หนึ่งล้านบาทถ้วน'],
    ['1000001', 'หนึ่งล้านเอ็ดบาทถ้วน'],
    ['21000000', 'ยี่สิบเอ็ดล้านบาทถ้วน'],
    ['1500000000', 'หนึ่งพันห้าร้อยล้านบาทถ้วน'],
    ['1234567.89', 'หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์'],
  ])('writes %s as words', (amount, words) => {
    expect(bahtText(amount)).toBe(words);
  });

  it('writes the satang after the baht and reads one satang as "หนึ่ง" and 21 as "ยี่สิบเอ็ด"', () => {
    expect(bahtText('0.01')).toBe('ศูนย์บาทหนึ่งสตางค์');
    expect(bahtText('3.21')).toBe('สามบาทยี่สิบเอ็ดสตางค์');
    expect(bahtText('3.50')).toBe('สามบาทห้าสิบสตางค์');
  });

  it('rounds to the satang, half up, and does not drift on a float', () => {
    expect(bahtText('2.005')).toBe('สองบาทหนึ่งสตางค์');
    expect(bahtText(0.1 + 0.2)).toBe('ศูนย์บาทสามสิบสตางค์');
  });

  it('marks a negative amount', () => {
    expect(bahtText('-12.00')).toBe('ลบสิบสองบาทถ้วน');
  });
});
