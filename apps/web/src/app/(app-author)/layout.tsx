import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveRoleFromCookieValue } from "@/lib/active-role";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";
import AuthorAppShell from "@/features/author-shell/AuthorAppShell";
import { isDemoModeActive } from "@/lib/flags";

export default async function AppAuthorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const activeRole = getActiveRoleFromCookieValue(
    cookieStore.get("active_role")?.value
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, preferences, demo_mode")
    .eq("user_id", user.id)
    .maybeSingle();
  const profileRole = String(profile?.role ?? "").trim().toLowerCase();
  const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
  const demoModeActive = isDemoModeActive({
    demo_mode: (profile as { demo_mode?: boolean | null } | null)?.demo_mode,
  });
  const preferredLocale = typeof prefs.uiLanguage === "string" ? prefs.uiLanguage : null;
  const isAdmin = profileRole === "admin";
  const isLegacyAuthor = isLegacyAuthorRole(profileRole);
  const approvalStatus = !isAdmin && !isLegacyAuthor
    ? await getAuthorApplicationStatus(supabase, user.id)
    : null;
  const canAccessAuthor = isAdmin || isLegacyAuthor || approvalStatus === "approved";

  if (!canAccessAuthor) {
    redirect("/reader/home");
  }

  if (!activeRole && !isAdmin) {
    redirect("/api/auth/sync-role?redirect=/author/home");
  }

  // Phase 0.4: hand the (app-author) tree a NextIntlClientProvider so client
  // components can call `useTranslations()`. Locale and messages come from
  // `lib/i18n/request.ts` which resolves cookie → profile.preferences.uiLanguage
  // → default (en). Reader and public stay outside this boundary so they
  // remain English by `check:english-default`.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AuthorAppShell
        preferredLocale={preferredLocale}
        demoModeActive={demoModeActive}
      >
        {children}
      </AuthorAppShell>
    </NextIntlClientProvider>
  );
}
