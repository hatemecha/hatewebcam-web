export type Locale = 'es' | 'en';

export const LOCALE_STORAGE_KEY = 'hatewebcam_locale';

const supported = new Set<Locale>(['es', 'en']);
let locale: Locale = 'es';
const listeners = new Set<(value: Locale) => void>();

export function isLocale(value: string): value is Locale {
  return supported.has(value as Locale);
}

export function getLocale(): Locale {
  return locale;
}

export function subscribeLocale(listener: (value: Locale) => void): () => void {
  listeners.add(listener);
  listener(locale);
  return () => listeners.delete(listener);
}

export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isLocale(stored)) return stored;
  } catch {
    // Storage can be unavailable in private or hardened browser contexts.
  }
  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const language of languages) {
    const base = language?.toLowerCase().split('-')[0];
    if (base && isLocale(base)) return base;
  }
  return 'en';
}

export function setLocale(next: string, options?: { persist?: boolean }): void {
  if (!isLocale(next) || next === locale) {
    if (isLocale(next) && typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
    return;
  }
  locale = next;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  if (options?.persist !== false) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // The in-memory preference still applies for this page.
    }
  }
  for (const listener of listeners) listener(locale);
}

export function initializeI18n(): {
  getLocale: typeof getLocale;
  setLocale: typeof setLocale;
} {
  const detected = detectLocale();
  locale = detected;
  if (typeof document !== 'undefined') document.documentElement.lang = detected;
  for (const listener of listeners) listener(locale);
  return { getLocale, setLocale };
}
