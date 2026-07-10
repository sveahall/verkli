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

  // Resolve the active-role VIEW from the DB profile only. Do NOT fall back to
  // user_metadata (client-writable) — this cookie only selects which dashboard
  // is shown, and authorization always re-derives role from profiles.role
  // server-side (require-author.ts, middleware.ts). Default to "reader" when
  // unresolved, matching that trust model, rather than trusting client input.
  const role: ActiveRole = resolveActiveRoleFromProfile(profile) ?? "reader";

  // Reject protocol-relative paths (//evil.com) and non-relative paths
  const safePath = /^\/[^/]/.test(redirectTo) || redirectTo === "/" ? redirectTo : "/";
  const url = new URL(request.url);
  const res = NextResponse.redirect(`${url.origin}${safePath}`);
  res.headers.set("Set-Cookie", activeRoleCookieHeader(role));

  return res;
}
