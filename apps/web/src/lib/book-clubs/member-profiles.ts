import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type MemberProfile = {
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Resolve display names and avatars for a set of club members.
 *
 * Exists because `book_club_members` has no foreign key to `profiles` — its
 * only FK is to `book_clubs`. The two call sites both used
 * `.select("...profiles:user_id(display_name, avatar_url)")`, which PostgREST
 * rejects with PGRST200 and a 400, so the member list came back EMPTY rather
 * than merely nameless. An `as RawMember[]` cast at each site hid it.
 *
 * One batched `.in()` query, not one per member — the pattern the discover and
 * library pages already use.
 */
export async function loadMemberProfiles(
  supabase: SupabaseClient<Database>,
  userIds: readonly string[]
): Promise<Map<string, MemberProfile>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  const out = new Map<string, MemberProfile>();
  if (unique.length === 0) return out;

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, avatar_url")
    .in("user_id", unique);

  if (error) {
    // Names are decoration; the membership list is the substance. Log and
    // return what we have rather than failing the page.
    console.error("[book-clubs] member profile lookup failed", {
      count: unique.length,
      message: error.message,
    });
    return out;
  }

  for (const row of data ?? []) {
    if (!row.user_id) continue;
    out.set(row.user_id, {
      display_name: row.display_name,
      avatar_url: row.avatar_url,
    });
  }

  return out;
}
