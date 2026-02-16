import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activeRoleCookieHeader } from "@/lib/active-role";
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

  let role: ActiveRole | null = null;
  const preferenceRole = (profile?.preferences as { active_role?: string } | null)?.active_role;
  if (preferenceRole === "author" || preferenceRole === "reader") {
    role = preferenceRole;
  } else if (profile?.role === "author" || profile?.role === "reader") {
    role = profile.role;
  }

  const path = redirectTo.startsWith("/") ? redirectTo : `/${redirectTo}`;
  const url = new URL(request.url);
  const res = NextResponse.redirect(`${url.origin}${path}`);

  if (role) {
    res.headers.set("Set-Cookie", activeRoleCookieHeader(role));
  }

  return res;
}
