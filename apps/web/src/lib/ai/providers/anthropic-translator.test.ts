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
