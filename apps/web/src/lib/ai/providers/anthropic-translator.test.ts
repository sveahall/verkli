import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const recordUsageMock = vi.fn();
vi.mock("@/lib/usage/meter", () => ({
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
}));

const messagesCreateMock = vi.fn();
const anthropicCtorArgs: unknown[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(args: unknown) {
      anthropicCtorArgs.push(args);
    }
    messages = { create: messagesCreateMock };
  },
}));

const { AnthropicTranslator } = await import("./anthropic-translator");

const MODEL_ID = "claude-sonnet-5";

describe("AnthropicTranslator metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    anthropicCtorArgs.length = 0;
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    messagesCreateMock.mockResolvedValue({
      content: [{ type: "text", text: '["hej"]' }],
      usage: { input_tokens: 900, output_tokens: 120 },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("records input and output tokens against the translation pipeline", async () => {
    await new AnthropicTranslator().translateBatch(["hi"], "en", "sv", {
      userId: "user-1",
      pipeline: "translation",
      bookId: "book-1",
    });
    const [ctx, events] = recordUsageMock.mock.calls[0];
    expect(ctx).toMatchObject({ userId: "user-1", pipeline: "translation", bookId: "book-1" });
    expect(events).toEqual([
      { kind: "ai_call", provider: "anthropic", model: MODEL_ID, quantity: 900, unit: "input_tokens" },
      { kind: "ai_call", provider: "anthropic", model: MODEL_ID, quantity: 120, unit: "output_tokens" },
    ]);
  });

  it("records nothing when no meter context is supplied", async () => {
    await new AnthropicTranslator().translateBatch(["hi"], "en", "sv");
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("meters every chunk, not just the first, so long chapters are billed in full", async () => {
    // BATCH_SIZE is 25, so 30 paragraphs must issue two requests.
    const texts = Array.from({ length: 30 }, (_, i) => `p${i}`);
    messagesCreateMock.mockImplementation(async (args: { messages: { content: string }[] }) => {
      const count = JSON.parse(args.messages[0].content.slice(args.messages[0].content.indexOf("["))).length;
      return {
        content: [{ type: "text", text: JSON.stringify(Array.from({ length: count }, () => "x")) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    });
    await new AnthropicTranslator().translateBatch(texts, "en", "sv", {
      userId: "user-1",
      pipeline: "translation",
    });
    expect(recordUsageMock).toHaveBeenCalledTimes(2);
  });

  it("passes the meter through the single-text translate() path too", async () => {
    await new AnthropicTranslator().translate({
      text: "hi",
      sourceLanguage: "en",
      targetLanguage: "sv",
      meter: { userId: "user-2", pipeline: "translation" },
    });
    const [ctx] = recordUsageMock.mock.calls[0];
    expect(ctx.userId).toBe("user-2");
  });

  it("does not let the SDK retry a chunk the worker will retry itself", async () => {
    await new AnthropicTranslator().translateBatch(["hi"], "en", "sv");
    expect(anthropicCtorArgs[0]).toMatchObject({ maxRetries: 0 });
  });
});
