export const SUPPORTED_LOCALES = ['sv', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'sv';
const LOCALE_COOKIE_NAME = 'verkli_locale';

function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase();
  const normalized = lower.split('-')[0];
  return SUPPORTED_LOCALES.includes(normalized as Locale) ? (normalized as Locale) : null;
}

function readCookieLocale(): Locale | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  const raw = cookie.slice(LOCALE_COOKIE_NAME.length + 1);
  return normalizeLocale(decodeURIComponent(raw));
}

function readNavigatorLocale(): Locale | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const primary = normalizeLocale(navigator.language);
  if (primary) {
    return primary;
  }

  for (const locale of navigator.languages ?? []) {
    const normalized = normalizeLocale(locale);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function getLocale(): Locale {
  return readCookieLocale() ?? readNavigatorLocale() ?? DEFAULT_LOCALE;
}
