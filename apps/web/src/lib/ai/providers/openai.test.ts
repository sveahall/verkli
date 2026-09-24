import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiError, callOpenAi, isOpenAiConfigured } from "./openai";

const recordUsageMock = vi.fn();
vi.mock("@/lib/usage/meter", () => ({
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
}));

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload });
const messagePayload = (text: string) => ({
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text }] }],
});

describe("isOpenAiConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is false for missing or blank keys, so callers skip the critic", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(isOpenAiConfigured()).toBe(false);
    vi.stubEnv("OPENAI_API_KEY", "   ");
    expect(isOpenAiConfigured()).toBe(false);
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(isOpenAiConfigured()).toBe(true);
  });
});

describe("callOpenAi", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_MODEL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const body = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

  it("does not dispatch a request that was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockResolvedValue(ok(messagePayload("unused")));
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 10, signal: controller.signal })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels an in-flight request when the caller aborts", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementation(async (_url, options) => {
      requestSignal = options.signal;
      controller.abort();
      requestSignal?.throwIfAborted();
      return ok(messagePayload("unused"));
    });
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 10, signal: controller.signal })).rejects.toThrow();
    expect(requestSignal?.aborted).toBe(true);
  });


  it("records billed tokens before rejecting an incomplete reply", async () => {
    const onUsage = vi.fn();
    fetchMock.mockResolvedValue(ok({ status: "incomplete", model: "actual-model", id: "resp-test",
      usage: { input_tokens: 23, output_tokens: 17, input_tokens_details: { cached_tokens: 5 }, output_tokens_details: { reasoning_tokens: 9 } } }));
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 100, onUsage })).rejects.toThrow("incomplete");
    expect(onUsage).toHaveBeenCalledWith({ model: "actual-model", responseId: "resp-test", inputTokens: 23, outputTokens: 17, cachedInputTokens: 5, reasoningTokens: 9 });
  });

  it.each([undefined, { input_tokens: -1, output_tokens: 2 }, { input_tokens: 1.5, output_tokens: 2 }])("rejects missing or invalid usage when a receipt is required", async (usage) => {
    fetchMock.mockResolvedValue(ok({ ...messagePayload("hello"), model: "actual-model", usage }));
    const onUsage = vi.fn();
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 100, onUsage })).rejects.toThrow("usage");
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("posts the Responses shape, not the chat-completions shape", async () => {
    fetchMock.mockResolvedValue(ok(messagePayload("hello")));
    expect(await callOpenAi({ system: "be terse", user: "hi", maxTokens: 100 })).toBe("hello");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    const sent = body();
    expect(sent.instructions).toBe("be terse");
    expect(sent.input).toBe("hi");
    expect(sent.max_output_tokens).toBe(100);
    // The chat-completions spellings must not reappear.
    expect(sent.messages).toBeUndefined();
    expect(sent.max_tokens).toBeUndefined();
    expect(sent.max_completion_tokens).toBeUndefined();
    expect(sent.response_format).toBeUndefined();
  });

  it("defaults to gpt-6-astra and honours OPENAI_MODEL", async () => {
    fetchMock.mockResolvedValue(ok(messagePayload("x")));
    await callOpenAi({ system: "s", user: "u", maxTokens: 10 });
    expect(body().model).toBe("gpt-6-astra");

    fetchMock.mockClear();
    vi.stubEnv("OPENAI_MODEL", "gpt-6-mini");
    await callOpenAi({ system: "s", user: "u", maxTokens: 10 });
    expect(body().model).toBe("gpt-6-mini");
  });

  it("puts a schema under text.format with strict on, and omits it otherwise", async () => {
    fetchMock.mockResolvedValue(ok(messagePayload("{}")));
    await callOpenAi({
      system: "s",
      user: "u",
      maxTokens: 10,
      schema: { name: "verdicts", schema: { type: "object" } },
    });
    expect(body().text.format).toEqual({
      type: "json_schema",
      name: "verdicts",
      strict: true,
      schema: { type: "object" },
    });

    fetchMock.mockClear();
    await callOpenAi({ system: "s", user: "u", maxTokens: 10 });
    expect(body().text).toBeUndefined();
  });

  it("rebuilds the text from the output array, which raw JSON has instead of output_text", async () => {
    fetchMock.mockResolvedValue(
      ok({
        status: "completed",
        output: [
          { type: "reasoning", content: [] },
          { type: "message", content: [{ type: "output_text", text: "part one" }] },
          { type: "message", content: [{ type: "output_text", text: "part two" }] },
        ],
      })
    );
    expect(await callOpenAi({ system: "s", user: "u", maxTokens: 10 })).toBe("part one\npart two");
  });

  it("treats an incomplete reply as a failure rather than returning a truncated one", async () => {
    fetchMock.mockResolvedValue(
      ok({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })
    );
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 10 })).rejects.toThrow(
      /max_output_tokens/
    );
  });

  it("reports the status code without echoing the body, which can contain manuscript text", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Once upon a time in the manuscript" } }),
    });
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 10 })).rejects.toThrow(
      /status 400/
    );
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 10 })).rejects.not.toThrow(
      /manuscript/
    );
  });

  it("rejects an empty reply and a missing key", async () => {
    fetchMock.mockResolvedValue(ok({ status: "completed", output: [] }));
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 10 })).rejects.toThrow(OpenAiError);

    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 10 })).rejects.toThrow(
      /OPENAI_API_KEY/
    );
  });
});

