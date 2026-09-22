import { randomUUID } from "node:crypto";
import { validateForPlatform } from "@/lib/social/platform-constraints";

export type DeliveryState = "scheduled" | "processing" | "failed" | "uncertain" | "simulated" | "published" | "cancelled";
export type DeliveryMode = "simulation" | "live";
export type DeliveryEvent = { state: DeliveryState; at: string; attempt: number; error?: string };
export type DeliveryRecord = {
  id: string; userId: string; postId: string; approvedRevision: string; text: string; channel: string;
  mode: DeliveryMode; scheduledFor: string; state: DeliveryState; version: number; attempts: number;
  createdAt: string; updatedAt: string; events: DeliveryEvent[]; error?: string; providerId?: string;
};

/** Server-only storage boundary. Never implement this with client-writable metadata.
 * Writes must be atomic and durable, including the event history. Every read/write
 * must scope by owner; CAS must match id, owner and version. Insert must enforce
 * isDeliveryInsertConflict under the same lock/transaction as the write.
 * Callers must first verify a server-owned approval, current ownership and copy.
 */
export interface DeliveryRepository {
  get(id: string, userId: string): Promise<DeliveryRecord | null>;
  insert(record: DeliveryRecord): Promise<boolean>;
  compareAndSwap(previous: DeliveryRecord, next: DeliveryRecord): Promise<boolean>;
}
export type DeliveryOutcome =
  | { state: "simulated" }
  | { state: "published"; providerId: string }
  // Only return failed when the adapter can prove no external effect occurred.
  | { state: "failed" | "uncertain"; error?: string };
export interface DeliveryTransport {
  mode: DeliveryMode;
  send(record: DeliveryRecord): Promise<DeliveryOutcome>;
}
export class DeliveryLedgerError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function isDeliveryInsertConflict(existing: DeliveryRecord, candidate: DeliveryRecord): boolean {
  if (existing.postId !== candidate.postId || existing.mode !== candidate.mode || existing.state === "cancelled") return false;
  return existing.approvedRevision === candidate.approvedRevision || ["scheduled", "processing", "failed", "uncertain"].includes(existing.state);
}

async function read(repository: DeliveryRepository, id: string, userId: string): Promise<DeliveryRecord> {
  const record = await repository.get(id, userId);
  if (!record || record.userId !== userId) throw new DeliveryLedgerError("Campaign delivery not found.", 404);
  return record;
}
function transition(record: DeliveryRecord, state: DeliveryState, now: number, extra: Partial<Pick<DeliveryRecord, "attempts" | "error" | "providerId">> = {}): DeliveryRecord {
  const at = new Date(now).toISOString();
  const next = { ...record, ...extra, state, version: record.version + 1, updatedAt: at };
  return { ...next, events: [...record.events, { state, at, attempt: next.attempts, ...(next.error ? { error: next.error } : {}) }] };
}
async function save(repository: DeliveryRepository, previous: DeliveryRecord, next: DeliveryRecord): Promise<DeliveryRecord> {
  if (!await repository.compareAndSwap(previous, next)) throw new DeliveryLedgerError("This delivery changed. Refresh before trying again.");
  return next;
}

/** The route must supply a verified server approval, never trust client status=ready. */
export async function scheduleDelivery(input: {
  repository: DeliveryRepository; userId: string; postId: string; approvedRevision: string;
  text: string; channel: string; mode: DeliveryMode; scheduledFor: string; now?: number; id?: string;
}): Promise<DeliveryRecord> {
  const now = input.now ?? Date.now();
  const scheduled = Date.parse(input.scheduledFor);
  if (!Number.isFinite(scheduled) || scheduled < now - 5_000) throw new DeliveryLedgerError("Choose a publishing time now or in the future.", 422);
  if (!input.userId || !input.postId || !input.approvedRevision.trim()) throw new DeliveryLedgerError("Approve the current campaign copy before scheduling.", 422);
  if (input.channel !== "x") throw new DeliveryLedgerError("This channel requires manual sharing.", 422);
  if (input.mode !== "simulation" && input.mode !== "live") throw new DeliveryLedgerError("Invalid delivery mode.", 422);
  const validation = validateForPlatform(input.text, "x");
  if (!input.text.trim() || !validation.valid) throw new DeliveryLedgerError(validation.error ?? "Add the final caption before scheduling.", 422);
  const at = new Date(now).toISOString();
  const record: DeliveryRecord = {
    id: input.id ?? randomUUID(), userId: input.userId, postId: input.postId,
    approvedRevision: input.approvedRevision, text: input.text, channel: input.channel, mode: input.mode,
    scheduledFor: new Date(scheduled).toISOString(), state: "scheduled", version: 1, attempts: 0,
    createdAt: at, updatedAt: at, events: [{ state: "scheduled", at, attempt: 0 }],
  };
  if (!await input.repository.insert(record)) throw new DeliveryLedgerError("This post already has an active delivery or this approval was already delivered.");
  return record;
}

