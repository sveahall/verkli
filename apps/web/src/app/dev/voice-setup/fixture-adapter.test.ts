import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceFixture, type FixtureMode } from "./fixture-adapter";
const valid = { ownerId: "demo-author-a", requestKey: "request-one", sampleId: "synthetic-valid", consent: true as const };
function setup(initial?: string) {
  let saved = initial ?? null;
  let mode: FixtureMode = "success";
  const storage = { read: () => saved, write: (value: string) => { saved = value; } };
  const adapter = createVoiceFixture(storage, () => mode);
  return { adapter, storage, saved: () => saved, mode: (value: FixtureMode) => { mode = value; } };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe("synthetic voice lifecycle", () => {
  it("requires explicit consent and a valid synthetic sample", async () => {
    const { adapter } = setup();
    await expect(adapter.start({ ...valid, consent: false })).rejects.toThrow("consent");
    for (const sampleId of ["", "synthetic-invalid"]) await expect(adapter.start({ ...valid, sampleId })).rejects.toThrow("sample");
    expect(adapter.metrics().creates).toBe(0);
  });
  it("deduplicates a request and rejects reuse with changed input", async () => {
    const { adapter } = setup();
    const first = await adapter.start(valid), second = await adapter.start(valid);
    expect(second.id).toBe(first.id); expect(adapter.metrics().creates).toBe(1);
    await expect(adapter.start({ ...valid, consent: false })).rejects.toThrow();
    await vi.runAllTimersAsync();
    const ready = await adapter.load(valid.ownerId);
    expect(ready?.status).toBe("ready"); expect(ready?.binding?.requestId).toBe(first.id);
    expect(ready?.binding?.sampleHash).toBe(ready?.sampleHash);
    expect((await adapter.start(valid)).id).toBe(first.id); expect(adapter.metrics().creates).toBe(1);
  });
  it("isolates owners for reads and mutations", async () => {
    const { adapter } = setup(); const first = await adapter.start(valid);
    expect(await adapter.load("demo-author-b")).toBeNull();
    await expect(adapter.revoke("demo-author-b", first.id)).rejects.toThrow("owner");
  });
  it("revokes while creating and cleans up the late success without exposing ready", async () => {
    const { adapter } = setup(); const states: string[] = [];
    adapter.subscribe(() => { void adapter.load(valid.ownerId).then((row) => { if (row) states.push(row.status); }); });
    const first = await adapter.start(valid); await adapter.revoke(valid.ownerId, first.id);
    await vi.runAllTimersAsync();
    expect((await adapter.load(valid.ownerId))?.status).toBe("deleted"); expect(states).not.toContain("ready");
    expect(adapter.metrics()).toEqual({ creates: 1, deletes: 1 });
    await adapter.cleanup(valid.ownerId, first.id); expect(adapter.metrics().deletes).toBe(1);
  });
  it("reconciles uncertain outcomes without another create", async () => {
    const env = setup(); env.mode("uncertain"); const first = await env.adapter.start(valid);
    await vi.runAllTimersAsync(); expect((await env.adapter.load(valid.ownerId))?.status).toBe("uncertain");
    await env.adapter.start(valid); expect(env.adapter.metrics().creates).toBe(1);
    await env.adapter.reconcile(valid.ownerId, first.id);
    expect((await env.adapter.load(valid.ownerId))?.status).toBe("ready");
  });
  it("resumes failed cleanup after adapter restart using the original binding", async () => {
    const env = setup(); const first = await env.adapter.start(valid); await vi.runAllTimersAsync();
    const original = (await env.adapter.load(valid.ownerId))?.binding;
    env.mode("cleanup-error"); await env.adapter.revoke(valid.ownerId, first.id); await vi.runAllTimersAsync();
    expect((await env.adapter.load(valid.ownerId))?.status).toBe("deleting"); env.adapter.dispose();
    const restarted = createVoiceFixture(env.storage, () => "success");
    await restarted.cleanup(valid.ownerId, first.id); await vi.runAllTimersAsync();
    const result = await restarted.load(valid.ownerId);
    expect(result?.status).toBe("deleted"); expect(result?.binding).toEqual(original);
    expect(restarted.metrics()).toEqual({ creates: 1, deletes: 1 });
  });
  it("restores interrupted creation as uncertain and reconciles its ledger", async () => {
    const env = setup(); const first = await env.adapter.start(valid); env.adapter.dispose();
    const restarted = createVoiceFixture(env.storage, () => "success");
    expect((await restarted.load(valid.ownerId))?.status).toBe("uncertain");
    await restarted.revoke(valid.ownerId, first.id); await restarted.reconcile(valid.ownerId, first.id); await vi.runAllTimersAsync();
    expect((await restarted.load(valid.ownerId))?.status).toBe("deleted"); expect(restarted.metrics().creates).toBe(1);
  });
  it("never publishes an operation when persistence fails", async () => {
    const adapter = createVoiceFixture({ read: () => null, write: () => { throw new Error("Synthetic storage failure"); } }, () => "success");
    await expect(adapter.start(valid)).rejects.toThrow("storage");
    await expect(adapter.load(valid.ownerId)).rejects.toThrow("storage"); expect(adapter.metrics().creates).toBe(0);
  });
  it("surfaces a failed late save and resumes from the last persisted request", async () => {
    let saved: string | null = null, failWrite = false;
    const storage = { read: () => saved, write: (value: string) => { if (failWrite) throw new Error("storage offline"); saved = value; } };
    const adapter = createVoiceFixture(storage, () => "success");
    const first = await adapter.start(valid); failWrite = true;
    await vi.runAllTimersAsync();
    await expect(adapter.load(valid.ownerId)).rejects.toThrow("storage");
    adapter.dispose(); failWrite = false;
    const restarted = createVoiceFixture(storage, () => "success");
    expect((await restarted.load(valid.ownerId))?.status).toBe("uncertain");
    await restarted.reconcile(valid.ownerId, first.id);
    expect((await restarted.load(valid.ownerId))?.status).toBe("ready");
    expect(restarted.metrics().creates).toBe(1);
  });
  it("rejects a persisted binding altered to another fake voice", async () => {
    const env = setup(); await env.adapter.start(valid); await vi.runAllTimersAsync();
    const tampered = JSON.parse(env.saved()!); tampered.requests[0].binding.voiceId = "other-voice";
    expect(() => setup(JSON.stringify(tampered))).toThrow("ledger");
  });
  it("notifies and locks every action if revocation cannot be saved", async () => {
    let saved: string | null = null, failWrite = false;
    const adapter = createVoiceFixture({ read: () => saved, write: (value) => { if (failWrite) throw new Error("storage offline"); saved = value; } }, () => "success");
    const first = await adapter.start(valid); await vi.runAllTimersAsync();
    const notify = vi.fn(); adapter.subscribe(notify); failWrite = true;
    await expect(adapter.revoke(valid.ownerId, first.id)).rejects.toThrow("storage");
    expect(notify).toHaveBeenCalledOnce();
    await expect(adapter.start(valid)).rejects.toThrow("storage");
    await expect(adapter.revoke(valid.ownerId, first.id)).rejects.toThrow("storage");
    await expect(adapter.reconcile(valid.ownerId, first.id)).rejects.toThrow("storage");
    await expect(adapter.cleanup(valid.ownerId, first.id)).rejects.toThrow("storage");
  });
  it("does not offer impossible reconciliation after confirmed failure and revocation", async () => {
    const env = setup(); env.mode("failure"); const first = await env.adapter.start(valid); await vi.runAllTimersAsync();
    const revoked = await env.adapter.revoke(valid.ownerId, first.id);
    expect(revoked.status).toBe("failed"); expect(revoked.error).toContain("no voice was created");
    expect(revoked.error).not.toContain("must be reconciled");
  });
  it("fails closed on malformed saved state", () => {
    expect(() => setup('{"requests":[]}')).toThrow();
  });
});
