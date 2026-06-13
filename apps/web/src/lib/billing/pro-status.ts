import { createAdminClient } from "@/lib/supabase/admin";
import { isBillingStatusActive } from "@/lib/billing/state";
import { parseBillingPlan } from "@/lib/billing/plans";

/**
 * Resolve which of the given authors currently hold an active PRO subscription,
 * for PUBLIC display (PRO badge on profiles, book cards, search, etc.).
 *
 * `billing_accounts` has self-only SELECT RLS — a reader cannot read another
 * author's billing row — so this uses the service-role admin client. It reads
 * ONLY the non-sensitive plan/status fields needed to derive the badge; never
 * Stripe identifiers.
 *
 * Batched via `.in()` (one round-trip for the whole list — never N+1). Returns
 * a Set of user_ids that are PRO. Failures degrade to an empty set: the badge
 * is decorative, never block a page render on it.
 */
export async function getAuthorProStatusSet(
  userIds: readonly string[],
): Promise<Set<string>> {
  const pro = new Set<string>();
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return pro;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("billing_accounts")
      .select("user_id, plan, status")
      .eq("role", "author")
      .in("user_id", ids);

    if (error || !data) return pro;

    for (const row of data) {
      if (isBillingStatusActive(row.status) && parseBillingPlan(row.plan) === "pro") {
        pro.add(row.user_id);
      }
    }
  } catch {
    // Decorative signal — swallow and return whatever resolved.
  }

  return pro;
}

/** Single-author convenience wrapper around {@link getAuthorProStatusSet}. */
export async function isAuthorPro(userId: string): Promise<boolean> {
  const set = await getAuthorProStatusSet([userId]);
  return set.has(userId);
}
