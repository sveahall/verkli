import { createClient } from "@/lib/supabase/server";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";
import type { User } from "@supabase/supabase-js";

export type AuthorCheckResult =
  /**
   * `role` is the caller's actual `profiles.role`, lowercased, or null when the
   * profile carries none. It is not "author": this check also passes admins,
   * and it passes users authorised by an approved application whose profile
   * role may be something else entirely. Callers that record who acted (audit
   * rows) need the real value — assuming "author" mislabels every admin.
   */
  | { ok: true; user: User; role: string | null }
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

  const profileRole = String(profile?.role ?? "").trim().toLowerCase();
  const role = profileRole === "" ? null : profileRole;
  if (profileRole === "admin" || isLegacyAuthorRole(profileRole)) {
    return { ok: true, user, role };
  }

  const applicationStatus = await getAuthorApplicationStatus(supabase, user.id);
  if (applicationStatus === "approved") {
    // Authorised by approval rather than by role, so `role` stays whatever the
    // profile says — null included. Better a null actor_role than a guess.
    return { ok: true, user, role };
  }

  return { ok: false, error: "Author approval required", status: 403 };
}

/**
 * Helper for API routes - returns NextResponse if check fails, null if OK.
 * This avoids the need to import NextResponse in every route file.
 */
export async function requireAuthorRoleForApi(): Promise<
  | { user: User; role: string | null; response: null }
  | { user: null; role: null; response: Response }
> {
  const result = await requireAuthorRole();

  if (!result.ok) {
    const { NextResponse } = await import("next/server");
    return {
      user: null,
      role: null,
      response: NextResponse.json(
        { error: result.error },
        { status: result.status }
      ),
    };
  }

  return { user: result.user, role: result.role, response: null };
}
