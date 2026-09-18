import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anthropicTranslator } from "./ai/providers/anthropic-translator";
import { nvidiaRivaTranslator } from "./ai/providers/nvidia-riva-translator";
import { ChainTranslator } from "./ai/providers/chain-translator";
import { estimateTranslationPreviewCost, PREVIEW_MAX_INTERMEDIATE_BYTES } from "./translation-preview-budget";

const mocks = vi.hoisted(() => ({ create: vi.fn(), client: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {
  constructor(options: unknown) { mocks.client(options); }
  messages = { create: mocks.create };
} }));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "test"); vi.stubEnv("NVIDIA_NIM_API_KEY", "test"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("preview full request reservation", () => {
  it.each(["x", "😀漢字\n\"\\".repeat(1000)])("bounds the actual Anthropic input, output and every configured attempt", async (text) => {
    mocks.create.mockResolvedValue({ stop_reason: "max_tokens", content: [{ type: "text", text: '["x"]' }] });
    await expect(anthropicTranslator.translate({ text, sourceLanguage: "sv", targetLanguage: "en" })).rejects.toThrow();
    const request = mocks.create.mock.calls[0][0];
    const attempts = 1 + mocks.client.mock.calls[0][0].maxRetries;
    expect(estimateTranslationPreviewCost(text, "anthropic")).toBeGreaterThanOrEqual(attempts * (bytes(request) + request.max_tokens));
  });

  it("bounds the actual Riva request and full output cap", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "Hello" } }] }) });
    vi.stubGlobal("fetch", fetch);
    const text = "😀\n\"".repeat(1000);
    await nvidiaRivaTranslator.translate({ text, sourceLanguage: "en", targetLanguage: "fr" });
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(estimateTranslationPreviewCost(text, "nvidia-riva")).toBeGreaterThanOrEqual(bytes(request) + request.max_tokens);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops a chain before its second provider if the intermediate exceeds its reserved byte cap", async () => {
    const first = { name: "local", translate: vi.fn().mockResolvedValue({ translatedText: "😀".repeat(PREVIEW_MAX_INTERMEDIATE_BYTES / 4 + 1) }), getSupportedPairs: () => [] };
    const second = { name: "paid", translate: vi.fn(), getSupportedPairs: () => [] };
    const translator = new ChainTranslator(first, second);
    await expect(translator.translate({ text: "x", sourceLanguage: "sv", targetLanguage: "fr", maxIntermediateBytes: PREVIEW_MAX_INTERMEDIATE_BYTES })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(second.translate).not.toHaveBeenCalled();
  });

  it("bounds escaped intermediate input and both possible chain legs", () => {
    const intermediate = "\u0000".repeat(PREVIEW_MAX_INTERMEDIATE_BYTES);
    expect(estimateTranslationPreviewCost("x", "chain")).toBeGreaterThanOrEqual(bytes(intermediate) + 2 * 4096);
  });
});
