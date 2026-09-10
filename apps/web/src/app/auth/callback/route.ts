import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantBetaAccessIfInvited } from "@/lib/auth/beta";
import { NextResponse } from "next/server";
import { activeRoleCookieHeader, resolveActiveRoleFromProfile } from "@/lib/active-role";
import type { ActiveRole } from "@/lib/active-role";
import { capturePostHogAsync } from "@/lib/analytics/posthog-server";
import {
  defaultHomePathForRole,
  nextPathCookieHeader,
  readNextPathCookie,
  sanitizeNextPath,
} from "@/lib/auth/next-path";

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

      // An invited person should not need an admin to click them in.
      //
      // This is the one place both sign-up paths converge: the email
      // confirmation link points here (auth.ts sets emailRedirectTo) and so
      // does the Google redirect. Password sign-in does not pass through, but
      // it cannot be a user's first arrival either — the confirmation link
      // always comes first.
      //
      // Best effort by design: a failure here must not turn a valid sign-in
      // into `/?error=auth`. The cost of failing is that the user lands on
      // /waitlist and an admin toggles them in /admin/beta, which is exactly
      // where they were before this existed. It is reported rather than
      // swallowed, because a silent one would look identical to "nobody
      // accepted the invitation".
      if (user?.id) {
        try {
          const outcome = await grantBetaAccessIfInvited(createAdminClient(), {
            userId: user.id,
            email: user.email,
          });
          if (outcome.granted === false && outcome.reason === "error") {
            Sentry.captureException(
              new Error(`beta auto-grant failed: ${outcome.error ?? "unknown"}`),
              { tags: { flow: "auth_callback" }, extra: { userId: user.id } }
            );
          }
        } catch (err) {
          Sentry.captureException(err, {
            tags: { flow: "auth_callback", step: "beta_auto_grant" },
            extra: { userId: user.id },
          });
        }
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

      // Honour the pre-sign-in destination so an OAuth buyer lands back on the
      // book they were buying. It arrives either on the query string or in the
      // carry cookie set before we handed off to the provider; both are
      // re-validated, so a tampered cookie cannot make this an open redirect.
      const requestedNext =
        sanitizeNextPath(searchParams.get("next")) ??
        readNextPathCookie(request.headers.get("cookie"));
      const redirectPath = requestedNext ?? defaultHomePathForRole(role);

      const res = NextResponse.redirect(`${origin}${redirectPath}`);
      if (role) {
        res.headers.append("Set-Cookie", activeRoleCookieHeader(role));
      }
      // Single-use: clear it whether or not it was present, so a stale value
      // cannot hijack a later sign-in.
      res.headers.append("Set-Cookie", nextPathCookieHeader(null));
      return res;
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
