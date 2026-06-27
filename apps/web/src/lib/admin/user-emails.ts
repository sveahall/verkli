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
  await Promise.all(
    distinct.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        const email = data?.user?.email;
        if (!error && typeof email === "string" && email) out.set(id, email);
      } catch {
        // Best-effort; a single lookup failure must not blank the whole list.
      }
    })
  );
  return out;
}

/** Convenience for single-user surfaces (detail pages). */
export async function getUserEmail(userId: string): Promise<string | null> {
  const map = await getUserEmailMap([userId]);
  return map.get(userId) ?? null;
}
