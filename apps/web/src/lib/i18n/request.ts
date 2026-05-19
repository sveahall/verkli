import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

/**
 * Server-side request config for next-intl. Pointed at by
 * `createNextIntlPlugin("./src/lib/i18n/request.ts")` in next.config.ts.
 *
 * Locale resolution order:
 *   1. `NEXT_LOCALE` cookie (authoritative — set by the author settings
 *      flow when the user picks a UI language).
 *   2. Default `"en"` — keeps the English-first policy intact for reader
 *      and public pages, which never set the cookie. The author dashboard
 *      can still render Swedish copy when the cookie is present.
 *
 * Messages are loaded from `apps/web/messages/<locale>.json`. The dictionary
 * is shared between author and reader trees; pages outside the author shell
 * just never call `useTranslations()`, so the load is effectively free.
 */
const SUPPORTED_LOCALES = ["en", "sv"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: SupportedLocale = "en";
const LOCALE_COOKIE = "NEXT_LOCALE";

function isSupported(value: string | undefined): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: SupportedLocale = isSupported(cookieLocale)
    ? cookieLocale
    : DEFAULT_LOCALE;

  const messages = (await import(`../../../messages/${locale}.json`)).default;
  return { locale, messages };
});
