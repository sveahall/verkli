import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicCreate = vi.fn();
const anthropicCtor = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: (...args: unknown[]) => anthropicCreate(...args) };

    constructor(options: unknown) {
      anthropicCtor(options);
    }
  }

  return { default: MockAnthropic };
});

const registry = await import("./server");

describe("server translator registry", () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    anthropicCtor.mockReset();
    delete process.env.OPUSMT_ENABLED;
    delete process.env.OPUSMT_PYTHON;
    delete process.env.OPUSMT_MODELS_DIR;
    process.env.ANTHROPIC_API_KEY = "synthetic-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it.each([
    ["sv", "en"],
    ["sv", "de"],
    ["en", "fi"],
  ])("routes the default %s-%s pair to Anthropic", (source, target) => {
    expect(registry.getTranslatorForPair(source, target)?.name).toBe("anthropic");
  });

  it("keeps an English-French pair on Riva", () => {
    expect(registry.getTranslatorForPair("en", "fr")?.name).toBe("nvidia-riva");
  });

  it("uses configured Opus and both chain directions", () => {
    process.env.OPUSMT_ENABLED = "true";
    process.env.OPUSMT_PYTHON = "/synthetic/python";
    process.env.OPUSMT_MODELS_DIR = "/synthetic/models";

    expect(registry.getTranslatorForPair("sv", "en")?.name).toBe("opus-mt");
    expect(registry.getTranslatorForPair("sv", "de")?.name).toBe("chain");
    expect(registry.getTranslatorForPair("de", "sv")?.name).toBe("chain");
  });

  it("returns null for same-language and unsupported pairs", () => {
    expect(registry.getTranslatorForPair("sv", "sv")).toBeNull();
    expect(registry.getTranslatorForPair("xx", "en")).toBeNull();
  });

  it("does not create a provider request while importing or selecting", () => {
    registry.getTranslatorForPair("sv", "en");

    expect(anthropicCtor).not.toHaveBeenCalled();
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("executes a selected Anthropic provider through the stubbed SDK transport", async () => {
    const unexpectedFetch = vi.spyOn(globalThis, "fetch");
    anthropicCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '["Hello world"]' }],
    });

    const result = await registry.getTranslatorForPair("sv", "en")!.translate({
      text: "Hej världen",
      sourceLanguage: "sv",
      targetLanguage: "en",
    });

    expect(result).toEqual({ translatedText: "Hello world" });
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });
});
