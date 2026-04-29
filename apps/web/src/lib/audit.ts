import type { SupabaseClient } from "@supabase/supabase-js";

// Audit log helper. Wraps the `record_audit` SECURITY DEFINER function added
// in 20260429122000_audit_log.sql. Designed so:
//   - Mutations call `recordAudit(...)` once after the write succeeds.
//   - The action string is `<domain>.<verb>` per the table CHECK constraint.
//   - Failure to write the audit row is logged but never thrown (mutation
//     should not be reverted because the audit failed; that loses the change
//     entirely and makes the mutation un-debuggable).
//
// For replay-sensitive paths (billing, content_reports), prefer to await the
// audit call inside the same transaction as the mutation by passing a
// transactional supabase client.

export type AuditTargetType =
  | "profile"
  | "book"
  | "chapter"
  | "billing_account"
  | "author_subscription"
  | "entitlement"
  | "credit_grant"
  | "credit_topup"
  | "donation"
  | "order"
  | "stripe_session_redemption"
  | "author_application"
  | "content_report"
  | "account_deletion_request"
  | "feedback"
  | "admin_grant"
  | "audit_log";

export type AuditAction =
  // profiles
  | "profile.role_change"
  | "profile.email_change"
  | "profile.status_change"
  | "profile.deletion_requested"
  // books
  | "book.publish"
  | "book.unpublish"
  | "book.price_change"
  | "book.visibility_change"
  | "book.soft_delete"
  | "book.restore"
  // chapters
  | "chapter.update"
  | "chapter.soft_delete"
  // billing
  | "billing.subscription_create"
  | "billing.subscription_change"
  | "billing.subscription_cancel"
  | "billing.entitlement_grant"
  | "billing.entitlement_revoke"
  | "billing.credit_grant"
  | "billing.credit_debit"
  | "billing.refund"
  | "billing.redemption_consumed"
  // stripe connect (Sprint W1 — author payouts)
  | "billing.connect_onboarded"
  | "billing.connect_kyc_submitted"
  | "billing.connect_payouts_enabled"
  | "billing.connect_payouts_disabled"
  | "billing.connect_requirements_changed"
  // donations
  | "donation.created"
  | "donation.completed"
  | "donation.refunded"
  // applications / reports
  | "author_application.approve"
  | "author_application.reject"
  | "content_report.resolve"
  | "content_report.dismiss"
  | "content_report.escalate"
  // admin
  | "admin.beta_grant"
  | "admin.beta_revoke"
  | "admin.role_assign"
  // account deletion
  | "account.deletion_request"
  | "account.deletion_fulfil"
  | "account.deletion_cancel";

export type RecordAuditInput = {
  action: AuditAction;
  target: { type: AuditTargetType; id?: string | null };
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /**
   * Per-request context (IP, user-agent, request-id). Free-form JSONB.
   */
  metadata?: Record<string, unknown> | null;
  /**
   * Override actor when not derivable from `auth.uid()` — e.g. webhook
   * mutations where the caller is Stripe, not a logged-in user.
   */
  actor?: { id?: string | null; role?: string | null };
};

type SupabaseLike = Pick<SupabaseClient, "rpc">;

/**
 * Fire-and-forget audit. Logs but does not throw on failure.
 *
 * Returns the inserted audit_log id, or null if the write failed.
 */
export async function recordAudit(
  supabase: SupabaseLike,
  input: RecordAuditInput
): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc("record_audit", {
      p_action: input.action,
      p_target_type: input.target.type,
      p_target_id: input.target.id ?? null,
      p_before: input.before ?? null,
      p_after: input.after ?? null,
      p_metadata: input.metadata ?? null,
      p_actor_id: input.actor?.id ?? null,
      p_actor_role: input.actor?.role ?? null,
    } as never);

    if (error) {
      console.error("[audit] record_audit rpc failed", {
        action: input.action,
        target: input.target,
        message: error.message,
      });
      return null;
    }

    if (typeof data === "number") return data;
    if (typeof data === "bigint") return Number(data);
    return null;
  } catch (err) {
    console.error("[audit] record_audit threw", {
      action: input.action,
      target: input.target,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Convenience helper that derives the `metadata` object from a Next request.
 */
export function auditMetadataFromRequest(
  request: Request,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
    user_agent: request.headers.get("user-agent") ?? null,
    request_id: request.headers.get("x-request-id") ?? null,
    forwarded_for: request.headers.get("x-forwarded-for") ?? null,
    ...extra,
  };
}
