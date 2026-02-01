/**
 * Beta gating: isBetaUser(supabase, userId) reads user_flags.beta_enabled.
 * Use the same Supabase server client as in middleware (RLS: user SELECT own row).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function isBetaUser(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_flags")
    .select("beta_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return Boolean(data.beta_enabled);
}
