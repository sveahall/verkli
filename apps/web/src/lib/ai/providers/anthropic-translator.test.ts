import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: (...args: unknown[]) => anthropicCreate(...args) };
  }
  return { default: MockAnthropic };
});

const { AnthropicTranslator } = await import("./anthropic-translator");

function reply(text: string, stopReason = "end_turn", extraContent: unknown[] = []) {
  return {
    stop_reason: stopReason,
    content: [{ type: "text", text }, ...extraContent],
  };
}

describe("AnthropicTranslator", () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "synthetic-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("preserves segment order and Unicode", async () => {
    anthropicCreate.mockResolvedValue(reply('["Hello 🌍","Goodbye åäö"]'));

    await expect(
      new AnthropicTranslator().translateBatch(["Hej 🌍", "Adjö åäö"], "sv", "en")
    ).resolves.toEqual(["Hello 🌍", "Goodbye åäö"]);
  });

  it("allows empty input segments to have empty outputs", async () => {
    anthropicCreate.mockResolvedValue(reply('["","Translated"]'));

    await expect(
      new AnthropicTranslator().translateBatch(["   ", "Text"], "sv", "en")
    ).resolves.toEqual(["", "Translated"]);
  });

  it.each([
    ["missing array", "not json"],
    ["malformed JSON", '["secret manuscript",]'],
    ["wrong count", '["one"]'],
    ["wrong element type", '["one",2]'],
    ["blank output for non-empty input", '["one","   "]'],
  ])("rejects %s with a controlled model error", async (_name, text) => {
    anthropicCreate.mockResolvedValue(reply(text));

    const error = await new AnthropicTranslator()
      .translateBatch(["first", "second"], "sv", "en")
      .catch((caught) => caught);

    expect(error).toMatchObject({ code: "MODEL_ERROR", provider: "anthropic" });
    expect(error.message).not.toContain("secret manuscript");
  });

  it("rejects an explicit refusal", async () => {
    anthropicCreate.mockResolvedValue(reply("", "refusal"));

    await expect(
      new AnthropicTranslator().translate({ text: "Hej", sourceLanguage: "sv", targetLanguage: "en" })
    ).rejects.toMatchObject({ code: "MODEL_ERROR", provider: "anthropic" });
  });

  it("rejects a refusal content block", async () => {
    anthropicCreate.mockResolvedValue(reply('["partial"]', "end_turn", [
      { type: "refusal", refusal: "declined" },
    ]));

    await expect(
      new AnthropicTranslator().translate({ text: "Hej", sourceLanguage: "sv", targetLanguage: "en" })
    ).rejects.toMatchObject({ code: "MODEL_ERROR", provider: "anthropic" });
  });

  it("rejects truncated output instead of accepting a partial response", async () => {
    anthropicCreate.mockResolvedValue(reply('["partial"]', "max_tokens"));

    await expect(
      new AnthropicTranslator().translate({ text: "Hej", sourceLanguage: "sv", targetLanguage: "en" })
    ).rejects.toMatchObject({ code: "MODEL_ERROR", provider: "anthropic" });
  });

  it.each([
    ["timeout", new Error("request timed out"), "TIMEOUT"],
    ["rate limit", new Error("rate limit exceeded"), "RATE_LIMITED"],
  ])("maps %s failures", async (_name, failure, code) => {
    anthropicCreate.mockRejectedValue(failure);

    await expect(
      new AnthropicTranslator().translate({ text: "Hej", sourceLanguage: "sv", targetLanguage: "en" })
    ).rejects.toMatchObject({ code, provider: "anthropic" });
  });

  it("fails before transport when configuration is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(
      new AnthropicTranslator().translate({ text: "Hej", sourceLanguage: "sv", targetLanguage: "en" })
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", provider: "anthropic" });
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});
