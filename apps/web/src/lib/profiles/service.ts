import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type ProfileRow = Tables<"profiles">;

/**
 * Lightweight profile shape returned by batch lookups.
 * Matches the most commonly selected columns across the codebase:
 * - `messages/server.ts` selects "user_id, display_name, username, avatar_url, role"
 * - `recommendations/enrichment.ts` selects "user_id, display_name"
 *
 * Callers that need fewer fields can narrow via the `select` parameter.
 */
export type ProfileSummary = Pick<
  ProfileRow,
  "user_id" | "display_name" | "username" | "avatar_url" | "role"
>;

// ---------------------------------------------------------------------------
// Batch profile fetching
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE_SELECT = "user_id, display_name, username, avatar_url, role";

/**
 * Fetch profiles for a list of user IDs in a single query and return them
 * as a Map keyed by `user_id`.
 *
 * This pattern is duplicated in at least five places:
 * - `lib/messages/server.ts` (getProfilesByUserId)
 * - `lib/recommendations/enrichment.ts` (enrichWithAuthors)
 * - discover / reader pages that resolve author names
 *
 * Centralizing it here ensures consistent column selection, de-duplication
 * of input IDs, and a single place to add caching later.
 *
 * @param select - Supabase select string. Defaults to the five most commonly
 *   used columns. Override only when you need fewer (performance) or more.
 */
export async function getProfilesByUserIds(
  supabase: SupabaseClient,
  userIds: string[],
  select: string = DEFAULT_PROFILE_SELECT,
): Promise<Map<string, ProfileSummary>> {
  const map = new Map<string, ProfileSummary>();

  // De-duplicate and skip empty arrays to avoid unnecessary DB round-trips
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(select)
    .in("user_id", uniqueIds);

  if (error) {
    console.error("[profiles/service.getProfilesByUserIds] query failed", {
      count: uniqueIds.length,
      code: error.code,
      message: error.message,
    });
    // Return empty map rather than throwing -- callers can fall back to
    // placeholder names, matching the existing pattern in enrichment.ts.
    return map;
  }

  for (const profile of (data ?? []) as unknown as ProfileSummary[]) {
    map.set(profile.user_id, profile);
  }

  return map;
}

/**
 * Convenience wrapper that returns a simple `user_id -> display_name` map.
 * Mirrors the exact pattern in `recommendations/enrichment.ts`.
 */
export async function getDisplayNamesByUserIds(
  supabase: SupabaseClient,
  userIds: string[],
  fallback = "Unknown author",
): Promise<Map<string, string>> {
  const profiles = await getProfilesByUserIds(supabase, userIds, "user_id, display_name");
  const names = new Map<string, string>();

  for (const [userId, profile] of profiles) {
    names.set(userId, profile.display_name ?? fallback);
  }

  return names;
}
