import { createHash } from "node:crypto";
import { Resend } from "resend";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { buildBetaInvitationHtml, buildBetaInvitationSubject, buildBetaInvitationText } from "./beta-invitation";

type Admin = ReturnType<typeof createAdminClient>;
export const BETA_MAIL_DAILY_LIMIT = 20;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export type BetaDeliveryResult = {
  status: "sent" | "already_sent" | "retry" | "review_required" | "daily_limit" | "unavailable";
  message: string;
};
type Payload = { from: string; to: string; subject: string; html: string; text: string };

// Deterministic primary keys make reservations atomic across server instances.
function eventId(key: string): string {
  const hex = createHash("sha256").update(`verkli:beta-mail:v1:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function dayRange() {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}
export async function getBetaMailAllowance(admin: Admin) {
  const { start, end } = dayRange();
  const { count, error } = await admin.from("audit_log").select("id", { count: "exact", head: true })
    .eq("entity_type", "beta_email_slot").gte("created_at", start).lt("created_at", end);
  if (error) throw new Error("Invitation allowance could not be checked. Please retry.");
  return { limit: BETA_MAIL_DAILY_LIMIT, remaining: Math.max(0, BETA_MAIL_DAILY_LIMIT - (count ?? BETA_MAIL_DAILY_LIMIT)), resetsAt: end };
}
function payloadFrom(value: unknown): Payload | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  return ["from", "to", "subject", "html", "text"].every(k => typeof data[k] === "string" && data[k]) ? data as Payload : null;
}

/** Append-only delivery ledger. Accepted is NOT proof of inbox placement. */
export async function sendBetaWelcome(admin: Admin, args: {
  actorId: string | null; entityId: string; email: string; name?: string | null;
  accountExists: boolean; audience: "author" | "reader";
}): Promise<BetaDeliveryResult> {
  const email = args.email.trim().toLowerCase();
  const operationId = eventId(`recipient:${args.audience}:${email}`);
  const acceptedId = eventId(`accepted:${operationId}`);
  const unavailable: BetaDeliveryResult = { status: "unavailable", message: "Access is enabled, but email could not be prepared. Please retry." };
  const retry: BetaDeliveryResult = { status: "retry", message: "Access is enabled. Email acceptance is unconfirmed; retry safely within 23 hours." };
  try {
    const accepted = await admin.from("audit_log").select("id").eq("id", acceptedId).maybeSingle();
    if (accepted.error) return unavailable;
    if (accepted.data) return { status: "already_sent", message: "The welcome email was already accepted by the mail provider. No duplicate was sent." };
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return unavailable;
    const preparation = await prepareBetaWelcome(admin, args);
    if (preparation) return preparation;
    const saved = await admin.from("audit_log").select("created_at, meta").eq("id", operationId).maybeSingle();
    if (saved.error) return unavailable;
    let attempt = saved.data;
    if (attempt && Date.now() - Date.parse(attempt.created_at) >= RETRY_WINDOW_MS) {
      return { status: "review_required", message: "Check this invitation in Resend before sending again. Its safe retry window has expired." };
    }
    // This is a conservative invitation budget, separate from authentication,
    // receipts and the provider's account-wide quota. Failed calls consume slots.
    const { start } = dayRange();
    let reserved = false;
    for (let slot = 0; slot < BETA_MAIL_DAILY_LIMIT; slot++) {
      const { error } = await admin.from("audit_log").insert({
        id: eventId(`slot:${start}:${slot}`), actor_user_id: args.actorId, actor_role: "admin",
        entity_type: "beta_email_slot", entity_id: args.entityId, action: "reserve", meta: { operationId },
      });
      if (!error) { reserved = true; break; }
      if (error.code !== "23505") return unavailable;
    }
    if (!reserved) return { status: "daily_limit", message: "Today's 20 invitation attempts are used. Access is enabled; send the welcome email tomorrow." };
    if (!attempt) {
      const options = { ...args, email };
      const payload: Payload = { from: process.env.RESEND_FROM_EMAIL, to: email,
        subject: buildBetaInvitationSubject(), html: buildBetaInvitationHtml(options), text: buildBetaInvitationText(options) };
      const { error } = await admin.from("audit_log").insert({
        id: operationId, actor_user_id: args.actorId, actor_role: "admin", action: "prepare",
        entity_type: "beta_email_attempt", entity_id: args.entityId, meta: { payload } as unknown as Json,
      });
      if (error && error.code !== "23505") return unavailable;
      // Always read the winning immutable payload, including after a race.
      const winner = await admin.from("audit_log").select("created_at, meta").eq("id", operationId).maybeSingle();
      if (winner.error || !winner.data) return unavailable;
      attempt = winner.data;
    }
    const payload = payloadFrom((attempt.meta as Record<string, unknown>)?.payload);
    if (!payload || payload.to !== email || !Number.isFinite(Date.parse(attempt.created_at))) return unavailable;
    if (Date.now() - Date.parse(attempt.created_at) >= RETRY_WINDOW_MS) return { status: "review_required", message: "Check this invitation in Resend; the safe retry window has expired." };
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(payload, { idempotencyKey: `beta-welcome/${operationId}` });
    if (result.error || !result.data?.id) {
      console.error("[beta email] provider acceptance unconfirmed", { operationId, code: result.error?.name });
      return retry;
    }
    const { error } = await admin.from("audit_log").insert({
      id: acceptedId, actor_user_id: args.actorId, actor_role: "admin", action: "accepted",
      entity_type: "beta_email_accepted", entity_id: args.entityId, meta: { operationId, providerId: result.data.id },
    });
    if (error && error.code !== "23505") {
      console.error("[beta email] acceptance persistence failed", { operationId, code: error.code });
      return retry;
    }
    return { status: "sent", message: "Access is enabled and the welcome email was accepted by the mail provider." };
  } catch {
    console.error("[beta email] delivery interrupted", { operationId });
    return retry;
  }
}

/** Record new-flow provenance BEFORE an access stamp is written. Legacy stamps
 * were written after sends; without provenance their delivery needs review. */
export async function prepareBetaWelcome(admin: Admin, args: { email: string; audience: "author" | "reader"; actorId: string | null; entityId: string }): Promise<BetaDeliveryResult | null> {
  const email = args.email.trim().toLowerCase();
  const operationId = eventId(`recipient:${args.audience}:${email}`);
  const intentId = eventId(`intent:${operationId}`);
  const intent = await admin.from("audit_log").select("id").eq("id", intentId).maybeSingle();
  if (intent.error) throw new Error("Invitation history could not be checked. No email was sent.");
  if (intent.data) return null;
  const pattern = email.replace(/[%_\\]/g, "\\$&");
  const legacy = args.audience === "author"
    ? await admin.from("waitlist").select("email,beta_invited_at").ilike("email", pattern).not("beta_invited_at", "is", null).limit(10)
    : await admin.from("reader_waitlist").select("email,invited_at").ilike("email", pattern).not("invited_at", "is", null).limit(10);
  if (legacy.error) throw new Error("Previous invitation history could not be checked. No email was sent.");
  if (legacy.data?.some(r => r.email.trim().toLowerCase() === email)) {
    const recorded = await admin.from("audit_log").insert({ id: eventId(`legacy:${operationId}`), actor_user_id: args.actorId, actor_role: "admin", entity_type: "beta_email_legacy", entity_id: args.entityId, action: "review_required", meta: { operationId } });
    if (recorded.error && recorded.error.code !== "23505") throw new Error("Previous invitation review could not be recorded. No email was sent.");
    return { status: "review_required", message: "This person has an older invitation. Check its delivery in Resend before sending another; no duplicate was sent." };
  }
  const saved = await admin.from("audit_log").insert({ id: intentId, actor_user_id: args.actorId, actor_role: "admin", entity_type: "beta_email_intent", entity_id: args.entityId, action: "prepare_access", meta: { operationId } });
  if (saved.error && saved.error.code !== "23505") throw new Error("Invitation history could not be saved. No email was sent.");
  return null;
}

export async function getBetaDeliveryStates(admin: Admin, recipients: Array<{ email: string; audience: "author" | "reader"; invitedAt: string | null }>) {
  const keys = recipients.map(r => { const operation = eventId(`recipient:${r.audience}:${r.email.trim().toLowerCase()}`); return { operation, accepted: eventId(`accepted:${operation}`), intent: eventId(`intent:${operation}`), legacy: eventId(`legacy:${operation}`) }; });
  if (!keys.length) return [];
  const ids = keys.flatMap(k => [k.operation, k.accepted, k.intent, k.legacy]);
  const records = new Map<string, { id: string; created_at: string }>();
  // Keep PostgREST request URLs comfortably below proxy request-line limits.
  for (let offset = 0; offset < ids.length; offset += 90) {
    const { data, error } = await admin.from("audit_log").select("id,created_at").in("id", ids.slice(offset, offset + 90));
    if (error) throw new Error("Delivery status could not be loaded. Please retry.");
    for (const row of data ?? []) records.set(row.id, row);
  }
  return keys.map((key, index) => {
    if (records.has(key.accepted)) return "Accepted by mail provider";
    const attempt = records.get(key.operation);
    if (attempt) return Date.now() - Date.parse(attempt.created_at) >= RETRY_WINDOW_MS ? "Review required in Resend — retry window expired" : "Acceptance unconfirmed — safe to retry within 23 hours";
    if (records.has(key.legacy) || (recipients[index].invitedAt && !records.has(key.intent))) return "Older invitation — review delivery before resending";
    return "No welcome recorded in this delivery log";
  });
}