describe("callOpenAi metering", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_MODEL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(["incomplete", "completed"])("meters paid work before rejecting a %s reply with no usable content", async (status) => {
    fetchMock.mockResolvedValue(ok({ status, model: "actual-model", usage: { input_tokens: 23, output_tokens: 17 } }));
    await expect(callOpenAi({ system: "s", user: "u", maxTokens: 100,
      meter: { userId: "user-1", pipeline: "assistant" } })).rejects.toThrow();
    expect(recordUsageMock).toHaveBeenCalledExactlyOnceWith(
      { userId: "user-1", pipeline: "assistant" },
      [expect.objectContaining({ model: "actual-model", quantity: 23, unit: "input_tokens" }),
        expect.objectContaining({ model: "actual-model", quantity: 17, unit: "output_tokens" })],
    );
  });

  it("records input and output tokens as two separate events", async () => {
    fetchMock.mockResolvedValue(
      ok({ ...messagePayload("hi"), usage: { input_tokens: 1200, output_tokens: 340 } })
    );
    await callOpenAi({
      system: "s",
      user: "u",
      maxTokens: 100,
      meter: { userId: "user-1", pipeline: "editorial" },
    });
    const [ctx, events] = recordUsageMock.mock.calls[0];
    expect(ctx).toMatchObject({ userId: "user-1", pipeline: "editorial" });
    expect(events).toEqual([
      { kind: "ai_call", provider: "openai", model: "gpt-6-astra", quantity: 1200, unit: "input_tokens" },
      { kind: "ai_call", provider: "openai", model: "gpt-6-astra", quantity: 340, unit: "output_tokens" },
    ]);
  });

  it("records nothing when no meter context is supplied", async () => {
    fetchMock.mockResolvedValue(
      ok({ ...messagePayload("hi"), usage: { input_tokens: 5, output_tokens: 5 } })
    );
    await callOpenAi({ system: "s", user: "u", maxTokens: 100 });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("flags a reply carrying no usage block instead of recording silent zeros", async () => {
    fetchMock.mockResolvedValue(ok(messagePayload("hi")));
    await callOpenAi({
      system: "s",
      user: "u",
      maxTokens: 100,
      meter: { userId: "user-1", pipeline: "editorial" },
    });
    const [, events] = recordUsageMock.mock.calls[0];
    expect(events[0].meta).toMatchObject({ usage_missing: true });
  });

  it("bills the configured model, not the default, when one is set", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-6-astra-mini");
    fetchMock.mockResolvedValue(
      ok({ ...messagePayload("hi"), usage: { input_tokens: 10, output_tokens: 2 } })
    );
    await callOpenAi({
      system: "s",
      user: "u",
      maxTokens: 100,
      meter: { userId: "user-1", pipeline: "assistant" },
    });
    const [, events] = recordUsageMock.mock.calls[0];
    expect(events[0].model).toBe("gpt-6-astra-mini");
  });
});
