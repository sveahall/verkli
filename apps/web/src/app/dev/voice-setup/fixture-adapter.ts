import { z } from "zod";
import { VOICE_DEMO_CONSENT, VOICE_DEMO_SAMPLE_HASH, voiceBindingSchema, voiceOwnerSchema, voiceRequestSchema, type VoiceSetupAdapter, type VoiceStart } from "@/lib/audiobook/voice-request-contract";
export type FixtureMode = "success" | "failure" | "uncertain" | "cleanup-error";
type Storage = { read(): string | null; write(value: string): void };
const stateSchema = z.object({ version: z.literal(1), requests: z.array(voiceRequestSchema).max(2), ledger: z.array(voiceBindingSchema.extend({ deleted: z.boolean() })).max(2), creates: z.number().int().nonnegative(), deletes: z.number().int().nonnegative() }).strict();
type State = z.infer<typeof stateSchema>;
/** Synthetic browser simulation, never an auth boundary or a real provider/store. */
export function createVoiceFixture(storage: Storage, mode: () => FixtureMode) {
  const saved = storage.read();
  let state: State = saved ? stateSchema.parse(JSON.parse(saved)) : { version: 1, requests: [], ledger: [], creates: 0, deletes: 0 };
  const validate = (next: State) => {
    stateSchema.parse(next);
    if (new Set(next.requests.map((row) => row.ownerId)).size !== next.requests.length || new Set(next.requests.map((row) => row.id)).size !== next.requests.length || new Set(next.ledger.map((row) => row.requestId)).size !== next.ledger.length) throw new Error("Duplicate synthetic operation.");
    for (const entry of next.ledger) if (!next.requests.some((row) => row.id === entry.requestId)) throw new Error("Orphaned synthetic binding.");
    for (const row of next.requests) {
      const entry = next.ledger.find((item) => item.requestId === row.id);
      if (row.binding && (!entry || row.binding.voiceId !== entry.voiceId || row.binding.sampleHash !== entry.sampleHash || row.binding.consentVersion !== entry.consentVersion)) throw new Error("Saved synthetic binding does not match the ledger.");
      if (row.status === "ready" && entry?.deleted) throw new Error("Deleted synthetic voice cannot be ready.");
      if (row.status === "deleted" && !entry?.deleted) throw new Error("Synthetic deletion has not completed.");
    }
  };
  validate(state);
  const listeners = new Set<() => void>(), timers = new Set<ReturnType<typeof setTimeout>>(), cleanupRunning = new Set<string>();
  let disposed = false;
  let storageFailure: Error | null = null;
  const assertActive = () => {
    if (disposed) throw new Error("The simulated worker has stopped. Reload the demo.");
    if (storageFailure) throw storageFailure;
  };
  const publish = (change: (draft: State) => void) => {
    assertActive();
    const next = structuredClone(state); change(next); validate(next);
    try { storage.write(JSON.stringify(next)); }
    catch { storageFailure = new Error("Demo storage could not save the operation. Reload before continuing."); listeners.forEach((listener) => listener()); throw storageFailure; }
    state = next; listeners.forEach((listener) => listener());
  };
  const find = (ownerId: string, id: string, source = state) => {
    assertActive();
    voiceOwnerSchema.parse(ownerId);
    const row = source.requests.find((item) => item.id === id && item.ownerId === ownerId);
    if (!row) throw new Error("Voice operation not found for this owner."); return row;
  };
  const snapshot = (ownerId: string, id: string) => structuredClone(find(ownerId, id));
  const schedule = (fn: () => void) => {
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed) { try { fn(); } catch { listeners.forEach((listener) => listener()); } } }, 1200);
    timers.add(timer);
  };
  // A stopped worker has no authority to claim creation failed or blindly repeat it.
  if (state.requests.some((row) => row.status === "requesting" || row.status === "pending")) publish((draft) => {
    for (const row of draft.requests) if (row.status === "requesting" || row.status === "pending") { row.status = "uncertain"; row.error = "Simulated worker restarted. Reconcile the original request."; }
  });
  function beginCleanup(ownerId: string, id: string) {
    const row = find(ownerId, id);
    if (row.status === "deleted") return;
    if (!row.consentRevoked || !row.binding || row.status !== "deleting") throw new Error("Cleanup requires a verified binding and revoked consent.");
    if (cleanupRunning.has(id)) return;
    const captured = mode(); cleanupRunning.add(id);
    schedule(() => {
      cleanupRunning.delete(id);
      publish((draft) => {
        const current = find(ownerId, id, draft);
        if (captured === "cleanup-error") { current.error = "Synthetic deletion failed. Retry cleanup for this same operation."; return; }
        const entry = draft.ledger.find((item) => item.requestId === id)!;
        if (!entry.deleted) { entry.deleted = true; draft.deletes++; }
        current.status = "deleted"; current.error = null;
      });
    });
  }
  function acceptOutcome(ownerId: string, id: string) {
    publish((draft) => {
      const row = find(ownerId, id, draft), entry = draft.ledger.find((item) => item.requestId === id);
      if (!entry) { row.status = "failed"; row.error = "The simulated provider confirms no voice was created."; return; }
      row.binding = voiceBindingSchema.parse({ requestId: entry.requestId, provider: entry.provider, voiceId: entry.voiceId, consentVersion: entry.consentVersion, sampleHash: entry.sampleHash });
      row.status = row.consentRevoked ? (entry.deleted ? "deleted" : "deleting") : "ready"; row.error = null;
    });
    if (find(ownerId, id).status === "deleting") beginCleanup(ownerId, id);
  }
  const adapter: VoiceSetupAdapter & { dispose(): void; metrics(): { creates: number; deletes: number } } = {
    async load(ownerId) { assertActive(); voiceOwnerSchema.parse(ownerId); const row = state.requests.find((item) => item.ownerId === ownerId); return row ? structuredClone(row) : null; },
    async start(input: VoiceStart) {
      assertActive();
      voiceOwnerSchema.parse(input.ownerId);
      if (input.consent !== true) throw new Error("Explicit demo consent is required.");
      if (input.sampleId !== "synthetic-valid") throw new Error("Choose the valid synthetic sample before continuing.");
      if (!input.requestKey || input.requestKey.length > 100) throw new Error("A valid request key is required.");
      const existing = state.requests.find((row) => row.ownerId === input.ownerId);
      if (existing) {
        if (existing.requestKey !== input.requestKey || existing.sampleId !== input.sampleId) throw new Error("This owner already has a demo operation. Resume that operation.");
        return structuredClone(existing);
      }
      const id = `synthetic-${input.ownerId}-${input.requestKey}`, captured = mode();
      publish((draft) => { draft.requests.push({ id, ownerId: voiceOwnerSchema.parse(input.ownerId), requestKey: input.requestKey, sampleId: "synthetic-valid", sampleHash: VOICE_DEMO_SAMPLE_HASH, consentVersion: VOICE_DEMO_CONSENT, consentRevoked: false, status: "pending", binding: null, error: null }); });
      publish((draft) => {
        const row = find(input.ownerId, id, draft); row.status = "requesting"; draft.creates++;
        if (captured !== "failure") draft.ledger.push({ requestId: id, provider: "synthetic", voiceId: `fake-voice-${id}`, sampleHash: row.sampleHash, consentVersion: row.consentVersion, deleted: false });
      });
      schedule(() => {
        const row = find(input.ownerId, id);
        if (row.status !== "requesting" && row.status !== "uncertain") return;
        if (captured === "uncertain") publish((draft) => { const current = find(input.ownerId, id, draft); current.status = "uncertain"; current.error = "The simulated response was lost. Reconcile; do not create again."; });
        else acceptOutcome(input.ownerId, id);
      });
      return snapshot(input.ownerId, id);
    },
    async revoke(ownerId, id) {
      const current = find(ownerId, id);
      if (current.consentRevoked) return snapshot(ownerId, id);
      publish((draft) => { const row = find(ownerId, id, draft); row.consentRevoked = true; row.status = row.binding ? "deleting" : row.status === "failed" ? "failed" : "uncertain"; row.error = row.binding ? null : row.status === "failed" ? "Consent revoked. The simulated provider confirms no voice was created." : "Consent revoked. The original outcome must be reconciled before cleanup can finish."; });
      if (find(ownerId, id).status === "deleting") beginCleanup(ownerId, id);
      return snapshot(ownerId, id);
    },
    async reconcile(ownerId, id) {
      if (find(ownerId, id).status !== "uncertain") throw new Error("Only uncertain operations can be reconciled.");
      acceptOutcome(ownerId, id); return snapshot(ownerId, id);
    },
    async cleanup(ownerId, id) { beginCleanup(ownerId, id); return snapshot(ownerId, id); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    metrics: () => ({ creates: state.creates, deletes: state.deletes }),
    dispose() { disposed = true; timers.forEach(clearTimeout); timers.clear(); listeners.clear(); cleanupRunning.clear(); },
  };
  return adapter;
}
