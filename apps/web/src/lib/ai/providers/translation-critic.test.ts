import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIProviderError } from "./types";

const mocks = vi.hoisted(() => ({
  translateBatch: vi.fn(),
  anthropicBatch: vi.fn(),
  callOpenAi: vi.fn(),
  create: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("./openai-translator", () => ({
  openaiTranslator: { translateBatch: (...args: unknown[]) => mocks.translateBatch(...args) },
}));
vi.mock("./anthropic-translator", () => ({
  anthropicTranslator: { translateBatch: (...args: unknown[]) => mocks.anthropicBatch(...args) },
}));
vi.mock("./openai", () => ({
  callOpenAi: (...args: unknown[]) => mocks.callOpenAi(...args),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...args: unknown[]) => mocks.create(...args) };
  },
}));
vi.mock("@/lib/usage/meter", () => ({
  recordUsage: (...args: unknown[]) => mocks.recordUsage(...args),
}));

const { translateBatchWithCritic } = await import("./translation-critic");

function critique(issues: unknown[]) {
  return {
    content: [{ type: "text", text: JSON.stringify({ issues }) }],
    usage: { input_tokens: 10, output_tokens: 4 },
  };
}

describe("translateBatchWithCritic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    mocks.translateBatch.mockResolvedValue(["hej"]);
  });

  it("keeps the OpenAI draft when Anthropic finds nothing to fix", async () => {
    mocks.create.mockResolvedValue(critique([]));
    const translated = await translateBatchWithCritic(["hi"], "en", "sv", {
      userId: "user-1", pipeline: "translation", bookId: "book-1",
    });
    expect(translated).toEqual(["hej"]);
    expect(mocks.callOpenAi).not.toHaveBeenCalled();
    expect(mocks.recordUsage).toHaveBeenCalledOnce();
  });

  it("asks OpenAI to revise the segments Anthropic flagged", async () => {
    mocks.create.mockResolvedValue(critique([{ index: 0, problem: "The name was translated." }]));
    mocks.callOpenAi.mockResolvedValue(JSON.stringify({ segments: ["Hej Anna"] }));
    await expect(translateBatchWithCritic(["Hi Anna"], "en", "sv")).resolves.toEqual(["Hej Anna"]);
    const revision = mocks.callOpenAi.mock.calls[0][0];
    expect(revision.user).toContain("The name was translated.");
    expect(revision.user).toContain("Hi Anna");
  });

  it("keeps the draft when the revision would shift later paragraphs", async () => {
    mocks.translateBatch.mockResolvedValue(["ett", "två"]);
    mocks.create.mockResolvedValue(critique([{ index: 1, problem: "Tone is off." }]));
    mocks.callOpenAi.mockResolvedValue(JSON.stringify({ segments: ["bara ett"] }));
    await expect(translateBatchWithCritic(["one", "two"], "en", "sv")).resolves.toEqual(["ett", "två"]);
  });

  it("keeps the draft when the critique itself fails", async () => {
    mocks.create.mockRejectedValue(new Error("overloaded"));
    await expect(translateBatchWithCritic(["hi"], "en", "sv")).resolves.toEqual(["hej"]);
    expect(mocks.callOpenAi).not.toHaveBeenCalled();
  });

  it("translates with Anthropic when OpenAI is unreachable", async () => {
    mocks.translateBatch.mockRejectedValue(new AIProviderError("timed out", "TIMEOUT", "openai"));
    mocks.anthropicBatch.mockResolvedValue(["hej då"]);
    await expect(translateBatchWithCritic(["bye"], "en", "sv")).resolves.toEqual(["hej då"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
