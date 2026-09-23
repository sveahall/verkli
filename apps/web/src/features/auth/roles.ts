import { createClient } from "@/lib/supabase/server";
import { getAuthorApplicationStatus } from "@/lib/auth/author-approval";
import type { ActiveRole } from "@/lib/active-role";

export type { ActiveRole };

type RoleUpdateResult = {
  ok: boolean;
  error?: string;
};

export async function updateActiveRole(role: ActiveRole): Promise<RoleUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // SECURITY: Read original signup role from DB — never trust user_metadata.role
  // (user_metadata is client-writable via auth.updateUser).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const originalRole = profile?.role as ActiveRole | undefined;

  // SECURITY: readers can switch to author only when approved by admin.
  if (role === "author" && originalRole !== "author") {
    const approvalStatus = await getAuthorApplicationStatus(supabase, user.id);
    if (approvalStatus !== "approved") {
      return {
        ok: false,
        error: "Author approval required before switching to author mode.",
      };
    }
  }

  const preferences = (profile?.preferences as Record<string, unknown> | null) || {};
  const nextPreferences = {
    ...preferences,
    active_role: role,
  };

  // SECURITY: Only update preferences.active_role.
  // profiles.role is immutable original signup role and must never be written here.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        preferences: nextPreferences,
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  return { ok: true };
}
