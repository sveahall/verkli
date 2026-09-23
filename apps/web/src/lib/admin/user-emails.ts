import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve auth emails for a set of user ids.
 *
 * Admin surfaces previously read `public.users` for emails, but that legacy
 * mirror table is not guaranteed to be populated in every environment (see
 * scripts/README-investor-demo.md), so every row rendered "No email on
 * record". Emails live in `auth.users`; read them through the service-role
 * admin auth API instead. Bounded by the caller's page size (admin lists
 * paginate), so the per-id fan-out stays small.
 *
 * Returns a Map keyed by user_id; ids with no resolvable email are omitted.
 */
export async function getUserEmailMap(
  userIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const distinct = Array.from(
    new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))
  );
  if (distinct.length === 0) return out;

  const admin = createAdminClient();

  // GoTrue has no batch "get users by id" endpoint, so we resolve per id — but
  // in bounded, concurrency-capped chunks rather than firing a whole page of
  // lookups at once, which can trip the auth-API rate/connection limits.
  const CONCURRENCY = 8;
  const resolveEmail = async (id: string) => {
    try {
      const { data, error } = await admin.auth.admin.getUserById(id);
      const email = data?.user?.email;
      if (!error && typeof email === "string" && email) out.set(id, email);
    } catch {
      // Best-effort; a single lookup failure must not blank the whole list.
    }
  };

  for (let i = 0; i < distinct.length; i += CONCURRENCY) {
    await Promise.all(distinct.slice(i, i + CONCURRENCY).map(resolveEmail));
  }
  return out;
}

/** Convenience for single-user surfaces (detail pages). */
export async function getUserEmail(userId: string): Promise<string | null> {
  const map = await getUserEmailMap([userId]);
  return map.get(userId) ?? null;
}
