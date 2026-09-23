import { createAdminClient } from "@/lib/supabase/admin";

export type PublicAuthorInfo = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

const FALLBACK_AUTHOR_NAME = "Author";

/**
 * Resolve public author identity for a list of user_ids using the service-role
 * admin client.
 *
 * Why bypass RLS:
 *   The `profiles.is_public` flag gates personal profile fields (bio, socials,
 *   website). It does NOT govern *authorship attribution* — once an author
 *   publishes a public book, their display name and avatar are part of that
 *   public listing whether or not their personal profile is public. Reader-
 *   facing surfaces that render book author info therefore need to read past
 *   RLS for the explicitly-public fields.
 *
 * Why fall back to `auth.users.raw_user_meta_data`:
 *   `profiles.display_name` is only populated when an author saves their
 *   profile in `/author/profile`. Authors who signed up with a name in
 *   metadata but never customised their profile would otherwise hit a generic
 *   "Author" placeholder. We read the auth metadata directly via the admin
 *   client (`auth.admin.getUserById`) to recover their signup name. The
 *   legacy `public.users` table referenced by the on-create trigger is not
 *   guaranteed to exist in every environment, so we don't depend on it.
 *
 * Returns a Map keyed by user_id. user_ids with no resolvable info are
 * omitted; callers should treat a missing key as "use the FALLBACK_AUTHOR_NAME".
 */
export async function getPublicAuthorInfoMap(
  userIds: string[]
): Promise<Map<string, PublicAuthorInfo>> {
  const out = new Map<string, PublicAuthorInfo>();
  const distinctIds = Array.from(new Set(userIds.filter((id) => typeof id === "string" && id.length > 0)));
  if (distinctIds.length === 0) return out;

  const admin = createAdminClient();
  const profilesRes = await admin
    .from("profiles")
    .select("user_id, display_name, username, avatar_url")
    .in("user_id", distinctIds);

  type ProfileRow = {
    user_id: string;
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  };
  const profileRows = (profilesRes.data ?? []) as ProfileRow[];
  const profilesByUserId = new Map(profileRows.map((row) => [row.user_id, row]));

  // Look up auth-metadata names only for ids whose profile is missing or has
  // no display_name/username — keeps the fan-out small and avoids per-id auth
  // calls when the profile already attributes the author.
  const idsNeedingAuthLookup = distinctIds.filter((id) => {
    const profile = profilesByUserId.get(id);
    const hasName =
      (typeof profile?.display_name === "string" && profile.display_name.trim()) ||
      (typeof profile?.username === "string" && profile.username.trim());
    return !hasName;
  });

  type AuthMetaRow = { name: string | null; avatarUrl: string | null };
  const authMetaByUserId = new Map<string, AuthMetaRow>();
  for (const userId of idsNeedingAuthLookup) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data?.user) continue;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const rawName =
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        null;
      const rawAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url : null;
      authMetaByUserId.set(userId, {
        name: rawName,
        avatarUrl: rawAvatar,
      });
    } catch {
      // Best-effort fallback; ignore individual lookup failures.
    }
  }

  for (const userId of distinctIds) {
    const profile = profilesByUserId.get(userId);
    const authMeta = authMetaByUserId.get(userId);
    const trimmedDisplayName =
      typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
    const trimmedUsername =
      typeof profile?.username === "string" ? profile.username.trim() : "";
    const trimmedAvatar =
      typeof profile?.avatar_url === "string" ? profile.avatar_url.trim() : "";
    const trimmedAuthName =
      typeof authMeta?.name === "string" ? authMeta.name.trim() : "";
    const trimmedAuthAvatar =
      typeof authMeta?.avatarUrl === "string" ? authMeta.avatarUrl.trim() : "";

    const display = trimmedDisplayName || trimmedAuthName || null;
    const username = trimmedUsername || null;
    const avatar = trimmedAvatar || trimmedAuthAvatar || null;
    if (!display && !username && !avatar) continue;

    out.set(userId, {
      user_id: userId,
      display_name: display,
      username,
      avatar_url: avatar,
    });
  }

  return out;
}

/** Resolve the canonical display name for a public author entry. */
/**
 * Public follower count for an author.
 *
 * Must use the admin client. `follows` has exactly one SELECT policy and it is
 * `TO authenticated USING (auth.uid() = follower_id OR auth.uid() = followee_id)`
 * (20260210110003_community_comments_and_follows.sql:114-118), which has two
 * consequences that both produce a wrong number rather than an error:
 *
 *   - For the anon role NO permissive policy applies at all, so Postgres
 *     substitutes a constant-false qual and the count is 0 no matter what the
 *     table holds. Measurable: the same query with `Prefer: count=planned`
 *     gives a content-range total of 0 for anon and 1200 for the service
 *     role — the PostgREST range syntax is omitted here because a literal
 *     star-slash would close this comment. While
 *     `author_followers`, whose policies carry no TO clause, returns a
 *     non-zero planned count for anon.
 *   - For a signed-in visitor the predicate is own-rows-only, so the count
 *     caps at 1: it says "1 follower" if the viewer follows this author and
 *     "0 followers" otherwise.
 *
 * The author viewing their own page is the exception — `auth.uid() =
 * followee_id` matches all of their rows, so they see the true number. That is
 * the worst possible arrangement: the one person who would report the bug is
 * the one person who cannot see it.
 *
 * Same reasoning as getPublicAuthorInfoMap above: public data sitting behind
 * per-row RLS has to be read with the service role, scoped to exactly the
 * question being asked.
 */
export async function getPublicFollowerCount(userId: string): Promise<number> {
  const id = userId?.trim();
  if (!id) return 0;

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("follows")
    .select("followee_id", { count: "exact", head: true })
    .eq("followee_id", id);

  if (error) {
    // Logged, not swallowed. The previous `?? 0` at the call site turned every
    // failure into a plausible-looking zero with no trace.
    console.error("[public-author] follower count failed", {
      userId: id,
      code: error.code,
      message: error.message,
    });
    return 0;
  }

  return count ?? 0;
}

export function resolvePublicAuthorName(
  info: PublicAuthorInfo | undefined | null
): string {
  if (!info) return FALLBACK_AUTHOR_NAME;
  return info.display_name?.trim() || info.username?.trim() || FALLBACK_AUTHOR_NAME;
}

export const PUBLIC_AUTHOR_FALLBACK_NAME = FALLBACK_AUTHOR_NAME;
