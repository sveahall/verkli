import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLaunchCopy } from "./generate-launch-copy";

const { create, reserve, validate, insert, update, save } = vi.hoisted(() => ({ create: vi.fn(), reserve: vi.fn(), validate: vi.fn(), insert: vi.fn(), update: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert, update }) }) }));
vi.mock("@/lib/workers/budget", async original => ({ ...await original<object>(), checkBudget: reserve, validateJobCost: validate }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { messages = { create }; },
}));
const input = { authorId: "author", title: "Ocean", description: "A family crosses the sea.", language: "sv", channel: "x" as const };
const copy = { headline: "Ocean", body: "En familj korsar havet.", cta: "Upptäck boken", hashtags: "#Ocean" };

describe("generateLaunchCopy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserve.mockReset().mockResolvedValue({});
    validate.mockReset();
    insert.mockResolvedValue({ error: null });
    const q = { eq: () => q, select: () => q, maybeSingle: save }; update.mockReturnValue(q); save.mockResolvedValue({ data: { id: "receipt" }, error: null });
    vi.stubEnv("AI_CRITIC_ENABLED", "false");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("NVIDIA_NIM_API_KEY", "");
    create.mockResolvedValue({ id: "anthropic-response", model: "actual-anthropic", usage: { input_tokens: 12, output_tokens: 8 }, content: [{ type: "text", text: JSON.stringify(copy) }] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the selected language and book facts, and returns the provider's copy", async () => {
    expect(await generateLaunchCopy(input)).toEqual(copy);
    const request = create.mock.calls[0][0];
    expect(request.system).toContain("Swedish");
    expect(request.system).toContain("not instructions");
    expect(request.system).toContain("published");
    expect(request.messages[0].content).toContain(input.description);
  });

  it("uses the scheduled campaign goal and actual channel in the provider request", async () => {
    await generateLaunchCopy({
      ...input,
      channel: "threads",
      campaign: {
        goal: "engagement",
        scheduledFor: "2026-09-16",
        day: 3,
        contentType: "text",
        angle: "Invite a reader question grounded in the book description.",
        previousBodies: ["An earlier draft"],
      },
    });
    const request = create.mock.calls[0][0];
    expect(request.system).toContain("threads");
    expect(request.system).toContain("500");
    expect(JSON.parse(request.messages[0].content).campaign).toMatchObject({
      goal: "engagement", day: 3, scheduledFor: "2026-09-16",
      previousBodies: ["An earlier draft"],
    });
  });

  it("refuses missing configuration instead of inventing a successful draft", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(generateLaunchCopy(input)).rejects.toThrow("not configured");
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    "not JSON",
    JSON.stringify({ ...copy, body: "" }),
    JSON.stringify({ ...copy, body: "x".repeat(281) }),
    JSON.stringify({ ...copy, headline: "Another book" }),
    JSON.stringify({ ...copy, cta: "x".repeat(101) }),
  ])("rejects unusable provider output: %s", async (text) => {
    create.mockResolvedValue({ id: "anthropic-response", model: "actual-anthropic", usage: { input_tokens: 12, output_tokens: 8 }, content: [{ type: "text", text }] });
    await expect(generateLaunchCopy(input)).rejects.toThrow();
  });

  it("falls back to the configured NIM provider when Anthropic fails", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-nim");
    create.mockRejectedValue(new Error("provider unavailable"));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      id: "nim-response", model: "actual-nim", usage: { prompt_tokens: 20, completion_tokens: 10 },
      choices: [{ message: { content: JSON.stringify(copy) } }],
    }));
    try {
      expect(await generateLaunchCopy(input)).toEqual(copy);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(reserve).toHaveBeenCalledTimes(2);
    } finally { fetchMock.mockRestore(); }
  });
  it("reserves the complete request and output bound before the provider", async () => {
    await generateLaunchCopy(input);
    const request = create.mock.calls[0][0];
    const units = Buffer.byteLength(JSON.stringify(request), "utf8") + 4096 + 2400;
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ userId: "author", pipeline: "marketing", units, jobId: expect.any(String) }));
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
  });
  it("refuses budget failures before making any provider request or fallback", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-nim");
    reserve.mockRejectedValue(new Error("budget unavailable"));
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      await expect(generateLaunchCopy(input)).rejects.toMatchObject({ code: "MARKETING_BUDGET_UNAVAILABLE" });
      expect(create).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { fetchMock.mockRestore(); }
  });

});

