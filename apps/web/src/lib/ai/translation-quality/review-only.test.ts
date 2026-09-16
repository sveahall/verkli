import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as provider from "./anthropic";
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: (...args: unknown[]) => create(...args) }; } }));
const input = { texts: ["Hon kom inte."], translations: ["She came."], sourceLanguage: "sv", targetLanguage: "en", profile: { voice: "Restrained", rhythm: "Short", dialogue: "None", preserve: [], glossary: [] } };
const reply = (data: unknown) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(data) }], usage: { input_tokens: 12, output_tokens: 8 } });
beforeEach(() => { create.mockReset(); vi.stubEnv("ANTHROPIC_API_KEY", "test"); });
afterEach(() => vi.unstubAllEnvs());
it("reviews a fixed candidate using both production roles without translating or repairing it", async () => {
  expect(provider).toHaveProperty("reviewTranslationCandidate");
  create.mockResolvedValueOnce(reply({ reviewedSegments: [0], issues: [{ severity: "critical", segment: 0, sourceQuote: "inte", targetQuote: "came", explanation: "Negation lost", suggestion: "Restore not" }] }))
    .mockResolvedValueOnce(reply({ reviewedSegments: [0], issues: [] }));
  const result = await provider.reviewTranslationCandidate(input);
  expect(result.issues).toMatchObject([{ reviewer: "fidelity", severity: "critical" }]);
  expect(result.usage).toEqual({ inputTokens: 24, outputTokens: 16 });
  expect(create).toHaveBeenCalledTimes(2);
  for (const [request] of create.mock.calls) {
    expect(request.system).toContain("reviewer");
    expect(JSON.parse(request.messages[0].content)).toMatchObject({ texts: input.texts, translations: input.translations, profile: input.profile });
  }
});
it.each([
  { reviewedSegments: [], issues: [] },
  { reviewedSegments: [0], issues: [{ severity: "major", segment: 0, sourceQuote: "invented", targetQuote: "came", explanation: "Wrong", suggestion: "Fix" }] },
])("rejects incomplete or ungrounded review %#", async (data) => {
  expect(provider).toHaveProperty("reviewTranslationCandidate");
  create.mockResolvedValue(reply(data));
  await expect(provider.reviewTranslationCandidate(input)).rejects.toMatchObject({ code: "INVALID_REVIEW" });
});
it("validates segment alignment before making any provider request", async () => {
  expect(provider).toHaveProperty("reviewTranslationCandidate");
  await expect(provider.reviewTranslationCandidate({ ...input, translations: [] })).rejects.toMatchObject({ code: "INVALID_TRANSLATION" });
  expect(create).not.toHaveBeenCalled();
});
it("does not turn a provider failure into a clean review", async () => {
  expect(provider).toHaveProperty("reviewTranslationCandidate");
  create.mockRejectedValue(new Error("secret provider payload"));
  await expect(provider.reviewTranslationCandidate(input)).rejects.toMatchObject({ code: "REVIEW_UNAVAILABLE" });
});
it("rejects invalid usage and cancellation", async () => {
  expect(provider).toHaveProperty("reviewTranslationCandidate");
  create.mockResolvedValue({ ...reply({ reviewedSegments: [0], issues: [] }), usage: { input_tokens: -1, output_tokens: 2 } });
  await expect(provider.reviewTranslationCandidate(input)).rejects.toMatchObject({ code: "INVALID_REVIEW" });
  const controller = new AbortController(); controller.abort(); create.mockReset();
  await expect(provider.reviewTranslationCandidate({ ...input, signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED" });
  expect(create).not.toHaveBeenCalled();
});
