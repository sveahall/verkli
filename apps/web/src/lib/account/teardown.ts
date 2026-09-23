import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

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
  | { userId: string; ok: true }
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
      deletion_requested_at: null,
      deletion_completed_at: now.toISOString(),
    })
    .eq("user_id", userId);
  if (profileError) return fail("profiles", profileError);

  // Sign-in last: until it is gone the author could still withdraw, and a
  // half-finished teardown should leave them able to reach support.
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: tombstoneEmail(userId),
    ban_duration: "876000h", // 100 years; Supabase has no permanent ban flag.
  });
  if (authError) return fail("auth", authError);

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
