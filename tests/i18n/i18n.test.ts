import { describe, expect, it } from 'vitest';
import { format, getLanguage, t } from '../../src/i18n/i18n';
import { translations } from '../../src/i18n/translations';

describe('i18n', () => {
  it('defaults to English and returns the raw key when a translation is missing', () => {
    expect(getLanguage()).toBe('en');
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('resolves a known key in the current language', () => {
    expect(t('app.title')).toBe('Metronome');
  });

  it('substitutes {placeholders} in a formatted string', () => {
    expect(format('barCounter.withTarget', { n: 3, total: 14 })).toBe('Bar 3 / 14');
  });

  it('every Turkish key has an English counterpart and vice versa', () => {
    expect(Object.keys(translations.tr).sort()).toEqual(Object.keys(translations.en).sort());
  });
});
