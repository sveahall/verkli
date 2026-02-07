import { createClient } from "@/lib/supabase/server";

export type ActiveRole = "author" | "reader";

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

  // Get original signup role
  const originalRole = user.user_metadata?.role as ActiveRole | undefined;

  // SECURITY: Readers cannot switch to author role
  // Authors can switch between roles (they can be readers too)
  // Readers can only stay as readers
  if (role === "author" && originalRole === "reader") {
    return {
      ok: false,
      error: "Reader accounts cannot access author features. Please create an author account.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

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
