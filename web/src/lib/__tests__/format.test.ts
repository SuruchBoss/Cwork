import { describe, expect, it } from 'vitest';
import { formatMinutes, formatMoney, formatNumber, initials } from '../format';

describe('formatMinutes', () => {
  it('renders hours and minutes', () => {
    expect(formatMinutes(485)).toBe('8 ชม. 5 นาที');
  });

  it('drops the minutes when they are zero', () => {
    expect(formatMinutes(480)).toBe('8 ชม.');
  });

  it('renders minutes only under an hour', () => {
    expect(formatMinutes(45)).toBe('45 นาที');
  });

  it('renders an explicit zero rather than an em dash', () => {
    expect(formatMinutes(0)).toBe('0 ชม.');
  });

  it('renders an em dash when the value is missing', () => {
    expect(formatMinutes(null)).toBe('—');
  });
});

describe('formatMoney', () => {
  it('accepts the string decimals the API returns', () => {
    expect(formatMoney('42900.00')).toContain('42,900.00');
  });

  it('renders an em dash for a missing amount rather than ฿0.00', () => {
    expect(formatMoney(null)).toBe('—');
  });
});

describe('formatNumber', () => {
  it('honours the requested precision', () => {
    expect(formatNumber('6.5', 1)).toBe('6.5');
    expect(formatNumber(6.5, 0)).toBe('7');
  });
});

describe('initials', () => {
  it('takes the first letter of each of the first two words', () => {
    expect(initials('สมชาย ใจดี')).toBe('สใ');
  });

  it('falls back to the first two characters of a single word', () => {
    expect(initials('Somchai')).toBe('So');
  });

  it('handles a missing name', () => {
    expect(initials(null)).toBe('?');
  });
});
