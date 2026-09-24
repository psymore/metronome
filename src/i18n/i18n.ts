import type { Language } from '../state/settings';
import { translations } from './translations';

const DEFAULT_LANGUAGE: Language = 'en';
let currentLanguage: Language = DEFAULT_LANGUAGE;

export function getLanguage(): Language {
  return currentLanguage;
}

export function t(key: string): string {
  return translations[currentLanguage]?.[key] ?? translations[DEFAULT_LANGUAGE]?.[key] ?? key;
}

export function format(key: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    t(key),
  );
}

/** Applies every data-i18n* attribute under `root` using the current language. */
export function applyTranslations(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n ?? '');
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel ?? ''));
  }
}

/** Sets the active language, re-translates the DOM, and returns the new language. */
export function applyLanguage(lang: Language, root: ParentNode = document): void {
  if (lang === currentLanguage) return;
  currentLanguage = lang;
  applyTranslations(root);
}