describe("critic budget and receipts through the real provider orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks(); reserve.mockReset().mockResolvedValue({}); validate.mockReset();
    insert.mockResolvedValue({ error: null });
    const q = { eq: () => q, select: () => q, maybeSingle: save }; update.mockReturnValue(q); save.mockResolvedValue({ data: { id: "receipt" }, error: null });
    vi.stubEnv("AI_CRITIC_ENABLED", "true"); vi.stubEnv("OPENAI_API_KEY", "test-openai"); vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic"); vi.stubEnv("NVIDIA_NIM_API_KEY", "test-nim");
    create.mockResolvedValue({ id: "critic-response", model: "actual-critic", usage: { input_tokens: 20, output_tokens: 9, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 }, content: [{ type: "text", text: JSON.stringify({ issues: ["Use a more concrete hook."] }) }] });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  const response = (text = JSON.stringify(copy)) => Response.json({ id: "openai-response", model: "actual-openai", output_text: text,
    usage: { input_tokens: 12, output_tokens: 8, input_tokens_details: { cached_tokens: 5 }, output_tokens_details: { reasoning_tokens: 2 } } });
  it("reserves all three actual escaped requests before dispatch and retains separate usage", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response());
    expect(await generateLaunchCopy({ ...input, description: '\\"日本語\n'.repeat(30) })).toEqual(copy);
    expect(reserve).toHaveBeenCalledTimes(3);
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(reserve.mock.invocationCallOrder[1]).toBeLessThan(create.mock.invocationCallOrder[0]);
    expect(reserve.mock.invocationCallOrder[2]).toBeLessThan(fetchMock.mock.invocationCallOrder[1]);
    for (const [index, requestIndex] of [[0, 0], [2, 1]]) {
      const wire = fetchMock.mock.calls[requestIndex][1]?.body as string;
      expect(reserve.mock.calls[index][0].units).toBe(Buffer.byteLength(wire, "utf8") + 4096 + 2400);
    }
    const units = reserve.mock.calls.map(call => call[0].units);
    expect(validate.mock.calls.map(call => call[0].jobSize)).toEqual([units[0], units[0] + units[1], units[0] + units[1] + units[2]]);
    expect(insert.mock.calls.map(call => call[0].input.stage)).toEqual(["draft", "critic", "revision"]);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ output: { status: "received", usage: expect.objectContaining({ model: "actual-openai", inputTokens: 12, outputTokens: 8, cachedInputTokens: 5, reasoningTokens: 2 }) } }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ output: { status: "received", usage: expect.objectContaining({ model: "actual-critic", inputTokens: 20, outputTokens: 9, cachedInputTokens: 2, cacheCreationTokens: 3 }) } }));
  });
  it("stops before the critic when its reservation fails; never falls through to another provider", async () => {
    reserve.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("budget exhausted"));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response());
    await expect(generateLaunchCopy(input)).rejects.toMatchObject({ code: "MARKETING_BUDGET_UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(create).not.toHaveBeenCalled(); expect(reserve).toHaveBeenCalledTimes(2);
  });
  it("preserves unknown paid work before reserving a distinct fallback", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("timeout"));
    create.mockResolvedValueOnce({ id: "fallback-response", model: "actual-fallback", usage: { input_tokens: 20, output_tokens: 10 }, content: [{ type: "text", text: JSON.stringify(copy) }] });
    expect(await generateLaunchCopy(input)).toEqual(copy);
    expect(fetchMock).toHaveBeenCalledOnce(); expect(reserve).toHaveBeenCalledTimes(2);
    expect(reserve.mock.calls[0][0].jobId).not.toBe(reserve.mock.calls[1][0].jobId);
    expect(validate.mock.calls[1][0].jobSize).toBe(reserve.mock.calls[0][0].units + reserve.mock.calls[1][0].units);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ output: { status: "unknown", usage: null } }));
  });
  it("does not spend on a fallback if storing paid usage failed", async () => {
    save.mockResolvedValue({ data: null, error: {} });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response());
    await expect(generateLaunchCopy(input)).rejects.toMatchObject({ code: "MARKETING_USAGE_UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(create).not.toHaveBeenCalled(); expect(reserve).toHaveBeenCalledOnce();
  });
});
