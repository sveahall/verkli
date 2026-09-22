import { describe, expect, it } from "vitest";
import { createSupabaseDeliveryRepository, type DeliveryRpcClient } from "./delivery-ledger-supabase";
import type { DeliveryRecord } from "./delivery-ledger";

const record: DeliveryRecord = {
  id: "delivery", postId: "post", userId: "author", approvedRevision: "revision", text: "Approved copy", channel: "x",
  mode: "simulation", state: "scheduled", scheduledFor: "2026-09-22T10:00:00Z", version: 1, attempts: 0,
  createdAt: "2026-09-22T10:00:00Z", updatedAt: "2026-09-22T10:00:00Z",
  events: [{ state: "scheduled", at: "2026-09-22T10:00:00Z", attempt: 0 }],
};

describe("unwired Supabase delivery repository", () => {
  it("uses only the owner-scoped server RPC contract", async () => {
    const calls: unknown[] = [];
    const client: DeliveryRpcClient = { async rpc(name, args) {
      calls.push([name, args]);
      return { data: name === "marketing_delivery_get" ? record : true, error: null };
    } };
    const repository = createSupabaseDeliveryRepository(client);
    expect(await repository.get(record.id, record.userId)).toEqual(record);
    expect(await repository.insert(record)).toBe(true);
    expect(await repository.compareAndSwap(record, { ...record, version: 2 })).toBe(true);
    expect(calls).toEqual([
      ["marketing_delivery_get", { p_id: record.id, p_user_id: record.userId }],
      ["marketing_delivery_insert", { p_record: record }],
      ["marketing_delivery_cas", { p_id: record.id, p_user_id: record.userId, p_expected_version: 1, p_next: { ...record, version: 2 } }],
    ]);
  });
  it("preserves not found and conflict results", async () => {
    const repository = createSupabaseDeliveryRepository({ async rpc(name) { return { data: name.endsWith("get") ? null : false, error: null }; } });
    expect(await repository.get("missing", "author")).toBeNull();
    expect(await repository.insert(record)).toBe(false);
    expect(await repository.compareAndSwap(record, record)).toBe(false);
  });
  it("fails closed on RPC errors without leaking database or token details", async () => {
    const repository = createSupabaseDeliveryRepository({ async rpc() { return { data: null, error: { message: "private database/token details" } }; } });
    await expect(repository.get("delivery", "author")).rejects.toThrow("[campaign delivery] Could not read the protected delivery ledger.");
    await expect(repository.insert(record)).rejects.toThrow("[campaign delivery] Could not create the protected delivery record.");
    await expect(repository.compareAndSwap(record, record)).rejects.toThrow("[campaign delivery] Could not update the protected delivery record.");
  });
  it("rejects malformed/mismatched records and nonboolean mutation responses", async () => {
    for (const data of [42, {}, { ...record, userId: "another" }, { ...record, version: "one" }, { ...record, state: "fake" }]) {
      const repository = createSupabaseDeliveryRepository({ async rpc() { return { data, error: null }; } });
      await expect(repository.get(record.id, record.userId)).rejects.toThrow(/invalid/i);
      await expect(repository.insert(record)).rejects.toThrow(/invalid/i);
    }
  });
});
