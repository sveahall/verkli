import { beforeEach, describe, expect, it, vi } from "vitest";

const callOpenAi = vi.fn();
vi.mock("./openai", () => ({
  callOpenAi: (...args: unknown[]) => callOpenAi(...args),
  OpenAiError: class OpenAiError extends Error {},
}));

const { OpenAiTranslator } = await import("./openai-translator");

describe("OpenAiTranslator", () => {
  beforeEach(() => {
    callOpenAi.mockReset();
  });

  it("asks for one string per segment and returns them in order", async () => {
    callOpenAi.mockResolvedValue(JSON.stringify({ segments: ["hej", ""] }));
    const translated = await new OpenAiTranslator().translateBatch(
      ["hi", "  "],
      "en",
      "sv",
      { userId: "user-1", pipeline: "translation", bookId: "book-1" }
    );
    expect(translated).toEqual(["hej", ""]);
    const input = callOpenAi.mock.calls[0][0];
    expect(input.system).toContain("Swedish");
    expect(input.schema.name).toBe("translation_segments");
    expect(input.meter).toMatchObject({ userId: "user-1", pipeline: "translation" });
  });

  it("rejects a reply that would shift later paragraphs", async () => {
    callOpenAi.mockResolvedValue(JSON.stringify({ segments: ["only-one"] }));
    await expect(
      new OpenAiTranslator().translateBatch(["a", "b"], "en", "da")
    ).rejects.toThrow(/2 inputs/);
  });
});
