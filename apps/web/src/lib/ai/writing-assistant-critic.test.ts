import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  keys: new Map<string, string>(), rows: new Map<string, Record<string, unknown>>(),
  events: [] as string[], reserve: vi.fn(), recordUsage: vi.fn(), openai: vi.fn(), anthropic: vi.fn(),
  insert: vi.fn(), update: vi.fn(), redisSet: vi.fn(), redisEval: vi.fn(),
}));
vi.mock("@/lib/workers/budget", () => ({ checkBudget: state.reserve }));
vi.mock("@/lib/usage/meter", () => ({ recordUsage: state.recordUsage }));
vi.mock("@/lib/env", () => ({ getRedisClientOptions: () => ({ host: "local-mock" }) }));
vi.mock("ioredis", () => ({ default: class {
  set = state.redisSet;
  eval = state.redisEval;
} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({
  insert: state.insert,
  update: state.update,
}) }) }));
vi.mock("./providers/openai", async original => ({
  ...await original<typeof import("./providers/openai")>(),
  callOpenAi: state.openai,
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: state.anthropic }; } }));

import { draftAdviceWithCritic } from "./writing-assistant-critic";

const input = { system: "Review faithfully", conversation: "Synthetic chapter: a paper boat.",
  requestId: "request-1", meter: { userId: "author", bookId: "book", pipeline: "assistant" as const } };
const receipt = { model: "openai-test", responseId: "response-1", inputTokens: 30,
  outputTokens: 10, cachedInputTokens: 3, reasoningTokens: 2 };
const reply = (issues: string[] = []) => ({ id: "anthropic-1", model: "anthropic-test", stop_reason: "end_turn",
  usage: { input_tokens: 35, output_tokens: 10, cache_creation_input_tokens: 2, cache_read_input_tokens: 4 },
  content: [{ type: "text", text: JSON.stringify({ issues }) }] });

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "mock-openai"); vi.stubEnv("ANTHROPIC_API_KEY", "mock-anthropic");
  state.keys.clear(); state.rows.clear(); state.events.length = 0;
  for (const mock of [state.reserve, state.recordUsage, state.openai, state.anthropic, state.insert,
    state.update, state.redisSet, state.redisEval]) mock.mockReset();
  state.redisSet.mockImplementation(async (key: string, owner: string, condition: string) => {
    expect(condition).toBe("NX");
    if (state.keys.has(key)) return null;
    state.keys.set(key, owner); return "OK";
  });
  state.redisEval.mockImplementation(async (_script, _count, key, owner) => {
    if (state.keys.get(key) !== owner) return 0;
    state.keys.delete(key); return 1;
  });
  state.insert.mockImplementation(async (row) => {
    if (state.rows.has(row.id)) return { error: { code: "23505" } };
    state.rows.set(row.id, structuredClone(row)); state.events.push("claim"); return { error: null };
  });
  state.update.mockImplementation((values) => {
    const filters: Record<string, unknown> = {};
    const query = { eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      select: () => query, maybeSingle: async () => {
        const row = state.rows.get(String(filters.id));
        if (!row || Object.entries(filters).some(([key, value]) => row[key] !== value)) return { data: null, error: null };
        Object.assign(row, structuredClone(values)); state.events.push("persist");
        return { data: { id: row.id }, error: null };
      } };
    return query;
  });
  state.reserve.mockImplementation(async () => { state.events.push("reserve"); });
  state.recordUsage.mockResolvedValue(undefined);
  state.openai.mockImplementation(async (args) => {
    state.events.push("openai"); await args.onUsage?.(receipt); return "Keep the paper boat.";
  });
  state.anthropic.mockImplementation(async () => { state.events.push("anthropic"); return reply(); });
});
afterEach(() => vi.unstubAllEnvs());

