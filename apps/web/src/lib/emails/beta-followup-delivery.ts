import { createHash } from "node:crypto";
import { Resend } from "resend";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  BETA_FOLLOWUP_REPLY_TO, buildBetaFollowupHtml, buildBetaFollowupSubject, buildBetaFollowupText,
  type BetaFollowupKind,
} from "./beta-followup";

type Admin = ReturnType<typeof createAdminClient>;
/** Own budget, separate from the 20 invitation slots. Resend's free tier is
 * 100/day for the whole account, and signup confirmations share it. */
export const BETA_FOLLOWUP_DAILY_LIMIT = 40;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export type BetaFollowupResult = {
  status: "sent" | "already_sent" | "retry" | "review_required" | "daily_limit" | "unavailable";
  message: string;
};
type Payload = { from: string; to: string; replyTo: string; subject: string; html: string; text: string };

// Deterministic primary keys make reservations atomic across processes.
function eventId(key: string): string {
  const hex = createHash("sha256").update(`verkli:beta-followup:v1:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function dayStart() {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}
function ids(kind: BetaFollowupKind, email: string) {
  const operation = eventId(`recipient:${kind}:${email}`);
  return { operation, accepted: eventId(`accepted:${operation}`) };
}
function payloadFrom(value: unknown): Payload | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  return ["from", "to", "replyTo", "subject", "html", "text"].every(k => typeof data[k] === "string" && data[k]) ? data as Payload : null;
}

/** Emails already accepted by the provider for this kind, so a batch can skip them. */
export async function getSentBetaFollowups(admin: Admin, kind: BetaFollowupKind, emails: string[]): Promise<Set<string>> {
  const byAccepted = new Map(emails.map(e => [ids(kind, e.trim().toLowerCase()).accepted, e]));
  const keys = [...byAccepted.keys()];
  const sent = new Set<string>();
  for (let offset = 0; offset < keys.length; offset += 90) {
    const { data, error } = await admin.from("audit_log").select("id").in("id", keys.slice(offset, offset + 90));
    if (error) throw new Error("Follow-up history could not be loaded. Nothing sent.");
    for (const row of data ?? []) { const email = byAccepted.get(row.id); if (email) sent.add(email); }
  }
  return sent;
}

/** Append-only ledger: prepare -> reserve slot -> send -> accepted. Accepted is NOT inbox proof. */
export async function sendBetaFollowup(admin: Admin, args: {
  kind: BetaFollowupKind; entityId: string; email: string; name?: string | null;
}): Promise<BetaFollowupResult> {
  const email = args.email.trim().toLowerCase();
  const { operation, accepted: acceptedId } = ids(args.kind, email);
  const unavailable: BetaFollowupResult = { status: "unavailable", message: "The follow-up could not be prepared. Nothing was sent." };
  const retry: BetaFollowupResult = { status: "retry", message: "Provider acceptance unconfirmed; safe to retry within 23 hours." };
  try {
    const accepted = await admin.from("audit_log").select("id").eq("id", acceptedId).maybeSingle();
    if (accepted.error) return unavailable;
    if (accepted.data) return { status: "already_sent", message: "Already accepted by the mail provider. No duplicate was sent." };
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return unavailable;
    const saved = await admin.from("audit_log").select("created_at, meta").eq("id", operation).maybeSingle();
    if (saved.error) return unavailable;
    let attempt = saved.data;
    if (attempt && Date.now() - Date.parse(attempt.created_at) >= RETRY_WINDOW_MS) {
      return { status: "review_required", message: "Check this follow-up in Resend before sending again; its safe retry window has expired." };
    }
    const start = dayStart();
    let reserved = false;
    for (let slot = 0; slot < BETA_FOLLOWUP_DAILY_LIMIT; slot++) {
      const { error } = await admin.from("audit_log").insert({
        id: eventId(`slot:${start}:${slot}`), actor_user_id: null, actor_role: "admin",
        entity_type: "beta_followup_slot", entity_id: args.entityId, action: "reserve", meta: { operation },
      });
      if (!error) { reserved = true; break; }
      if (error.code !== "23505") return unavailable;
    }
    if (!reserved) return { status: "daily_limit", message: `Today's ${BETA_FOLLOWUP_DAILY_LIMIT} follow-up slots are used. Run again after 00:00 UTC.` };
    if (!attempt) {
      const options = { kind: args.kind, name: args.name };
      const payload: Payload = { from: process.env.RESEND_FROM_EMAIL, to: email, replyTo: BETA_FOLLOWUP_REPLY_TO,
        subject: buildBetaFollowupSubject(options), html: buildBetaFollowupHtml(options), text: buildBetaFollowupText(options) };
      const { error } = await admin.from("audit_log").insert({
        id: operation, actor_user_id: null, actor_role: "admin", action: "prepare",
        entity_type: "beta_followup_attempt", entity_id: args.entityId, meta: { kind: args.kind, payload } as unknown as Json,
      });
      if (error && error.code !== "23505") return unavailable;
      // Always send the winning immutable payload, including after a race.
      const winner = await admin.from("audit_log").select("created_at, meta").eq("id", operation).maybeSingle();
      if (winner.error || !winner.data) return unavailable;
      attempt = winner.data;
    }
    const payload = payloadFrom((attempt.meta as Record<string, unknown>)?.payload);
    if (!payload || payload.to !== email) return unavailable;
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(payload, { idempotencyKey: `beta-followup/${operation}` });
    if (result.error || !result.data?.id) {
      console.error("[beta followup] provider acceptance unconfirmed", { operation, code: result.error?.name });
      return retry;
    }
    const { error } = await admin.from("audit_log").insert({
      id: acceptedId, actor_user_id: null, actor_role: "admin", action: "accepted",
      entity_type: "beta_followup_accepted", entity_id: args.entityId, meta: { operation, providerId: result.data.id },
    });
    if (error && error.code !== "23505") {
      console.error("[beta followup] acceptance persistence failed", { operation, code: error.code });
      return retry;
    }
    return { status: "sent", message: "Accepted by the mail provider." };
  } catch {
    console.error("[beta followup] delivery interrupted", { operation });
    return retry;
  }
}
