import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { cancelStripeSubscription } from "@/lib/payments/stripe-billing";

type Admin = SupabaseClient<Database>;

/**
 * Carrying out an account deletion request.
 *
 * ── What this erases ────────────────────────────────────────────────────────
 * The person. Display name, bio, avatar, cover, links, username and public
 * visibility on `profiles`, every private AI conversation and saved preference,
 * and sign-in itself: the auth email is replaced with a tombstone and the
 * account is banned, so the address can never be used to reach the account
 * again and is no longer stored.
 *
 * ── What this deliberately does NOT touch, and why ──────────────────────────
 *
 * `orders` and `pod_orders` are kept. Swedish bookkeeping law requires seven
 * years of accounting records, and GDPR Article 17(3)(b) exempts data held to
 * meet a legal obligation from erasure. This is also why the auth row is banned
 * rather than deleted: `pod_orders.user_id` cascades from `auth.users`, so
 * deleting the row would take purchase history with it.
 *
 * Books are left exactly as they are — not unpublished, not deleted. The
 * chapters SELECT policy requires `book_versions.published_at IS NOT NULL` for
 * everyone except the author, and an entitlement is an ADDITIONAL condition
 * rather than an alternative. Clearing `published_at` would therefore revoke
 * access from every reader who paid for the book. Withdrawing a departed
 * author's catalogue from sale is a real decision — who receives royalties for
 * a sale made after they left — and it has no safe automatic answer, so it is
 * not made here.
 *
 * An author who wants their manuscripts gone can delete them in the editor
 * first. That path exists, is confirmed by a human, and is not unattended.
 */

/** How long a request waits before it is carried out. */
export const DELETION_GRACE_DAYS = 14;

/** Replaces the display name; deliberately not a name anyone could hold. */
export const REMOVED_AUTHOR_NAME = "Removed account";

export type TeardownOutcome =
  | { userId: string; ok: true; skipped?: "withdrawn" | "not_due" }
  | { userId: string; ok: false; step: string };

export function graceCutoff(now: Date, days = DELETION_GRACE_DAYS): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Requests whose grace window has passed and that have not been carried out. */
export async function findDueDeletions(admin: Admin, now: Date, limit = 50): Promise<string[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("user_id")
    .not("deletion_requested_at", "is", null)
    .lt("deletion_requested_at", graceCutoff(now))
    .is("deletion_completed_at", null)
    .limit(limit);
  if (error) {
    console.error("[account.teardown] could not list due deletions", { code: error.code ?? "unknown" });
    return [];
  }
  return (data ?? []).map((row) => row.user_id);
}

/**
 * A tombstone address inside a reserved domain, so it can never collide with a
 * real one and never receives mail. RFC 2606 keeps `.invalid` unresolvable.
 */
export function tombstoneEmail(userId: string): string {
  return `deleted-${userId}@removed.invalid`;
}

