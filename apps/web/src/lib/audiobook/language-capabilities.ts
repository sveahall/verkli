/** New text-only editions do not imply approved audio production support. */
const TEXT_ONLY_LANGUAGES: Record<string, string> = { nl: "Dutch", pl: "Polish" };
export const AUDIOBOOK_LANGUAGE_UNAVAILABLE = "AUDIOBOOK_LANGUAGE_UNAVAILABLE";

export function audioLanguageUnavailableReason(language: string | null | undefined): string | null {
  const key = (language ?? "").trim().toLowerCase().split(/[-_]/)[0];
  const name = Object.hasOwn(TEXT_ONLY_LANGUAGES, key) ? TEXT_ONLY_LANGUAGES[key] : null;
  return name ? `Text only: ${name} audio is not available yet. You can continue writing and translating this edition.` : null;
}
