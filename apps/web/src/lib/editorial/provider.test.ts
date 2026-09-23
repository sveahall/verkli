import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateEditorialReview } from "./provider";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
const openai = vi.hoisted(() => ({
  callOpenAi: vi.fn(),
  isOpenAiConfigured: vi.fn(() => false),
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("@/lib/ai/providers/openai", () => openai);
const input = { mode: "proofread" as const, text: "She walk home.", chapterTitle: "One", sourceText: null };
const report = { summary: "One grammar issue.", findings: [], corrections: [{ original: "She walk", replacement: "She walks", reason: "Subject agreement" }] };
describe("editorial provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    vi.stubEnv("AI_CRITIC_ENABLED", "false");
    openai.isOpenAiConfigured.mockReturnValue(false);
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(report) }] });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("returns validated, grounded corrections", async () => {
    expect(await generateEditorialReview(input)).toEqual(report);
    expect(create.mock.calls[0][0].messages[0].content).toContain("She walk home.");
    expect(create.mock.calls[0][0].output_config.format).toMatchObject({ type: "json_schema", schema: { additionalProperties: false } });
  });
  it("rejects fabricated quotations", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ ...report, corrections: [{ ...report.corrections[0], original: "Not in text" }] }) }] });
    await expect(generateEditorialReview(input)).rejects.toThrow("quotation");
  });
  it("does not turn a truncated answer into a successful review", async () => {
    create.mockResolvedValue({ stop_reason: "max_tokens", content: [{ type: "text", text: JSON.stringify(report) }] });
    await expect(generateEditorialReview(input)).rejects.toThrow("incomplete");
  });
  it("fails honestly if no provider is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(generateEditorialReview(input)).rejects.toThrow("not configured");
  });

  it("keeps flags from both readers and marks a passage they both quote", async () => {
    vi.stubEnv("AI_CRITIC_ENABLED", "true");
    openai.isOpenAiConfigured.mockReturnValue(true);
    create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({
        summary: "One grammar issue.",
        findings: [{ category: "grammar", severity: "suggestion", explanation: "Agreement.", quote: "She walk" }],
        corrections: [{ original: "She walk", replacement: "She walks", reason: "Subject agreement" }],
      }) }],
    });
    openai.callOpenAi.mockResolvedValue(JSON.stringify({
      summary: "Also spelling.",
      findings: [
        { category: "grammar", severity: "suggestion", explanation: "Verb form.", quote: "She walk" },
        { category: "style", severity: "suggestion", explanation: "Flat.", quote: "home" },
      ],
      corrections: [{ original: "Not in the chapter", replacement: "x", reason: "Invented." }],
    }));

    const result = await generateEditorialReview(input);

    expect(result.findings).toEqual([
      { category: "grammar", severity: "important", explanation: "Agreement. Both readers flagged this.", quote: "She walk" },
      { category: "style", severity: "suggestion", explanation: "Flat.", quote: "home" },
    ]);
    expect(result.corrections.map((correction) => correction.original)).toEqual(["She walk"]);
    expect(result.summary).toContain("second reader");
  });
});
