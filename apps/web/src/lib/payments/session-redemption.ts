import type { createAdminClient } from "@/lib/supabase/admin";

export type SessionRedemptionKind = "translation" | "audiobook" | "trailer";

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
