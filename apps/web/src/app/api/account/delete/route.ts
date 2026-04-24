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
const deleteLimiter = createPerUserRateLimiter({ maxPerMinute: 2 });

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

  const { error } = await admin
    .from("profiles")
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    console.error("[account.delete] soft-request failed", {
      userId: user.id,
      message: error.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Audit trail — best-effort. Hard-deleting an auth row later should check
  // for this log entry to avoid accidentally erasing an account that never
  // actually requested it.
  try {
    await admin.from("audit_log").insert({
      entity_type: "user",
      entity_id: user.id,
      action: "deletion_requested",
      actor_user_id: user.id,
      actor_role: "user",
      meta: {},
    });
  } catch (auditError) {
    console.error("[account.delete] audit log insert failed", {
      userId: user.id,
      message:
        auditError instanceof Error ? auditError.message : String(auditError),
    });
  }

  // Sign the user out so their session is invalidated immediately. The
  // admin processor picks up the `deletion_requested_at` row later.
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
