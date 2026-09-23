import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateEditorialUnits, generateEditorialReview } from "./provider";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
const input = { mode: "proofread" as const, text: "She walk home.", chapterTitle: "One", sourceText: null };
const report = { summary: "One grammar issue.", findings: [], corrections: [{ original: "She walk", replacement: "She walks", reason: "Subject agreement" }] };
describe("editorial provider", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "test"); vi.stubEnv("AI_CRITIC_ENABLED", "false"); create.mockResolvedValue({ usage: { input_tokens: 30, output_tokens: 50 }, model: "claude-sonnet-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(report) }] }); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("returns validated, grounded corrections", async () => {
    expect(await generateEditorialReview(input)).toEqual(report);
    expect(create.mock.calls[0][0].messages[0].content).toContain("She walk home.");
    expect(create.mock.calls[0][0].output_config.format).toMatchObject({ type: "json_schema", schema: { additionalProperties: false } });
  });
  it("records billed usage before validating a refused or malformed response", async () => {
    const onUsage = vi.fn();
    create.mockResolvedValue({ model: "claude-sonnet-5", usage: { input_tokens: 30, output_tokens: 50, cache_creation_input_tokens: 4, cache_read_input_tokens: 8 }, stop_reason: "max_tokens", content: [] });
    await expect(generateEditorialReview(input, onUsage)).rejects.toThrow("incomplete");
    expect(onUsage).toHaveBeenCalledWith({ model: "claude-sonnet-5", inputTokens: 30, outputTokens: 50, cacheCreationInputTokens: 4, cacheReadInputTokens: 8 });
  });
  it("reserves UTF-8 request bytes including schema, framing, and maximum output", async () => {
    const units = estimateEditorialUnits({ ...input, text: "語".repeat(1000) });
    expect(units).toBeGreaterThan(3000 + 6000 + 4096);
    expect(units).toBeGreaterThan(estimateEditorialUnits({ ...input, text: "a".repeat(1000) }));
  });
  it("reserves the possible critic request as well as the original model", () => {
    vi.stubEnv("AI_CRITIC_ENABLED", "false");
    vi.stubEnv("OPENAI_API_KEY", "test");
    const original = estimateEditorialUnits(input);
    vi.stubEnv("AI_CRITIC_ENABLED", "true");
    expect(estimateEditorialUnits(input)).toBeGreaterThan(original + 32768 + 4000 + 4096);
  });
  it.each((["proofread", "translation"] as const).flatMap((mode) => ["completed", "incomplete", "missing", "timeout"].map((outcome) => ({ mode, outcome }))))("preserves $outcome receipts in $mode mode", async ({ mode, outcome }) => {
    const reviewInput = { ...input, mode, sourceText: mode === "translation" ? "Hon går inte hem." : null };
    vi.stubEnv("AI_CRITIC_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "local-fake");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const criticUsage = { input_tokens: 23, output_tokens: 17, output_tokens_details: { reasoning_tokens: 9 } };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ model: "actual-openai", id: "resp-local", status: outcome,
      usage: outcome === "missing" ? undefined : criticUsage,
      output_text: JSON.stringify({ findings: [], corrections: [] }) }) });
    if (outcome === "timeout") fetchMock.mockRejectedValue(new Error("timeout"));
    const onUsage = vi.fn();
    const onCritic = vi.fn();
    const reserved = estimateEditorialUnits(reviewInput);
    expect(await generateEditorialReview(reviewInput, onUsage, onCritic)).toEqual(report);
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ model: "claude-sonnet-5", inputTokens: 30 }));
    expect(onCritic).toHaveBeenNthCalledWith(1, { status: "started", usage: null });
    expect(onCritic).toHaveBeenLastCalledWith(expect.objectContaining({
      status: ["missing", "timeout"].includes(outcome) ? "unknown" : "received",
      usage: ["missing", "timeout"].includes(outcome) ? null : expect.objectContaining({ model: "actual-openai", outputTokens: 17, reasoningTokens: 9 }),
    }));
    const firstWire = Buffer.byteLength(JSON.stringify(create.mock.calls[0][0]), "utf8");
    const secondWire = Buffer.byteLength(fetchMock.mock.calls[0][1].body, "utf8");
    expect(reserved).toBeGreaterThanOrEqual(firstWire + secondWire + 2 * 4096 + 6000 + 4000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([true, false].flatMap((criticEnabled) => [null, "", " \n\t"].map((sourceText) => ({ criticEnabled, sourceText }))))("rejects source-less translation before any model work with critic=$criticEnabled and source=$sourceText", async ({ criticEnabled, sourceText }) => {
    const translation = { ...input, mode: "translation" as const, sourceText };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_CRITIC_ENABLED", String(criticEnabled));
    vi.stubEnv("OPENAI_API_KEY", "local-fake");
    expect(() => estimateEditorialUnits(translation)).toThrow("source text");
    await expect(generateEditorialReview(translation)).rejects.toThrow("source text");
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("forwards complete mode/source text and reserves both escaped requests for a large source", async () => {
    vi.stubEnv("AI_CRITIC_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "local-fake");
    const sourceText = '\\"\n語'.repeat(12000);
    const translation = { ...input, mode: "translation" as const, sourceText };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ model: "critic", status: "completed",
      usage: { input_tokens: 30, output_tokens: 20 }, output_text: JSON.stringify({ findings: [], corrections: [] }) }) });
    vi.stubGlobal("fetch", fetchMock);
    const reserved = estimateEditorialUnits(translation);
    await generateEditorialReview(translation);
    expect(fetchMock).toHaveBeenCalledOnce();
    const firstRequest = create.mock.calls[0][0];
    const secondRequest = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.parse(firstRequest.messages[0].content)).toMatchObject(translation);
    expect(JSON.parse(secondRequest.input)).toMatchObject({ mode: "translation", sourceText, text: input.text });
    const wireBytes = Buffer.byteLength(JSON.stringify(firstRequest), "utf8") + Buffer.byteLength(fetchMock.mock.calls[0][1].body, "utf8");
    expect(reserved).toBeGreaterThanOrEqual(wireBytes + 2 * 4096 + 6000 + 4000);
    expect(reserved).toBeGreaterThan(estimateEditorialUnits({ ...translation, sourceText: "Short source." }));
  });
  it("passes analysis mode to the critic with no source and no discarded corrections", async () => {
    vi.stubEnv("AI_CRITIC_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "local-fake");
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ ...report, findings: [{ category: "pacing", severity: "suggestion", quote: "", explanation: "Synthetic observation." }] }) }] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ model: "critic", status: "completed",
      usage: { input_tokens: 30, output_tokens: 20 }, output_text: JSON.stringify({ findings: [], corrections: [] }) }) });
    vi.stubGlobal("fetch", fetchMock);
    await generateEditorialReview({ ...input, mode: "analysis" });
    expect(JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).input)).toMatchObject({ mode: "analysis", sourceText: null, corrections: [] });
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
