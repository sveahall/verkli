/**
 * Central language config – single source of truth for supported languages.
 * Used for UI labels, SEO text, and normalizing book.language.
 */

export const SUPPORTED_LANGUAGE_CODES = ["en", "es", "fr", "de", "it", "pt", "sv"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGE_CODES)[number];

const DISPLAY_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  sv: "Swedish",
};

const SEO_LABELS: Record<SupportedLanguage, string> = {
  en: "in English",
  es: "in Spanish",
  fr: "in French",
  de: "in German",
  it: "in Italian",
  pt: "in Portuguese",
  sv: "in Swedish",
};

export function isSupportedLanguage(code: string): code is SupportedLanguage {
  return SUPPORTED_LANGUAGE_CODES.includes(code as SupportedLanguage);
}

export function getLanguageLabel(code: string): string {
  return isSupportedLanguage(code) ? DISPLAY_NAMES[code] : code;
}

export function getSeoLanguageLabel(code: string): string {
  return isSupportedLanguage(code) ? SEO_LABELS[code] : `in ${code}`;
}

/**
 * Normalizes raw language from DB/API to a supported code. Unknown/null → "en".
 */
export function normalizeLanguage(code: string | null | undefined): SupportedLanguage {
  if (code == null || code === "") return "en";
  const trimmed = String(code).trim().toLowerCase();
  return isSupportedLanguage(trimmed) ? trimmed : "en";
}

/** For dropdowns: { value, label } from central config. */
export const LANGUAGE_OPTIONS: Array<{ value: SupportedLanguage; label: string }> =
  SUPPORTED_LANGUAGE_CODES.map((value) => ({ value, label: DISPLAY_NAMES[value] }));
