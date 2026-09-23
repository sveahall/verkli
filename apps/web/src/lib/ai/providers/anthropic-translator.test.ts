import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anthropicTranslator } from "./anthropic-translator";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class {
  messages = { create: (...args: unknown[]) => create(...args) };
} }));

function reply(text: string, stopReason = "end_turn") {
  return { stop_reason: stopReason, content: [{ type: "text", text }] };
}

describe("AnthropicTranslator output validation", () => {
  beforeEach(() => { create.mockReset(); vi.stubEnv("ANTHROPIC_API_KEY", "test-key"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("returns a structurally valid unreviewed translation", async () => {
    create.mockResolvedValue(reply('["She waits."]'));
    expect(await anthropicTranslator.translateBatch(["Hon väntar."], "sv", "en")).toEqual(["She waits."]);
  });

  it.each(['[]', '[""]', '[" "]', '[1]'])("rejects missing or empty translations: %s", async (raw) => {
    create.mockResolvedValue(reply(raw));
    await expect(anthropicTranslator.translateBatch(["Hon väntar."], "sv", "en")).rejects.toMatchObject({ code: "MODEL_ERROR" });
  });

  it("rejects truncated output even if its JSON is parseable", async () => {
    create.mockResolvedValue(reply('["She waits."]', "max_tokens"));
    await expect(anthropicTranslator.translateBatch(["Hon väntar."], "sv", "en")).rejects.toMatchObject({ code: "MODEL_ERROR" });
  });

  it("does not expose malformed model output in errors", async () => {
    create.mockResolvedValue(reply('[SECRET_MANUSCRIPT]'));
    await expect(anthropicTranslator.translateBatch(["Hon väntar."], "sv", "en")).rejects.toMatchObject({ code: "MODEL_ERROR", message: "Anthropic returned invalid translation JSON." });

  });
});

const recordUsageMock = vi.fn();
vi.mock("@/lib/usage/meter", () => ({
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
}));

describe("AnthropicTranslator metering", () => {
  beforeEach(() => {
    create.mockReset();
    recordUsageMock.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  const withUsage = (text: string) => ({
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 900, output_tokens: 120 },
  });

  it("records input and output tokens against the translation pipeline", async () => {
    create.mockResolvedValue(withUsage('["She waits."]'));
    await anthropicTranslator.translateBatch(["Hon väntar."], "sv", "en", {
      userId: "user-1", pipeline: "translation", bookId: "book-1",
    });
    const [ctx, events] = recordUsageMock.mock.calls[0];
    expect(ctx).toMatchObject({ userId: "user-1", pipeline: "translation", bookId: "book-1" });
    expect(events).toEqual([
      { kind: "ai_call", provider: "anthropic", model: "claude-sonnet-5", quantity: 900, unit: "input_tokens" },
      { kind: "ai_call", provider: "anthropic", model: "claude-sonnet-5", quantity: 120, unit: "output_tokens" },
    ]);
  });

  it("records nothing when no meter context is supplied", async () => {
    create.mockResolvedValue(withUsage('["She waits."]'));
    await anthropicTranslator.translateBatch(["Hon väntar."], "sv", "en");
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("records the spend even when the reply is rejected as incomplete", async () => {
    // The tokens were bought before the stop_reason was read. Pricing that at
    // zero is exactly how a truncation loop becomes invisible.
    create.mockResolvedValue({ ...withUsage('["x"]'), stop_reason: "max_tokens" });
    await expect(
      anthropicTranslator.translateBatch(["Hon väntar."], "sv", "en", { userId: "user-1", pipeline: "translation" })
    ).rejects.toThrow();
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
  });
});
