import type { createAdminClient } from "@/lib/supabase/admin";

export type SessionRedemptionKind = "translation" | "audiobook";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Mark a Stripe checkout session as redeemed for a specific kind of
 * entitlement. Returns `true` if this call consumed the session, `false`
 * if the session was already redeemed for this kind.
 *
 * The single-row INSERT with a PRIMARY KEY on (session_id, kind) turns the
 * concurrent-redemption race into a clean 23505 (unique_violation) — one
 * caller wins, everyone else sees a non-fatal duplicate.
 */
export async function claimStripeSessionRedemption(
  admin: AdminClient,
  params: {
    sessionId: string;
    kind: SessionRedemptionKind;
    userId: string;
    bookId?: string | null;
  }
): Promise<boolean> {
  const { sessionId, kind, userId, bookId } = params;
  const { error } = await admin.from("stripe_session_redemptions").insert({
    stripe_session_id: sessionId,
    kind,
    user_id: userId,
    book_id: bookId ?? null,
  });

  if (!error) return true;

  // 23505 = unique_violation → another caller already claimed this session.
  if (error.code === "23505") return false;

  throw new Error(
    `stripe_session_redemptions insert failed (${error.code ?? "unknown"}): ${error.message}`
  );
}

/**
 * Release a previously-claimed redemption so the paid session can be retried.
 * Call this when a claim was consumed but the downstream work (job creation /
 * enqueue / validation) then failed — otherwise the customer has paid but is
 * permanently blocked from ever using what they paid for.
 *
 * Best-effort and idempotent: never throws (a failed release must not mask the
 * original error), and deleting an already-deleted row is a no-op.
 */
export async function releaseStripeSessionRedemption(
  admin: AdminClient,
  params: { sessionId: string; kind: SessionRedemptionKind }
): Promise<void> {
  try {
    const { error } = await admin
      .from("stripe_session_redemptions")
      .delete()
      .eq("stripe_session_id", params.sessionId)
      .eq("kind", params.kind);
    if (error) {
      console.error("[session-redemption] release failed", {
        sessionId: params.sessionId,
        kind: params.kind,
        code: error.code,
        message: error.message,
      });
    }
  } catch (error) {
    console.error("[session-redemption] release threw", {
      sessionId: params.sessionId,
      kind: params.kind,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
