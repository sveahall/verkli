import type { SupabaseClient } from "@supabase/supabase-js";

// Audit log helper: one typed way to write a row into public.audit_log.
//
//   - Mutations call `recordAudit(...)` once after the write succeeds.
//   - Failure to write the audit row is logged but never thrown. A mutation
//     must not be reverted because its audit failed; that loses the change
//     entirely and makes the mutation un-debuggable.
//
// This used to call a `record_audit` SECURITY DEFINER function from
// 20260429122000_audit_log.sql. That migration was never applied and is now
// superseded, so the function has never existed and every call through here
// failed silently. It inserts directly instead — which is also what the six
// admin routes already do, so this converges the two paths rather than adding
// a third. Direct insert is the right shape on its own merits too: every
// caller passes the service-role client, so there is no privilege to escalate
// and a SECURITY DEFINER wrapper would only widen the attack surface.
//
// The input shape predates the live table, so the mapping is explicit:
//   target.type -> entity_type       target.id  -> entity_id
//   actor.id    -> actor_user_id     actor.role -> actor_role
//   metadata    -> meta, less request_id, which has its own column
//   before/after-> meta.before / meta.after; the table has no such columns

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
  | "queue"
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
  // Mirror of a row in book_rights_attestations. The typed table is the durable
  // record; this exists so a rights attestation shows up on the book timeline
  // next to publishes and takedowns, which is where someone investigating a
  // dispute will actually look.
  | "book.rights_attested"
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
  | "admin.queue_retry_failed"
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
   * Who did it. Nothing is inferred: the write goes through the service-role
   * client, so there is no `auth.uid()` to fall back on and an omitted actor
   * is stored as NULL. Pass it wherever a user is known; leaving it out is
   * correct for machine actors such as Stripe webhooks.
   */
  actor?: { id?: string | null; role?: string | null };
};

type SupabaseLike = Pick<SupabaseClient, "from">;

/**
 * `meta` carries the caller's `metadata` spread at the top level, so these two
 * keys are reserved for the before/after snapshots and a caller's own
 * `metadata.before` would be overwritten. Nothing passes them today.
 */
const RESERVED_META_KEYS = ["before", "after"] as const;

/**
 * Splits `request_id` out of the free-form metadata: the live table gives it a
 * dedicated column, and `auditMetadataFromRequest` already extracts it from the
 * request headers. Keeping it in both places would just duplicate the value.
 */
function takeRequestId(metadata: Record<string, unknown> | null | undefined): {
  requestId: string | null;
  meta: Record<string, unknown>;
} {
  if (!metadata) return { requestId: null, meta: {} };
  const { request_id: raw, ...rest } = metadata;
  const requestId = typeof raw === "string" && raw.trim() !== "" ? raw : null;
  return { requestId, meta: rest };
}

/**
 * Fire-and-forget audit. Logs but does not throw on failure.
 *
 * Returns the inserted audit_log id (a uuid), or null if the write failed.
 */
export async function recordAudit(
  supabase: SupabaseLike,
  input: RecordAuditInput
): Promise<string | null> {
  try {
    const { requestId, meta } = takeRequestId(input.metadata);
    for (const key of RESERVED_META_KEYS) {
      const value = key === "before" ? input.before : input.after;
      if (value !== undefined && value !== null) meta[key] = value;
    }

    const { data, error } = await supabase
      .from("audit_log")
      .insert({
        action: input.action,
        entity_type: input.target.type,
        entity_id: input.target.id ?? null,
        actor_user_id: input.actor?.id ?? null,
        actor_role: input.actor?.role ?? null,
        request_id: requestId,
        meta,
      } as never)
      .select("id")
      .single();

    if (error) {
      console.error("[audit] audit_log insert failed", {
        action: input.action,
        target: input.target,
        message: error.message,
      });
      return null;
    }

    const id = (data as { id?: unknown } | null)?.id;
    return typeof id === "string" ? id : null;
  } catch (err) {
    console.error("[audit] audit_log insert threw", {
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
