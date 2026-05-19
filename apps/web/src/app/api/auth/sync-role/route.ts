import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activeRoleCookieHeader, resolveActiveRoleFromProfile } from "@/lib/active-role";
import type { ActiveRole } from "@/lib/active-role";
import { apiError, E_UNAUTHORIZED } from "@/lib/api-errors";

/**
 * GET: When active_role cookie is missing, resolve role from profile and set cookie, then redirect.
 * Used by layouts so server has a single source of truth (cookie) after first load.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirect") ?? "/";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  let role: ActiveRole | null = resolveActiveRoleFromProfile(profile);
  if (!role) {
    const metadataRole = user.user_metadata?.active_role ?? user.user_metadata?.role;
    if (metadataRole === "author" || metadataRole === "reader") {
      role = metadataRole;
    }
  }

  // Reject protocol-relative paths (//evil.com) and non-relative paths
  const safePath = /^\/[^/]/.test(redirectTo) || redirectTo === "/" ? redirectTo : "/";
  const url = new URL(request.url);
  const res = NextResponse.redirect(`${url.origin}${safePath}`);

  if (role) {
    res.headers.set("Set-Cookie", activeRoleCookieHeader(role));
  }

  return res;
}
