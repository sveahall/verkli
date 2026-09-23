import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  apiError,
  E_DATABASE_ERROR,
  E_NOT_AUTHENTICATED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

// Tight rate limit — this is a deliberate user action and shouldn't be
// automated or retried in a loop.
const deleteLimiter = createPerUserRateLimiter({ name: "account-delete", maxPerMinute: 2 });

/**
 * Soft-request account deletion.
 *
 * We do NOT hard-delete the auth row here — that must cascade through
 * billing teardown (Stripe customer, entitlements, payouts), external
 * mailing lists, and audit log anonymisation, which a scheduled admin job
 * is better suited to run. This endpoint records the user's intent and
 * signs them out.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rl = await deleteLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  const admin = createAdminClient();

  // Only stamp a request that is not already pending. Re-posting used to move
  // the timestamp forward, which restarts the grace window — so an account
  // could postpone its own deletion indefinitely, one click at a time.
  const { data, error } = await admin
    .from("profiles")
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("deletion_requested_at", null)
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.error("[account.delete] soft-request failed", { userId: user.id, message: error.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!data) {
    // The conditional update matched nothing. Either a request is already
    // pending — in which case the author's goal is met and re-posting is a
    // success, not a 500 — or there is no profile row at all, which is.
    const { data: existing, error: readError } = await admin
      .from("profiles")
      .select("deletion_requested_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError || !existing?.deletion_requested_at) {
      console.error("[account.delete] soft-request failed", {
        userId: user.id,
        message: readError?.message ?? "No profile was updated",
      });
      return apiError(E_DATABASE_ERROR, 500);
    }
    return NextResponse.json({ ok: true, deletionRequested: true, alreadyRequested: true, signedOut: false });
  }

  // Audit trail — best-effort. Hard-deleting an auth row later should check
  // for this log entry to avoid accidentally erasing an account that never
  // actually requested it.
  try {
    const { error: auditError } = await admin.from("audit_log").insert({
      entity_type: "user",
      entity_id: user.id,
      action: "deletion_requested",
      actor_user_id: user.id,
      actor_role: "user",
      meta: {},
    });
    if (auditError) throw new Error(auditError.message);
  } catch (auditError) {
    console.error("[account.delete] audit log insert failed", {
      userId: user.id,
      message:
        auditError instanceof Error ? auditError.message : String(auditError),
    });
  }

  // The request is saved, not processed. A failed sign-out must not imply
  // that saving failed or claim the session was successfully invalidated.
  let signedOut = false;
  try {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw new Error(signOutError.message);
    signedOut = true;
  } catch (signOutError) {
    console.error("[account.delete] sign out failed", {
      userId: user.id,
      message: signOutError instanceof Error ? signOutError.message : String(signOutError),
    });
  }

  return NextResponse.json({ ok: true, deletionRequested: true, signedOut });
}


/**
 * Withdraw a pending deletion request.
 *
 * A request that cannot be taken back is a trap, not a grace period: the whole
 * point of recording intent instead of deleting is that the author has time to
 * change their mind. POST signs the author out, so the realistic path here is
 * signing back in and cancelling from settings.
 *
 * Idempotent. Cancelling when nothing is pending is a success, because the
 * author's goal — "my account is not being deleted" — is already true, and an
 * error would read as though it still is.
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rl = await deleteLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  const admin = createAdminClient();

  // Only clear a request that is actually there, so the audit log records a
  // withdrawal only when there was something to withdraw.
  const { data, error } = await admin
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("user_id", user.id)
    .not("deletion_requested_at", "is", null)
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.error("[account.delete] cancel failed", {
      userId: user.id,
      message: error.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!data) {
    return NextResponse.json({ ok: true, deletionRequested: false, alreadyCancelled: true });
  }

  try {
    const { error: auditError } = await admin.from("audit_log").insert({
      entity_type: "user",
      entity_id: user.id,
      action: "deletion_cancelled",
      actor_user_id: user.id,
      actor_role: "user",
      meta: {},
    });
    if (auditError) throw new Error(auditError.message);
  } catch (auditError) {
    console.error("[account.delete] cancel audit log insert failed", {
      userId: user.id,
      message: auditError instanceof Error ? auditError.message : String(auditError),
    });
  }

  return NextResponse.json({ ok: true, deletionRequested: false });
}
