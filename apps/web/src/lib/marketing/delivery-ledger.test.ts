import { describe, expect, it } from "vitest";
import {
  changeDelivery, consumeDelivery, createSimulationTransport, isDeliveryInsertConflict,
  scheduleDelivery, type DeliveryRecord, type DeliveryRepository, type DeliveryTransport,
} from "./delivery-ledger";

class MemoryRepository implements DeliveryRepository {
  rows = new Map<string, DeliveryRecord>();
  failFinalWrite = false;
  async get(id: string, userId: string) {
    const row = this.rows.get(id);
    return row?.userId === userId ? structuredClone(row) : null;
  }
  async insert(row: DeliveryRecord) {
    if (this.rows.has(row.id) || [...this.rows.values()].some(existing => isDeliveryInsertConflict(existing, row))) return false;
    this.rows.set(row.id, structuredClone(row));
    return true;
  }
  async compareAndSwap(previous: DeliveryRecord, next: DeliveryRecord) {
    if (this.failFinalWrite && previous.state === "processing") throw new Error("disk unavailable");
    const row = this.rows.get(previous.id);
    if (!row || row.userId !== previous.userId || row.version !== previous.version) return false;
    this.rows.set(next.id, structuredClone(next));
    return true;
  }
}
const now = Date.parse("2026-09-22T10:00:00Z");
const schedule = (repository: MemoryRepository, extra = {}) => scheduleDelivery({
  repository, userId: "author", postId: "post", approvedRevision: "revision-1", text: "Approved text",
  channel: "x", mode: "simulation", scheduledFor: new Date(now).toISOString(), now, ...extra,
});
const consume = (repository: MemoryRepository, id: string, transport = createSimulationTransport()) =>
  consumeDelivery({ repository, id, userId: "author", transport, now });

describe("server-owned campaign delivery contract", () => {
  it("persists the approved snapshot and append-only simulation history", async () => {
    const repository = new MemoryRepository();
    const scheduled = await schedule(repository);
    const finished = await consume(repository, scheduled.id);
    expect(finished).toMatchObject({ state: "simulated", mode: "simulation", attempts: 1, text: "Approved text", version: 3 });
    expect(finished.events.map(event => event.state)).toEqual(["scheduled", "processing", "simulated"]);
    expect(finished.providerId).toBeUndefined();
  });
  it("allows only one simultaneous schedule, including a different revision", async () => {
    const repository = new MemoryRepository();
    const results = await Promise.allSettled([schedule(repository), schedule(repository, { approvedRevision: "revision-2" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  });
  it("does not schedule the same completed approval twice", async () => {
    const repository = new MemoryRepository();
    await consume(repository, (await schedule(repository)).id);
    await expect(schedule(repository)).rejects.toThrow(/already/i);
  });
  it("claims once under duplicate concurrent consumers", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository);
    let sends = 0;
    const transport: DeliveryTransport = { mode: "simulation", send: async () => { sends++; return { state: "simulated" }; } };
    await Promise.all([consume(repository, row.id, transport), consume(repository, row.id, transport)]);
    expect(sends).toBe(1);
  });
  it("never dispatches before the scheduled time", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository, { scheduledFor: new Date(now + 60_000).toISOString() });
    expect((await consume(repository, row.id)).state).toBe("scheduled");
  });
  it("cancels atomically and ignores a replayed worker", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository);
    const cancelled = await changeDelivery({ repository, id: row.id, userId: row.userId, expectedVersion: row.version, action: "cancel", now });
    expect((await consume(repository, row.id)).state).toBe("cancelled");
    expect(cancelled.events.map(event => event.state)).toEqual(["scheduled", "cancelled"]);
    expect((await schedule(repository)).id).not.toBe(row.id);
  });
  it("retries only a proven pre-dispatch failure and retains the same immutable approval", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository);
    const failed = await consume(repository, row.id, createSimulationTransport("failure"));
    const retry = await changeDelivery({ repository, id: row.id, userId: row.userId, expectedVersion: failed.version, action: "retry", now });
    expect(retry).toMatchObject({ id: row.id, text: row.text, approvedRevision: row.approvedRevision, state: "scheduled" });
    const done = await consume(repository, row.id);
    expect(done.attempts).toBe(2);
    expect(done.events.map(event => event.state)).toEqual(["scheduled", "processing", "failed", "scheduled", "processing", "simulated"]);
  });
  it("rejects stale UI writes and another owner's access", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository);
    await expect(changeDelivery({ repository, id: row.id, userId: row.userId, expectedVersion: 0, action: "cancel", now })).rejects.toThrow(/changed/i);
    await expect(changeDelivery({ repository, id: row.id, userId: "other", expectedVersion: row.version, action: "cancel", now })).rejects.toThrow(/not found/i);
    await expect(consumeDelivery({ repository, id: row.id, userId: "other", transport: createSimulationTransport(), now })).rejects.toThrow(/not found/i);
  });
  it("treats a transport exception as uncertain and never exposes its private error", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository);
    const uncertain = await consume(repository, row.id, { mode: "simulation", send: async () => { throw new Error("secret token"); } });
    expect(uncertain.state).toBe("uncertain");
    expect(JSON.stringify(uncertain)).not.toContain("secret token");
    for (const action of ["cancel", "retry"] as const) {
      await expect(changeDelivery({ repository, id: row.id, userId: row.userId, expectedVersion: uncertain.version, action, now })).rejects.toThrow(/uncertain/i);
    }
  });
  it("does not send again if the final receipt cannot be persisted", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository);
    repository.failFinalWrite = true;
    let sends = 0;
    const transport: DeliveryTransport = { mode: "simulation", send: async () => { sends++; return { state: "simulated" }; } };
    await expect(consume(repository, row.id, transport)).rejects.toThrow(/receipt/i);
    expect((await consume(repository, row.id, transport)).state).toBe("processing");
    expect(sends).toBe(1);
  });
  it("rejects cancellation after claim wins", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository);
    const transport: DeliveryTransport = { mode: "simulation", send: async claimed => {
      await expect(changeDelivery({ repository, id: row.id, userId: row.userId, expectedVersion: claimed.version, action: "cancel", now })).rejects.toThrow(/progress/i);
      return { state: "simulated" };
    } };
    expect((await consume(repository, row.id, transport)).state).toBe("simulated");
  });
  it("rejects transport-mode changes before claim", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository);
    await expect(consume(repository, row.id, { mode: "live", send: async () => ({ state: "published", providerId: "real" }) })).rejects.toThrow(/mode/i);
    expect((await repository.get(row.id, row.userId))?.state).toBe("scheduled");
  });
  it("never accepts a provider receipt in simulation mode", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository);
    const result = await consume(repository, row.id, { mode: "simulation", send: async () => ({ state: "published", providerId: "forged" }) });
    expect(result.state).toBe("uncertain");
    expect(result.providerId).toBeUndefined();
  });
  it("requires a nonempty provider ID for live completion", async () => {
    const repository = new MemoryRepository();
    const row = await schedule(repository, { mode: "live" });
    expect((await consume(repository, row.id, { mode: "live", send: async () => ({ state: "published", providerId: "" }) })).state).toBe("uncertain");
  });
  it("validates dates, snapshot and channel before writing", async () => {
    const repository = new MemoryRepository();
    for (const extra of [{ scheduledFor: "bad" }, { scheduledFor: new Date(now - 60_000).toISOString() }, { text: " " }, { channel: "instagram" }, { approvedRevision: "" }]) {
      await expect(schedule(repository, extra)).rejects.toThrow();
    }
    expect(repository.rows.size).toBe(0);
  });
});
