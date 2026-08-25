import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateWritingAssistantReply,
  WritingAssistantError,
} from "./writing-assistant";

// The Anthropic client is constructed inside the module, so the SDK's default
// export is mocked at the class level and the shared spy is re-pointed per test.
const anthropicCreate = vi.fn();
const anthropicCtor = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: (...args: unknown[]) => anthropicCreate(...args) };
    constructor(opts: unknown) {
      anthropicCtor(opts);
    }
    static APIConnectionTimeoutError = class extends Error {};
    static AuthenticationError = class extends Error {};
  }
  return { default: MockAnthropic };
});

const INPUT = {
  message: "Tighten this paragraph.",
  selectedText: "The rain fell down from the sky above.",
  bookTitle: "Regnet",
};

function anthropicReply(text: string) {
  return {
    stop_reason: "end_turn",
    model: "claude-sonnet-5",
    content: [{ type: "text", text }],
    usage: { input_tokens: 120, output_tokens: 40 },
  };
}

function nimReply(text: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 90, completion_tokens: 30, total_tokens: 120 },
    }),
  } as unknown as Response;
}

describe("generateWritingAssistantReply", () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    anthropicCtor.mockReset();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.NVIDIA_NIM_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws PROVIDER_UNAVAILABLE when no provider key is set", async () => {
    await expect(generateWritingAssistantReply(INPUT)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("prefers Anthropic when its key is present", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.NVIDIA_NIM_API_KEY = "nim-test";
    anthropicCreate.mockResolvedValue(anthropicReply("Cut 'down from the sky'."));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await generateWritingAssistantReply(INPUT);

    expect(result.provider).toBe("anthropic");
    expect(result.content).toBe("Cut 'down from the sky'.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never sends temperature — Sonnet 5 rejects sampling params with a 400", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    anthropicCreate.mockResolvedValue(anthropicReply("Fine."));

    await generateWritingAssistantReply(INPUT);

    const body = anthropicCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("top_k");
  });

  it("falls back to NVIDIA NIM when Anthropic fails and a NIM key exists", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.NVIDIA_NIM_API_KEY = "nim-test";
    anthropicCreate.mockRejectedValue(new Error("503 overloaded"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(nimReply("Trim the redundancy."));

    const result = await generateWritingAssistantReply(INPUT);

    expect(result.provider).toBe("nvidia-nim");
    expect(result.content).toBe("Trim the redundancy.");
  });

  it("surfaces the Anthropic failure when there is no NIM key to fall back to", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    anthropicCreate.mockRejectedValue(new Error("503 overloaded"));

    const err = await generateWritingAssistantReply(INPUT).catch((e) => e);

    expect(err).toBeInstanceOf(WritingAssistantError);
    expect(err.message).toContain("503 overloaded");
  });

  it("treats a refusal as a provider failure rather than an empty reply", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    anthropicCreate.mockResolvedValue({
      stop_reason: "refusal",
      model: "claude-sonnet-5",
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    await expect(generateWritingAssistantReply(INPUT)).rejects.toMatchObject({
      code: "PROVIDER_FAILED",
    });
  });

  it("disables SDK retries when NIM can answer instead, so fallback is not delayed", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.NVIDIA_NIM_API_KEY = "nim-test";
    anthropicCreate.mockResolvedValue(anthropicReply("Fine."));

    await generateWritingAssistantReply(INPUT);

    expect(anthropicCtor.mock.calls[0][0]).toMatchObject({ maxRetries: 0 });
  });

  it("keeps one retry when Anthropic is the only provider", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    anthropicCreate.mockResolvedValue(anthropicReply("Fine."));

    await generateWritingAssistantReply(INPUT);

    expect(anthropicCtor.mock.calls[0][0]).toMatchObject({ maxRetries: 1 });
  });

  it("uses NIM directly when only its key is set", async () => {
    process.env.NVIDIA_NIM_API_KEY = "nim-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(nimReply("Shorter is better."));

    const result = await generateWritingAssistantReply(INPUT);

    expect(result.provider).toBe("nvidia-nim");
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});
