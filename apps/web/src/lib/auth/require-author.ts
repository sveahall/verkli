import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type AuthorCheckResult =
  | { ok: true; user: User }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * Verifies the current user is authenticated AND has author role.
 * Use this at the start of any author-only API route or server action.
 *
 * Checks the original signup role stored in user_metadata.role to prevent
 * readers from accessing author functionality by switching roles.
 */
export async function requireAuthorRole(): Promise<AuthorCheckResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated", status: 401 };
  }

  // Check original signup role (stored at registration)
  const originalRole = user.user_metadata?.role;

  // Users who signed up as readers cannot access author features
  if (originalRole === "reader") {
    return { ok: false, error: "Author account required", status: 403 };
  }

  return { ok: true, user };
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
