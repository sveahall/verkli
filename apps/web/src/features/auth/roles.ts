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

  // SECURITY FIX: Only update preferences.active_role, NOT profiles.role
  // profiles.role is the original signup role and should NEVER change
  await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        // NOTE: We intentionally do NOT include 'role' here - that's the original signup role
        preferences: nextPreferences,
      },
      { onConflict: "user_id" }
    );

  // SECURITY FIX: Only update active_role in user_metadata, NOT the original role
  // user_metadata.role is the original signup role and should NEVER change
  await supabase.auth.updateUser({
    data: {
      active_role: role,
    },
  });

  return { ok: true };
}
