import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { localDeliveryAction } from "./local-delivery-store";

let directory: string;
afterEach(async () => { vi.unstubAllEnvs(); if (directory) await rm(directory, { recursive: true, force: true }); });
async function setup() {
  vi.stubEnv("NODE_ENV", "test");
  directory = await mkdtemp(join(tmpdir(), "campaign-ledger-test-"));
  const session = "11111111-1111-4111-8111-111111111111";
  return (body: Record<string, unknown> = {}) => localDeliveryAction(session, body, directory);
}
it("persists approval, schedule, failure, retry and one receipt across independent reads", async () => {
  const act = await setup();
  let view = await act();
  view = await act({ action: "approve", expectedUpdatedAt: view.post.updatedAt, caption: "A story worth staying up for.", hashtags: "#NewBook" });
  view = await act({ action: "schedule", expectedUpdatedAt: view.post.updatedAt, scheduledFor: new Date().toISOString() });
  view = await act({ action: "consume", outcome: "failure" });
  expect(view.deliveries[0].state).toBe("failed");
  view = await act({ action: "retry", expectedUpdatedAt: view.post.updatedAt });
  view = await act({ action: "consume", outcome: "success" });
  expect(view.deliveries[0].state).toBe("simulated");
  expect((await act({ action: "consume", outcome: "success" })).deliveries[0].attempts).toBe(2);
  expect((await act()).deliveries[0].events.length).toBeGreaterThan(3);
});
it("rejects forged/stale approval and edits after schedule; cancel preserves history", async () => {
  const act = await setup(); const first = await act();
  await expect(act({ action: "schedule", expectedUpdatedAt: first.post.updatedAt, scheduledFor: new Date().toISOString(), metadata: { delivery: { state: "published" } } })).rejects.toThrow();
  let view = await act({ action: "approve", expectedUpdatedAt: first.post.updatedAt, caption: "Approved copy", hashtags: "" });
  await expect(act({ action: "approve", expectedUpdatedAt: first.post.updatedAt, caption: "Stale copy" })).rejects.toThrow(/changed/i);
  view = await act({ action: "schedule", expectedUpdatedAt: view.post.updatedAt, scheduledFor: new Date().toISOString() });
  await expect(act({ action: "edit", expectedUpdatedAt: view.post.updatedAt, caption: "Different" })).rejects.toThrow();
  view = await act({ action: "cancel", expectedUpdatedAt: view.post.updatedAt });
  expect(view.deliveries[0].state).toBe("cancelled");
  expect((await act()).deliveries[0].events.some(event => event.state === "cancelled")).toBe(true);
});
it("uses the latest delivery for the same post without reordering its history", async () => {
  const act = await setup(); let view = await act();
  view = await act({ action: "approve", expectedUpdatedAt: view.post.updatedAt, caption: "First copy", hashtags: "" });
  view = await act({ action: "schedule", expectedUpdatedAt: view.post.updatedAt, scheduledFor: new Date().toISOString() });
  const firstId = view.deliveries[0].id;
  view = await act({ action: "cancel", expectedUpdatedAt: view.post.updatedAt });
  view = await act({ action: "approve", expectedUpdatedAt: view.post.updatedAt, caption: "Revised copy", hashtags: "" });
  view = await act({ action: "schedule", expectedUpdatedAt: view.post.updatedAt, scheduledFor: new Date().toISOString() });
  const secondId = view.deliveries[1].id;
  expect(secondId).not.toBe(firstId);
  expect(view.post.metadata).toMatchObject({ delivery: { jobId: secondId, state: "scheduled" } });
  view = await act({ action: "consume", outcome: "failure" });
  expect(view.deliveries.map(delivery => [delivery.id, delivery.state])).toEqual([[firstId, "cancelled"], [secondId, "failed"]]);
  expect((await act()).deliveries.map(delivery => delivery.id)).toEqual([firstId, secondId]);
  expect(view.post.metadata).toMatchObject({ delivery: { jobId: secondId, state: "failed" } });
});
it("does not retry or cancel an unknown transport outcome", async () => {
  const act = await setup(); let view = await act();
  view = await act({ action: "approve", expectedUpdatedAt: view.post.updatedAt, caption: "Safe fixture", hashtags: "" });
  view = await act({ action: "schedule", expectedUpdatedAt: view.post.updatedAt, scheduledFor: new Date().toISOString() });
  view = await act({ action: "consume", outcome: "uncertain" });
  expect(view.deliveries[0].state).toBe("uncertain");
  await expect(act({ action: "retry", expectedUpdatedAt: view.post.updatedAt })).rejects.toThrow();
  await expect(act({ action: "cancel", expectedUpdatedAt: view.post.updatedAt })).rejects.toThrow();
});
it("isolates sessions and rejects production before touching storage", async () => {
  const act = await setup(); const first = await act();
  expect((await localDeliveryAction("22222222-2222-4222-8222-222222222222", {}, directory)).post.id).not.toBe(first.post.id);
  await expect(localDeliveryAction("../../outside", {}, directory)).rejects.toThrow();
  vi.stubEnv("NODE_ENV", "production");
  await expect(act()).rejects.toThrow(/local/i);
});
it("serializes concurrent stale writes and retains exactly one approval", async () => {
  const act = await setup(); const first = await act();
  const results = await Promise.allSettled([
    act({ action: "approve", expectedUpdatedAt: first.post.updatedAt, caption: "First", hashtags: "" }),
    act({ action: "approve", expectedUpdatedAt: first.post.updatedAt, caption: "Second", hashtags: "" }),
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect((await act()).post.status).toBe("ready");
});