export async function changeDelivery(input: {
  repository: DeliveryRepository; id: string; userId: string; expectedVersion: number;
  action: "cancel" | "retry"; now?: number;
}): Promise<DeliveryRecord> {
  const record = await read(input.repository, input.id, input.userId);
  if (record.version !== input.expectedVersion) throw new DeliveryLedgerError("This delivery changed. Refresh before trying again.");
  if (record.state === "uncertain" || record.state === "processing") throw new DeliveryLedgerError("Delivery is in progress or uncertain. Verify the provider result; automatic retry and cancellation are blocked.");
  if (input.action === "retry") {
    if (record.state !== "failed") throw new DeliveryLedgerError("Only a confirmed failure before delivery can be retried.");
    return save(input.repository, record, transition(record, "scheduled", input.now ?? Date.now(), { error: undefined }));
  }
  if (input.action !== "cancel" || !["scheduled", "failed"].includes(record.state)) throw new DeliveryLedgerError("This delivery can no longer be cancelled.");
  return save(input.repository, record, transition(record, "cancelled", input.now ?? Date.now(), { error: undefined }));
}

export async function consumeDelivery(input: {
  repository: DeliveryRepository; id: string; userId: string; transport: DeliveryTransport; now?: number;
}): Promise<DeliveryRecord> {
  const record = await read(input.repository, input.id, input.userId);
  const now = input.now ?? Date.now();
  if (record.mode !== input.transport.mode) throw new DeliveryLedgerError("Delivery transport mode does not match the approved delivery.");
  if (record.state !== "scheduled" || Date.parse(record.scheduledFor) > now) return record;
  const claimed = transition(record, "processing", now, { attempts: record.attempts + 1, error: undefined });
  if (!await input.repository.compareAndSwap(record, claimed)) return read(input.repository, input.id, input.userId);
  let outcome: DeliveryOutcome;
  try { outcome = await input.transport.send(structuredClone(claimed)); }
  catch { outcome = { state: "uncertain" }; }
  // A provider timeout/exception cannot prove no dispatch. Persist uncertainty;
  // a crash or failed receipt write leaves processing locked for reconciliation.
  const valid = outcome && (
    outcome.state === "failed" || outcome.state === "uncertain" ||
    (outcome.state === "simulated" && record.mode === "simulation") ||
    (outcome.state === "published" && record.mode === "live" && typeof outcome.providerId === "string" && !!outcome.providerId.trim())
  );
  if (!valid) outcome = { state: "uncertain" };
  const error = outcome.state === "failed" ? "Delivery stopped before sending. You can retry the approved copy."
    : outcome.state === "uncertain" ? "The delivery result is unknown. Verify it with the provider before any further action." : undefined;
  const completed = transition(claimed, outcome.state, input.now ?? Date.now(), {
    error, providerId: outcome.state === "published" ? outcome.providerId : undefined,
  });
  try { return await save(input.repository, claimed, completed); }
  catch { throw new DeliveryLedgerError("Could not save the delivery receipt. The attempt remains locked; verify its result before any retry.", 503); }
}

/** A deterministic test transport: no provider calls, credentials or network I/O. */
export function createSimulationTransport(outcome: "success" | "failure" | "uncertain" = "success"): DeliveryTransport {
  return { mode: "simulation", async send() {
    return outcome === "success" ? { state: "simulated" } : { state: outcome === "failure" ? "failed" : "uncertain" };
  } };
}
