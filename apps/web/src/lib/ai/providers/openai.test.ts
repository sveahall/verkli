import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiError, callOpenAi, isOpenAiConfigured } from "./openai";

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
