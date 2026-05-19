import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables } from "@/lib/supabase/types";
import type { ServiceResult } from "@/lib/books/service";

export type { ServiceResult };

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

// ---------------------------------------------------------------------------
// Single profile
// ---------------------------------------------------------------------------

/**
 * Fetch the role and preferences for a single user by their user_id.
 * Returns `null` when no profile row exists.
 */
export async function getProfileRoleAndPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<ServiceResult<{ role: string | null; preferences: Record<string, unknown> | null } | null>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, preferences")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profiles/service.getProfileRoleAndPreferences] query failed", {
      userId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "database_error" };
  }

  if (!data) {
    return { ok: true, data: null };
  }

  return {
    ok: true,
    data: {
      role: typeof data.role === "string" ? data.role : null,
      preferences:
        data.preferences != null && typeof data.preferences === "object" && !Array.isArray(data.preferences)
          ? (data.preferences as Record<string, unknown>)
          : null,
    },
  };
}

/**
 * Upsert reader preferences for a user.
 * Conflict target is `user_id`.
 */
export async function upsertProfilePreferences(
  supabase: SupabaseClient,
  userId: string,
  preferences: Record<string, unknown>,
): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, preferences }, { onConflict: "user_id" });

  if (error) {
    console.error("[profiles/service.upsertProfilePreferences] upsert failed", {
      userId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "database_error" };
  }

  return { ok: true, data: null };
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
