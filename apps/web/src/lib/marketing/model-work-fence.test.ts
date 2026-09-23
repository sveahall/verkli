import { expect, it, vi } from "vitest";
import { acquireMarketingModelFence } from "./model-work-fence";

function redis() {
  const values = new Map<string, string>();
  return { values, set: vi.fn(async (key: string, value: string, _nx: "NX") => {
    if (values.has(key)) return null;
    values.set(key, value); return "OK";
  }), eval: vi.fn(async (_script: string, _count: number, key: string, owner: string) => {
    if (values.get(key) !== owner) return 0;
    values.delete(key); return 1;
  }) };
}
it("admits one concurrent owner and retains the fence until explicit owner release", async () => {
  const client = redis();
  const results = await Promise.allSettled([acquireMarketingModelFence(client, "author", "job"), acquireMarketingModelFence(client, "author", "job")]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(client.set.mock.calls.every(call => call.length === 3 && call[2] === "NX")).toBe(true);
  await expect(acquireMarketingModelFence(client, "author", "job")).rejects.toThrow();
  const winner = results.find(result => result.status === "fulfilled");
  if (winner?.status !== "fulfilled") throw new Error("No owner");
  await winner.value.release();
  await expect(acquireMarketingModelFence(client, "author", "job")).resolves.toBeDefined();
});
it("does not let a stale owner clear a different owner's reservation", async () => {
  const client = redis();
  const old = await acquireMarketingModelFence(client, "author", "job");
  const key = [...client.values.keys()][0];
  client.values.set(key, "another-owner");
  await expect(old.release()).rejects.toThrow();
  expect(client.values.get(key)).toBe("another-owner");
});
it("never deletes a fence after an uncertain acquisition acknowledgement", async () => {
  const client = redis();
  client.set.mockRejectedValueOnce(new Error("ack lost"));
  await expect(acquireMarketingModelFence(client, "author", "job")).rejects.toThrow();
  expect(client.eval).not.toHaveBeenCalled();
});
