import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveRoleFromRequest, type ActiveRole } from "@/lib/active-role";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";

/**
 * Resolve the billing role the user is *allowed* to transact on.
 *
 * The `active_role` cookie is user-writable (not HttpOnly, by design — the
 * client needs to read it). On its own it cannot be trusted for
 * authorization. A reader that sets `active_role=author` must not be able to
 * buy the author "Pro" plan or read an author-scoped billing row.
 *
 * Policy:
 *   - "author" is only honoured when the user actually has the author role
 *     (profiles.role ∈ {author, admin, legacy synonyms} OR an approved
 *     author_application). Otherwise the request is downgraded to "reader"
 *     if the user is signed in.
 *   - "reader" is always valid for any authenticated user.
 *   - No cookie → default to "reader".
 */
export async function resolveBillingRole(
  request: Request,
  userId: string
): Promise<ActiveRole> {
  const claimed = getActiveRoleFromRequest(request);
  if (claimed !== "author") {
    return "reader";
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const profileRole = String(profile?.role ?? "").trim().toLowerCase();
  if (profileRole === "admin" || isLegacyAuthorRole(profileRole)) {
    return "author";
  }

  const applicationStatus = await getAuthorApplicationStatus(admin, userId);
  if (applicationStatus === "approved") {
    return "author";
  }

  return "reader";
}
