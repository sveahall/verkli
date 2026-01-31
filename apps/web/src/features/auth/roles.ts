import { createClient } from "@/lib/supabase/server";

export type ActiveRole = "author" | "reader";

type RoleUpdateResult = {
  ok: boolean;
};

export async function updateActiveRole(role: ActiveRole): Promise<RoleUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const preferences = (profile?.preferences as Record<string, any> | null) || {};
  const nextPreferences = {
    ...preferences,
    active_role: role,
  };

  await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        role,
        preferences: nextPreferences,
      },
      { onConflict: "user_id" }
    );

  await supabase.auth.updateUser({
    data: {
      role,
      active_role: role,
    },
  });

  await supabase.from("users").update({ role }).eq("id", user.id);

  return { ok: true };
}
