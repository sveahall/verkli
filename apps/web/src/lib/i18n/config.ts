// next-intl config (Phase 0.4).
//
// Verkli is mostly English; Swedish is supported only inside the
// (app-author) route group per the existing `check:english-default` CI gate.
// Reader-side and public marketing stays English so the deploy artefact is
// the same across markets and SEO is consistent.
//
// Locale resolution lives in `lib/i18n/request.ts` for the server-side flow.
// Client components receive the chosen locale via NextIntlClientProvider in
// `app/(app-author)/layout.tsx`.

export const SUPPORTED_AUTHOR_LOCALES = ["en", "sv"] as const;
export type AuthorLocale = (typeof SUPPORTED_AUTHOR_LOCALES)[number];

export const DEFAULT_AUTHOR_LOCALE: AuthorLocale = "en";

export function isSupportedAuthorLocale(value: unknown): value is AuthorLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_AUTHOR_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Pick a locale from a free-form input string. Accepts BCP-47 ("sv-SE"),
 * lowercases, returns DEFAULT_AUTHOR_LOCALE on anything unsupported.
 */
export function resolveAuthorLocale(value: unknown): AuthorLocale {
  if (typeof value !== "string") return DEFAULT_AUTHOR_LOCALE;
  const normalized = value.trim().toLowerCase().split("-")[0] ?? "";
  return isSupportedAuthorLocale(normalized) ? normalized : DEFAULT_AUTHOR_LOCALE;
}
