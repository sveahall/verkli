import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { activeRoleCookieHeader, resolveActiveRoleFromProfile } from "@/lib/active-role";
import type { ActiveRole } from "@/lib/active-role";
import { capturePostHogAsync } from "@/lib/analytics/posthog-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      // PostHog: distinguish first-session (sign-up) vs returning (sign-in).
      // Heuristic: user.created_at within the last 5 minutes ⇒ sign-up.
      if (user?.id) {
        const createdMs = user.created_at
          ? new Date(user.created_at).getTime()
          : 0;
        const isFresh =
          createdMs > 0 && Date.now() - createdMs < 5 * 60 * 1000;
        const provider =
          (user.app_metadata as { provider?: string } | undefined)?.provider;
        await capturePostHogAsync({
          distinctId: user.id,
          event: isFresh ? "auth_signup" : "auth_signin",
          properties: {
            email_domain: user.email ? user.email.split("@")[1] : undefined,
            provider,
          },
        });
      }

      let role: ActiveRole | null = null;
      const metaRole = user?.user_metadata?.active_role ?? user?.user_metadata?.role;
      if (metaRole === "author" || metaRole === "reader") {
        role = metaRole;
      }

      if (!role && user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, preferences")
          .eq("user_id", user.id)
          .maybeSingle();

        role = resolveActiveRoleFromProfile(profile);
      }

      const redirectPath = role === "author" ? "/author/home" : role === "reader" ? "/reader/home" : "/";
      const res = NextResponse.redirect(`${origin}${redirectPath}`);
      if (role) {
        res.headers.set("Set-Cookie", activeRoleCookieHeader(role));
      }
      return res;
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
