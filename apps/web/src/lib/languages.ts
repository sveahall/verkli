/**
 * Central language config – single source of truth for supported languages.
 * Used for UI labels, SEO text, and normalizing book.language.
 */

export const SUPPORTED_LANGUAGE_CODES = ["en", "es", "fr", "de", "it", "pt", "sv", "da", "no", "fi", "nl", "pl", "ru", "zh", "ja", "ko", "ar"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGE_CODES)[number];

const DISPLAY_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  nl: "Dutch",
  pl: "Polish",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
};

const SEO_LABELS: Record<SupportedLanguage, string> = {
  en: "in English",
  es: "in Spanish",
  fr: "in French",
  de: "in German",
  it: "in Italian",
  pt: "in Portuguese",
  sv: "in Swedish",
  da: "in Danish",
  no: "in Norwegian",
  fi: "in Finnish",
  nl: "in Dutch",
  pl: "in Polish",
  ru: "in Russian",
  zh: "in Chinese",
  ja: "in Japanese",
  ko: "in Korean",
  ar: "in Arabic",
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
 * Use normalizeLanguageOrNull when unknown values should stay unknown.
 */
export function normalizeLanguage(code: string | null | undefined): SupportedLanguage {
  return normalizeLanguageOrNull(code) ?? "en";
}

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  english: "en",
  swedish: "sv",
  svenska: "sv",
  french: "fr",
  german: "de",
  spanish: "es",
  italian: "it",
  portuguese: "pt",
  danish: "da",
  dansk: "da",
  norwegian: "no",
  norsk: "no",
  nb: "no",
  nn: "no",
  finnish: "fi",
  suomi: "fi",
  dutch: "nl",
  nederlands: "nl",
  polish: "pl",
  polski: "pl",
};

/** Import stores these when detection fails. They are not languages. */
const UNRESOLVED_LANGUAGE_CODES = new Set(["und", "unknown", "mul", "zxx", "mis"]);

/**
 * Normalizes to a supported code or returns null when unknown/empty.
 * Accepts BCP-47 tags (`en-US`) by their primary subtag. `und` stays null.
 */
export function normalizeLanguageOrNull(code: string | null | undefined): SupportedLanguage | null {
  if (code == null) return null;
  const trimmed = String(code).trim().toLowerCase().replace(/_/g, "-");
  if (!trimmed || UNRESOLVED_LANGUAGE_CODES.has(trimmed)) return null;
  if (isSupportedLanguage(trimmed)) return trimmed;
  const alias = LANGUAGE_ALIASES[trimmed];
  if (alias) return alias;
  const primary = trimmed.split("-")[0];
  if (primary && primary !== trimmed && isSupportedLanguage(primary)) return primary;
  return LANGUAGE_ALIASES[primary] ?? null;
}

/** For dropdowns: { value, label } from central config. */
export const LANGUAGE_OPTIONS: Array<{ value: SupportedLanguage; label: string }> =
  SUPPORTED_LANGUAGE_CODES.map((value) => ({ value, label: DISPLAY_NAMES[value] }));
