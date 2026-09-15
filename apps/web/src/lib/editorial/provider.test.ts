import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateEditorialReview } from "./provider";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
const input = { mode: "proofread" as const, text: "She walk home.", chapterTitle: "One", sourceText: null };
const report = { summary: "One grammar issue.", findings: [], corrections: [{ original: "She walk", replacement: "She walks", reason: "Subject agreement" }] };
describe("editorial provider", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "test"); create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(report) }] }); });
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
});
