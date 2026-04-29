import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_AUTHOR_LOCALE,
  resolveAuthorLocale,
  type AuthorLocale,
} from "./config";

// Server-side locale resolver (Phase 0.4).
//
// Verkli has no URL-based i18n routing; locale is per-user, persisted in
// `profiles.preferences.uiLanguage`. Resolution order:
//   1. Explicit cookie `verkli-locale` (set by the locale switcher in the
//      author dashboard) — useful for unauthenticated dev / preview.
//   2. Authenticated user's `profiles.preferences.uiLanguage`.
//   3. Default ("en").
//
// next-intl calls this once per request via the plugin in next.config.ts.
// The messages bundle is sourced from `apps/web/messages/<locale>.json`.

const COOKIE_KEY = "verkli-locale";

async function resolveLocale(): Promise<AuthorLocale> {
  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(COOKIE_KEY)?.value;
    if (cookieLocale) {
      const fromCookie = resolveAuthorLocale(cookieLocale);
      if (fromCookie !== DEFAULT_AUTHOR_LOCALE) return fromCookie;
      // even if it resolves to default, prefer the explicit signal
      return fromCookie;
    }
  } catch {
    // ignore — likely outside a request context
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("user_id", user.id)
        .maybeSingle();
      const prefs = (profile?.preferences ?? {}) as { uiLanguage?: unknown };
      return resolveAuthorLocale(prefs.uiLanguage);
    }
  } catch {
    // ignore — fallback to default
  }

  return DEFAULT_AUTHOR_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  return { locale, messages };
});