export async function tearDownAccount(admin: Admin, userId: string, now: Date): Promise<TeardownOutcome> {
  // The sweep lists due accounts and then works through them one at a time, so
  // a withdrawal can land after the list was taken. Re-read the intent here, as
  // late as possible: without it an author can be told "Keep my account" worked
  // and lose it seconds later.
  const { data: current, error: intentError } = await admin
    .from("profiles")
    .select("deletion_requested_at,deletion_completed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (intentError) {
    console.error("[account.teardown] intent re-check failed", { userId, code: intentError.code ?? "unknown" });
    return { userId, ok: false, step: "intent" };
  }
  if (!current || current.deletion_requested_at == null || current.deletion_completed_at != null) {
    return { userId, ok: true, skipped: "withdrawn" };
  }

  // A withdrawal followed by a new request may have happened after the due list
  // was read. Honor the current request's full grace period before any mutation.
  const requestedAt = Date.parse(current.deletion_requested_at);
  if (!Number.isFinite(requestedAt) || requestedAt >= Date.parse(graceCutoff(now))) {
    return { userId, ok: true, skipped: "not_due" };
  }

  const fail = (step: string, detail: unknown): TeardownOutcome => {
    console.error("[account.teardown] step failed", {
      userId,
      step,
      code: (detail as { code?: string } | null)?.code ?? "unknown",
    });
    return { userId, ok: false, step };
  };

  // Private AI data first. It is the most sensitive and has no accounting
  // value, so it goes even if a later step has to be retried.
  for (const table of ["ai_messages", "ai_threads", "ai_memories", "ai_memory_settings"] as const) {
    const { error } = await admin.from(table).delete().eq("owner_id", userId);
    if (error) return fail(table, error);
  }

  // Erase the profile identity, but do NOT record completion yet. Marking the
  // account done before the last destructive step is what makes a failure
  // permanent: the next sweep filters on `deletion_completed_at is null`, so a
  // crash between here and the ban would leave personal data half-erased, sign-in
  // still working, and nothing ever retrying it.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: REMOVED_AUTHOR_NAME,
      bio: null,
      avatar_url: null,
      cover_image: null,
      website_url: null,
      social_links: null,
      username: null,
      is_public: false,
    })
    .eq("user_id", userId);
  if (profileError) return fail("profiles", profileError);

  // Stop the money before stopping the sign-in. Banning an account does not
  // stop Stripe charging its saved card, so a closed account would keep paying
  // for a product it can no longer reach. Only what THIS account pays for:
  // subscriptions readers hold in a departing author's books are a separate
  // decision about their catalogue, not something a teardown should settle.
  const { data: billing, error: billingError } = await admin
    .from("billing_accounts")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .not("stripe_subscription_id", "is", null);
  if (billingError) return fail("billing", billingError);

  for (const row of billing ?? []) {
    const subscriptionId = row.stripe_subscription_id;
    if (!subscriptionId) continue;
    try {
      await cancelStripeSubscription(subscriptionId);
    } catch (error) {
      // Stop rather than continue: leaving a live subscription on an account
      // that is about to lose its sign-in is the exact harm this step exists to
      // prevent, and the sweep will retry the whole teardown.
      console.error("[account.teardown] subscription cancel failed", {
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
      return { userId, ok: false, step: "stripe" };
    }
  }

  // Sign-in and the last copy of the address. `user_metadata` carries the name
  // and avatar the account signed up with, and `public-author.ts` falls back to
  // it when the profile row cannot be read — so clearing the profile alone does
  // not erase the person.
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: tombstoneEmail(userId),
    ban_duration: "876000h", // 100 years; Supabase has no permanent ban flag.
    user_metadata: {},
  });
  if (authError) return fail("auth", authError);

  // Only now is the account actually torn down. Written last so that every
  // failure above leaves the request in the queue for the next sweep.
  const { error: completionError } = await admin
    .from("profiles")
    .update({ deletion_requested_at: null, deletion_completed_at: now.toISOString() })
    .eq("user_id", userId);
  if (completionError) return fail("completion", completionError);

  const { error: auditError } = await admin.from("audit_log").insert({
    entity_type: "user",
    entity_id: userId,
    action: "deletion_completed",
    actor_user_id: null,
    actor_role: "system",
    meta: { retained: ["orders", "pod_orders", "books"] },
  });
  // Best effort: the erasure happened, and reporting failure would have the
  // sweep run it again against an account that no longer has the data.
  if (auditError) console.error("[account.teardown] audit entry failed", { userId, code: auditError.code ?? "unknown" });

  return { userId, ok: true };
}

/** One pass. Safe to call repeatedly: a finished account is no longer due. */
export async function runAccountTeardownSweep(admin: Admin, now = new Date()): Promise<TeardownOutcome[]> {
  const due = await findDueDeletions(admin, now);
  const outcomes: TeardownOutcome[] = [];
  for (const userId of due) {
    // Sequential on purpose. These are rare, and one failure must not leave a
    // half-processed batch racing the next tick.
    outcomes.push(await tearDownAccount(admin, userId, now));
  }
  if (outcomes.length) {
    console.warn("[account.teardown] swept deletion requests", {
      processed: outcomes.length,
      failed: outcomes.filter((outcome) => !outcome.ok).length,
    });
  }
  return outcomes;
}
