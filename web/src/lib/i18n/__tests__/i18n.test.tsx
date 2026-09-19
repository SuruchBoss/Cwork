import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMinutes, formatMoney, yearsOfService } from '@/lib/format';
import { translate } from '@/lib/i18n';
import { useT } from '@/lib/i18n/useT';
import { useUiStore } from '@/stores/ui.store';

afterEach(() => {
  // The store is a singleton; reset language so tests do not leak into each
  // other. Wrapped in act because a mounted subscriber would re-render.
  act(() => {
    useUiStore.setState({ language: 'th', languageExplicit: false });
  });
});

describe('translate', () => {
  it('returns the Thai translation for a known key', () => {
    expect(translate('Approvals', 'th')).toBe('รออนุมัติ');
  });

  it('returns the English key itself in English (English needs no catalogue)', () => {
    expect(translate('Approvals', 'en')).toBe('Approvals');
  });

  it('falls back to the key when a Thai translation is missing', () => {
    expect(translate('An untranslated string', 'th')).toBe('An untranslated string');
  });

  it('fills {name} placeholders from params', () => {
    expect(translate('{n} days', 'en', { n: 3 })).toBe('3 days');
  });

  it('leaves an unmatched placeholder untouched', () => {
    expect(translate('{a} and {b}', 'en', { a: 'x' })).toBe('x and {b}');
  });
});

describe('locale-aware formatting', () => {
  it('formats durations in the current language', () => {
    useUiStore.setState({ language: 'th' });
    expect(formatMinutes(485)).toBe('8 ชม. 5 นาที');
    useUiStore.setState({ language: 'en' });
    expect(formatMinutes(485)).toBe('8 hr 5 min');
    expect(formatMinutes(0)).toBe('0 hr');
  });

  it('formats years of service in the current language', () => {
    useUiStore.setState({ language: 'th' });
    expect(yearsOfService('2000-01-01').endsWith('ปี')).toBe(true);
    useUiStore.setState({ language: 'en' });
    expect(yearsOfService('2000-01-01').endsWith('yr')).toBe(true);
  });

  it('formats currency for the active locale', () => {
    useUiStore.setState({ language: 'th' });
    const thai = formatMoney(1000);
    useUiStore.setState({ language: 'en' });
    const english = formatMoney(1000);
    // Both are THB, but th-TH and en-US render the symbol/grouping differently.
    expect(thai).not.toBe(english);
  });
});

describe('useT', () => {
  function Probe() {
    const t = useT();
    return <span data-testid="label">{t('Sign out')}</span>;
  }

  it('re-renders with the new language when it is switched', () => {
    render(<Probe />);
    expect(screen.getByTestId('label')).toHaveTextContent('ออกจากระบบ');

    act(() => {
      useUiStore.getState().setLanguage('en');
    });
    expect(screen.getByTestId('label')).toHaveTextContent('Sign out');
  });
});
