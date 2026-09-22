import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adjudicateEditorialReport } from "./adjudicate";
import type { EditorialReport } from "./review-schema";

const { callOpenAi, isOpenAiConfigured } = vi.hoisted(() => ({
  callOpenAi: vi.fn(),
  isOpenAiConfigured: vi.fn(),
}));
vi.mock("@/lib/ai/providers/openai", async (importOriginal) => ({ ...await importOriginal<object>(), callOpenAi, isOpenAiConfigured }));

const text = "The dog barked loudly. She where going home. It was allready late.";

const report = (): EditorialReport => ({
  summary: "Two clear errors and one stylistic note.",
  findings: [
    { category: "grammar", severity: "important", explanation: "Wrong verb form.", quote: "She where going home." },
    { category: "style", severity: "important", explanation: "Adverb is weak.", quote: "The dog barked loudly." },
  ],
  corrections: [
    { original: "She where going home.", replacement: "She was going home.", reason: "Subject-verb agreement." },
    { original: "allready", replacement: "already", reason: "Spelling." },
  ],
});

const verdicts = (payload: unknown) => JSON.stringify(payload);

describe("adjudicateEditorialReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isOpenAiConfigured.mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns the report untouched and spends nothing when OpenAI is not configured", async () => {
    isOpenAiConfigured.mockReturnValue(false);
    const input = report();
    const result = await adjudicateEditorialReport({ report: input, text });
    expect(result.report).toEqual(input);
    expect(result.stats.ran).toBe(false);
    expect(callOpenAi).not.toHaveBeenCalled();
  });

  it("does not call the critic when there is nothing to judge", async () => {
    const empty: EditorialReport = { summary: "Clean.", findings: [], corrections: [] };
    const result = await adjudicateEditorialReport({ report: empty, text });
    expect(result.report).toEqual(empty);
    expect(callOpenAi).not.toHaveBeenCalled();
  });

  it("persists a started marker before calling the critic and retains unknown usage on timeout", async () => {
    const onReceipt = vi.fn();
    callOpenAi.mockRejectedValue(new Error("timeout"));
    const result = await adjudicateEditorialReport({ report: report(), text, onReceipt });
    expect(result.report).toEqual(report());
    expect(onReceipt).toHaveBeenNthCalledWith(1, { status: "started", usage: null });
    expect(onReceipt).toHaveBeenLastCalledWith({ status: "unknown", usage: null });
    expect(onReceipt.mock.invocationCallOrder[0]).toBeLessThan(callOpenAi.mock.invocationCallOrder[0]);
  });

  it("retains usage when the critic returns malformed content", async () => {
    const usage = { model: "actual", responseId: "resp", inputTokens: 12, outputTokens: 8, cachedInputTokens: 0, reasoningTokens: 3 };
    callOpenAi.mockImplementationOnce(async ({ onUsage }) => { await onUsage(usage); return "bad json"; });
    const onReceipt = vi.fn();
    expect((await adjudicateEditorialReport({ report: report(), text, onReceipt })).report).toEqual(report());
    expect(onReceipt).toHaveBeenLastCalledWith({ status: "received", usage });
  });

  it("does not start a critic if the ledger cannot store the started marker", async () => {
    const onReceipt = vi.fn().mockRejectedValue(new Error("ledger unavailable"));
    await expect(adjudicateEditorialReport({ report: report(), text, onReceipt })).rejects.toThrow("ledger unavailable");
    expect(callOpenAi).not.toHaveBeenCalled();
  });

  it("does not hide failure to persist a paid critic receipt", async () => {
    const onReceipt = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error("ledger unavailable"));
    callOpenAi.mockResolvedValue(verdicts({ findings: [], corrections: [] }));
    await expect(adjudicateEditorialReport({ report: report(), text, onReceipt })).rejects.toThrow("ledger unavailable");
  });

  it("skips an intermediate report exceeding the reserved wire allowance", async () => {
    const large = report();
    large.findings = Array.from({ length: 25 }, () => ({ ...large.findings[0], explanation: "語".repeat(1500) }));
    const onReceipt = vi.fn();
    expect((await adjudicateEditorialReport({ report: large, text, onReceipt })).stats.ran).toBe(false);
    expect(callOpenAi).not.toHaveBeenCalled();
    expect(onReceipt).toHaveBeenLastCalledWith({ status: "skipped", usage: null });
  });

  it("drops findings and corrections the critic rejects", async () => {
    callOpenAi.mockResolvedValue(
      verdicts({
        findings: [
          { index: 0, verdict: "keep", reason: "Real error.", explanation: "", severity: "unchanged" },
          { index: 1, verdict: "drop", reason: "Author's deliberate voice.", explanation: "", severity: "unchanged" },
        ],
        corrections: [
          { index: 0, verdict: "keep", reason: "Correct." },
          { index: 1, verdict: "drop", reason: "Already handled elsewhere." },
        ],
      })
    );
    const result = await adjudicateEditorialReport({ report: report(), text });
    expect(result.report.findings).toHaveLength(1);
    expect(result.report.findings[0].category).toBe("grammar");
    expect(result.report.corrections).toHaveLength(1);
    expect(result.stats).toEqual({ ran: true, findingsDropped: 1, findingsAmended: 0, correctionsDropped: 1 });
  });

  it("amends an explanation and softens severity without touching the quote", async () => {
    callOpenAi.mockResolvedValue(
      verdicts({
        findings: [
          { index: 0, verdict: "keep", reason: "", explanation: "", severity: "unchanged" },
          { index: 1, verdict: "amend", reason: "Taste, not a defect.", explanation: "Consider a stronger verb.", severity: "suggestion" },
        ],
        corrections: [],
      })
    );
    const result = await adjudicateEditorialReport({ report: report(), text });
    const amended = result.report.findings[1];
    expect(amended.explanation).toBe("Consider a stronger verb.");
    expect(amended.severity).toBe("suggestion");
    // The safety invariant: quotations survive adjudication byte for byte.
    expect(amended.quote).toBe("The dog barked loudly.");
    expect(result.stats.findingsAmended).toBe(1);
  });

  it("returns the critic's reason per changed item, which is what makes a drop auditable", async () => {
    callOpenAi.mockResolvedValue(
      verdicts({
        findings: [
          { index: 0, verdict: "keep", reason: "", explanation: "", severity: "unchanged" },
          { index: 1, verdict: "drop", reason: "Deliberate authorial voice.", explanation: "", severity: "unchanged" },
        ],
        corrections: [{ index: 1, verdict: "drop", reason: "Not a misspelling in this dialect." }],
      })
    );
    const { decisions } = await adjudicateEditorialReport({ report: report(), text });
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatchObject({
      kind: "finding",
      verdict: "drop",
      reason: "Deliberate authorial voice.",
      label: "The dog barked loudly.",
    });
    expect(decisions[1]).toMatchObject({ kind: "correction", verdict: "drop", label: "allready" });
    // The kept finding produces no decision; only changes are auditable events.
    expect(decisions.map((d) => d.label)).not.toContain("She where going home.");
  });

  it("keeps items the critic did not rule on, because silence is not a verdict", async () => {
    callOpenAi.mockResolvedValue(verdicts({ findings: [], corrections: [] }));
    const result = await adjudicateEditorialReport({ report: report(), text });
    expect(result.report.findings).toHaveLength(2);
    expect(result.report.corrections).toHaveLength(2);
  });

  it("returns the unadjudicated report when the critic fails", async () => {
    callOpenAi.mockRejectedValue(new Error("upstream exploded"));
    const input = report();
    const result = await adjudicateEditorialReport({ report: input, text });
    expect(result.report).toEqual(input);
    expect(result.stats.ran).toBe(false);
  });

  it("returns the unadjudicated report when the critic replies with malformed JSON", async () => {
    callOpenAi.mockResolvedValue("not json at all");
    const input = report();
    const result = await adjudicateEditorialReport({ report: input, text });
    expect(result.report).toEqual(input);
  });
});