describe("advice paid-work boundary", () => {
  it("does not dispatch without an authenticated billing identity", async () => {
    await expect(draftAdviceWithCritic({ ...input, meter: undefined })).rejects.toThrow();
    expect(state.openai).not.toHaveBeenCalled();
  });

  it("reserves and persists each stage before dispatch, then durably records both actual receipts", async () => {
    await expect(draftAdviceWithCritic(input)).resolves.toMatchObject({ content: "Keep the paper boat." });
    expect(state.reserve).toHaveBeenCalledTimes(2);
    expect(state.events.slice(0, 4)).toEqual(["claim", "reserve", "persist", "openai"]);
    const secondCall = state.events.indexOf("anthropic");
    expect(state.events.slice(secondCall - 2, secondCall)).toEqual(["reserve", "persist"]);
    const row = [...state.rows.values()][0];
    expect(row.status).toBe("completed");
    expect(JSON.stringify(row.output)).toContain("anthropic-test");
    expect(JSON.stringify(row.output)).toContain("cacheCreationInputTokens");
    expect(JSON.stringify(row)).not.toContain(input.conversation);
    expect(state.keys.size).toBe(0);
  });

  it("stops at budget denial without starting another paid stage", async () => {
    state.reserve.mockRejectedValueOnce(new Error("budget exhausted"));
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    expect(state.openai).not.toHaveBeenCalled(); expect(state.anthropic).not.toHaveBeenCalled();
  });

  it("admits only one concurrent run and blocks a completed duplicate", async () => {
    const results = await Promise.allSettled([draftAdviceWithCritic(input), draftAdviceWithCritic(input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(state.openai).toHaveBeenCalledOnce();
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    expect(state.openai).toHaveBeenCalledOnce();
  });

  it("retains the no-TTL fence after an unknown outcome, including a fresh request ID", async () => {
    state.openai.mockRejectedValueOnce(new Error("timeout after paid dispatch"));
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    expect(state.keys.size).toBe(1);
    expect(state.redisSet.mock.calls[0]).toHaveLength(3);
    await expect(draftAdviceWithCritic({ ...input, requestId: "retry-new-id" })).rejects.toThrow();
    expect(state.openai).toHaveBeenCalledOnce(); expect(state.anthropic).not.toHaveBeenCalled();
    expect(JSON.stringify([...state.rows.values()][0].output)).toContain("unknown");
  });

  it("survives process-local state loss and deletion of the job row after unknown paid work", async () => {
    state.openai.mockRejectedValueOnce(new Error("connection lost"));
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    state.rows.clear();
    vi.resetModules();
    const restarted = await import("./writing-assistant-critic");
    await expect(restarted.draftAdviceWithCritic({ ...input, requestId: "new-after-restart" })).rejects.toThrow();
    expect(state.openai).toHaveBeenCalledOnce(); expect(state.keys.size).toBe(1);
  });

  it("does not dispatch when a persisted start loses its acknowledgement", async () => {
    const normal = state.update.getMockImplementation()!;
    state.update.mockImplementationOnce(values => {
      const query = normal(values);
      const write = query.maybeSingle;
      query.maybeSingle = async () => { await write(); throw new Error("DB ack lost"); };
      return query;
    });
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    expect(state.reserve).toHaveBeenCalledOnce(); expect(state.openai).not.toHaveBeenCalled();
    expect(state.keys.size).toBe(1);
  });

  it("retains unresolved state when receipt persistence fails after the provider was paid", async () => {
    const normal = state.update.getMockImplementation()!;
    state.update.mockImplementation(values => {
      const query = normal(values);
      const stages = values.output?.stages ?? [];
      if (stages.some((entry: { status: string }) => entry.status === "received")) {
        query.maybeSingle = async () => ({ data: null, error: { message: "local simulated failure" } });
      }
      return query;
    });
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    expect(state.openai).toHaveBeenCalledOnce(); expect(state.anthropic).not.toHaveBeenCalled();
    expect(state.recordUsage).not.toHaveBeenCalled(); expect(state.keys.size).toBe(1);
    expect([...state.rows.values()][0].status).toBe("processing");
  });

  it("does not dispatch on an uncertain fence acquisition acknowledgement", async () => {
    state.redisSet.mockImplementationOnce(async (key, owner) => { state.keys.set(key, owner); throw new Error("Redis ack lost"); });
    await expect(draftAdviceWithCritic(input)).rejects.toMatchObject({ name: "AdviceBudgetError" });
    expect(state.openai).not.toHaveBeenCalled(); expect(state.redisEval).not.toHaveBeenCalled();
    expect(state.keys.size).toBe(1);
  });

  it("reports admission uncertainty safely when the job insert acknowledgement is lost", async () => {
    state.insert.mockRejectedValueOnce(new Error("DB insert acknowledgement lost"));
    await expect(draftAdviceWithCritic(input)).rejects.toMatchObject({ name: "AdviceBudgetError" });
    expect(state.openai).not.toHaveBeenCalled(); expect(state.redisEval).not.toHaveBeenCalled();
    expect(state.keys.size).toBe(1);
  });

  it("holds the fence across a simulated crash after reservation, before the receipt", async () => {
    let rejectCall!: (error: Error) => void;
    state.openai.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectCall = reject; }));
    const interrupted = draftAdviceWithCritic(input).catch(error => error);
    await vi.waitFor(() => expect(state.openai).toHaveBeenCalledOnce());
    expect(state.reserve).toHaveBeenCalledOnce();
    expect(JSON.stringify([...state.rows.values()][0].output)).toContain('"status":"started"');
    vi.resetModules();
    const restarted = await import("./writing-assistant-critic");
    await expect(restarted.draftAdviceWithCritic({ ...input, requestId: "restart" })).rejects.toThrow();
    expect(state.openai).toHaveBeenCalledOnce();
    rejectCall(new Error("simulated crash")); await interrupted;
    expect(state.keys.size).toBe(1);
  });

  it("preserves known paid usage for invalid critic JSON without paying for a revision", async () => {
    state.anthropic.mockResolvedValueOnce({ ...reply(), content: [{ type: "text", text: "not json" }] });
    await expect(draftAdviceWithCritic(input)).resolves.toMatchObject({ content: "Keep the paper boat." });
    expect(state.openai).toHaveBeenCalledOnce(); expect(state.reserve).toHaveBeenCalledTimes(2);
    expect(state.keys.size).toBe(0);
    expect(JSON.stringify([...state.rows.values()][0].output)).toContain("anthropic-test");
  });

  it("reserves the actual escaped Unicode prompt and revised context for all three calls", async () => {
    state.anthropic.mockResolvedValueOnce(reply(["Use a precise quote"]));
    await draftAdviceWithCritic({ ...input, conversation: '雪\\\n"'.repeat(400) });
    expect(state.reserve).toHaveBeenCalledTimes(3);
    expect(new Set(state.reserve.mock.calls.map(([call]) => call.jobId)).size).toBe(3);
    for (let index = 0; index < 2; index++) {
      const request = state.openai.mock.calls[index][0];
      const reservation = state.reserve.mock.calls[index === 0 ? 0 : 2][0];
      expect(reservation.pipeline).toBe("agent");
      expect(reservation.units).toBeGreaterThan(Buffer.byteLength(JSON.stringify({ instructions: request.system, input: request.user }), "utf8") + request.maxTokens);
    }
    const anthropicBody = state.anthropic.mock.calls[0][0];
    expect(state.reserve.mock.calls[1][0].units).toBe(Buffer.byteLength(JSON.stringify(anthropicBody), "utf8") + 4096 + 800);
  });

  it("retains unknown state for malformed Anthropic usage and never revises", async () => {
    state.anthropic.mockResolvedValueOnce({ ...reply(["Revise"]), usage: { input_tokens: -1, output_tokens: 1 } });
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    expect(state.openai).toHaveBeenCalledOnce(); expect(state.keys.size).toBe(1);
  });

  it("stops after cancellation during a paid call, retaining the unresolved reservation", async () => {
    const controller = new AbortController();
    state.openai.mockImplementationOnce(async (args) => {
      expect(args.signal).toBe(controller.signal); controller.abort(); throw new Error("AbortError");
    });
    await expect(draftAdviceWithCritic({ ...input, signal: controller.signal })).rejects.toThrow();
    expect(state.anthropic).not.toHaveBeenCalled(); expect(state.keys.size).toBe(1);
  });

  it("does not disguise a critic timeout as a successful draft", async () => {
    state.anthropic.mockRejectedValueOnce(new Error("unknown critic outcome"));
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    expect(state.keys.size).toBe(1); expect(state.openai).toHaveBeenCalledOnce();
  });

  it("requires a valid receipt even if a model supplied usable text", async () => {
    state.openai.mockImplementationOnce(async () => "A usable reply without any usage");
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    expect(state.anthropic).not.toHaveBeenCalled(); expect(state.keys.size).toBe(1);
  });

  it("blocks revision when its additional reservation fails", async () => {
    state.anthropic.mockResolvedValueOnce(reply(["Be specific"]));
    state.reserve.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("budget"));
    await expect(draftAdviceWithCritic(input)).rejects.toThrow();
    expect(state.openai).toHaveBeenCalledOnce();
  });

  it("does no work for a request aborted before admission", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(draftAdviceWithCritic({ ...input, signal: controller.signal })).rejects.toThrow();
    expect(state.openai).not.toHaveBeenCalled(); expect(state.insert).not.toHaveBeenCalled();
  });
});
