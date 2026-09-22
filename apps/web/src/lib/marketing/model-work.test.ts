import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ reserve: vi.fn(), release: vi.fn(), validate: vi.fn(), insert: vi.fn(), update: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/workers/budget", async original => ({ ...await original<object>(), checkBudget: m.reserve, releaseBudget: m.release, validateJobCost: m.validate }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert: m.insert, update: m.update }) }) }));
import { JobCostExceededError } from "@/lib/workers/budget";
import { createMarketingWork } from "./model-work";
const usage = { provider: "openai" as const, model: "actual-model", responseId: "response", inputTokens: 15, outputTokens: 7, cachedInputTokens: 5, reasoningTokens: 3 };
beforeEach(() => {
  vi.clearAllMocks(); m.reserve.mockResolvedValue({}); m.release.mockResolvedValue(undefined); m.validate.mockReturnValue({});
  m.insert.mockResolvedValue({ error: null });
  const q = { eq: () => q, select: () => q, maybeSingle: m.save };
  m.update.mockReturnValue(q); m.save.mockResolvedValue({ data: { id: "receipt" }, error: null });
});
it("reserves each step before provider and applies the cumulative job cap", async () => {
  const work = createMarketingWork("author"); const order: string[] = [];
  m.reserve.mockImplementation(async () => { order.push("reserve"); });
  for (const stage of ["draft", "critic", "revision"] as const) {
    await work.run({ stage, provider: "openai", units: 100, call: async receipt => { order.push(stage); await receipt(usage); return "copy"; } });
  }
  expect(order).toEqual(["reserve", "draft", "reserve", "critic", "reserve", "revision"]);
  expect(m.validate.mock.calls.map(call => call[0].jobSize)).toEqual([100, 200, 300]);
  expect(m.insert).toHaveBeenCalledTimes(3);
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ output: { status: "received", usage } }));
  expect(m.release).not.toHaveBeenCalled();
});
it("records unknown and retains reservation after an ambiguous provider failure", async () => {
  const work = createMarketingWork("author");
  await expect(work.run({ stage: "draft", provider: "openai", units: 100, call: async () => { throw new Error("timeout"); } })).rejects.toThrow("timeout");
  expect(m.update).toHaveBeenLastCalledWith(expect.objectContaining({ output: { status: "unknown", usage: null } }));
  expect(m.release).not.toHaveBeenCalled();
});
it("does not call a provider if budget or receipt storage is unavailable", async () => {
  const call = vi.fn(); m.reserve.mockRejectedValueOnce(new Error("redis unavailable"));
  await expect(createMarketingWork("author").run({ stage: "draft", provider: "openai", units: 100, call })).rejects.toMatchObject({ code: "MARKETING_BUDGET_UNAVAILABLE" });
  m.insert.mockResolvedValueOnce({ error: {} });
  await expect(createMarketingWork("author").run({ stage: "draft", provider: "openai", units: 100, call })).rejects.toMatchObject({ code: "MARKETING_USAGE_UNAVAILABLE" });
  expect(call).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalledOnce();
});
it("aborts after a paid usage write fails and never refunds the attempt", async () => {
  m.save.mockResolvedValue({ error: {} });
  await expect(createMarketingWork("author").run({ stage: "draft", provider: "openai", units: 100, call: async receipt => { await receipt(usage); return "ok"; } })).rejects.toMatchObject({ code: "MARKETING_USAGE_UNAVAILABLE" });
  expect(m.release).not.toHaveBeenCalled();
});
it("persists usage even when the caller later rejects model output", async () => {
  await expect(createMarketingWork("author").run({ stage: "critic", provider: "openai", units: 100, call: async receipt => { await receipt(usage); throw new Error("invalid JSON"); } })).rejects.toThrow("invalid JSON");
  expect(m.update).toHaveBeenLastCalledWith(expect.objectContaining({ output: { status: "received", usage } }));
});

it("retains the logical cap after a failed paid call and refuses a fallback over it", async () => {
  const work = createMarketingWork("author");
  await expect(work.run({ stage: "draft", provider: "openai", units: 100, call: async () => { throw new Error("timeout"); } })).rejects.toThrow();
  m.validate.mockImplementationOnce(input => { throw new JobCostExceededError({ userId: "author", pipeline: "marketing", jobSize: input.jobSize, cap: 150, unit: "units", jobId: null }); });
  const fallback = vi.fn();
  await expect(work.run({ stage: "fallback", provider: "anthropic", units: 100, call: fallback })).rejects.toMatchObject({ code: "MARKETING_BUDGET_EXCEEDED" });
  expect(fallback).not.toHaveBeenCalled(); expect(m.reserve).toHaveBeenCalledOnce();
});
it("treats missing usage as unknown instead of inventing zero cost", async () => {
  await expect(createMarketingWork("author").run({ stage: "draft", provider: "openai", units: 100, call: async () => "valid text without receipt" })).rejects.toThrow(/usage receipt missing/i);
  expect(m.update).toHaveBeenLastCalledWith(expect.objectContaining({ output: { status: "unknown", usage: null } }));
  expect(m.release).not.toHaveBeenCalled();
});
