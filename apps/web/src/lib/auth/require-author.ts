import { createClient } from "@/lib/supabase/server";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";
import type { User } from "@supabase/supabase-js";

export type AuthorCheckResult =
  | { ok: true; user: User }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * Verifies the current user is authenticated AND has author role.
 * Use this at the start of any author-only API route or server action.
 *
 * Checks legacy author role (profiles.role) OR approved application.
 */
export async function requireAuthorRole(): Promise<AuthorCheckResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated", status: 401 };
  }

  // SECURITY: Only trust profiles.role from DB — user_metadata is client-writable.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const profileRole = profile?.role;
  if (isLegacyAuthorRole(profileRole)) {
    return { ok: true, user };
  }

  const applicationStatus = await getAuthorApplicationStatus(supabase, user.id);
  if (applicationStatus === "approved") {
    return { ok: true, user };
  }

  return { ok: false, error: "Author approval required", status: 403 };
}

/**
 * Helper for API routes - returns NextResponse if check fails, null if OK.
 * This avoids the need to import NextResponse in every route file.
 */
export async function requireAuthorRoleForApi(): Promise<
  | { user: User; response: null }
  | { user: null; response: Response }
> {
  const result = await requireAuthorRole();

  if (!result.ok) {
    const { NextResponse } = await import("next/server");
    return {
      user: null,
      response: NextResponse.json(
        { error: result.error },
        { status: result.status }
      ),
    };
  }

  return { user: result.user, response: null };
}
