import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateBookAnalysisNotesUnits, estimateBookAnalysisReportUnits, generateBookAnalysisNotes, generateBookAnalysisReport } from "./book-analysis-provider";
import { splitBookAnalysis } from "./book-analysis-content";
import { BOOK_ANALYSIS_CATEGORIES, type AnalysisNote, type BookAnalysisReport } from "./book-analysis-schema";
const { create, construct } = vi.hoisted(() => ({ create: vi.fn(), construct: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor(options: unknown) { construct(options); } messages = { create }; } }));
const chapters = [
  { id: "arrival", title: "Arrival", order: 0, text: "On Monday 3 May, Ada arrived. Ada's eyes were green. I saw her at the gate." },
  { id: "meeting", title: "Meeting", order: 1, text: "The next morning was Friday 7 May. Ada's eyes were brown. I watched her enter." },
  { id: "departure", title: "Departure", order: 2, text: "I stayed home. Meanwhile Ada silently knew the truth, though she never told anyone." },
];
const notes: AnalysisNote[] = [
  { category: "timeline", observation: "Arrival date.", evidence: [{ chapterId: "arrival", quote: "On Monday 3 May" }] },
  { category: "timeline", observation: "Following day date.", evidence: [{ chapterId: "meeting", quote: "The next morning was Friday 7 May." }] },
  { category: "characters", observation: "Eye colour.", evidence: [{ chapterId: "arrival", quote: "Ada's eyes were green." }] },
  { category: "characters", observation: "Eye colour.", evidence: [{ chapterId: "meeting", quote: "Ada's eyes were brown." }] },
  { category: "perspective", observation: "Narrator's direct observation.", evidence: [{ chapterId: "arrival", quote: "I saw her at the gate." }] },
  { category: "perspective", observation: "Private knowledge outside narrator's presence.", evidence: [{ chapterId: "departure", quote: "Meanwhile Ada silently knew the truth, though she never told anyone." }] },
];
const report: BookAnalysisReport = {
  summary: "Three possible continuity issues need the author's review. This is not an exhaustive sign-off.",
  areas: ["plot", "timeline", "perspective", "characters"].map((category) => ({ category: category as AnalysisNote["category"], summary: "Review the available evidence; no guarantee of completeness." })),
  findings: ["timeline", "characters", "perspective"].map((category, index) => ({ category: category as AnalysisNote["category"], severity: "important", title: `${category} continuity`, explanation: "The passages appear inconsistent; check whether the shift is intentional.", evidence: [...notes[index * 2].evidence, ...notes[index * 2 + 1].evidence] })),
};
function response(value: unknown, stopReason = "end_turn") {
  return { model: "claude-sonnet-5", usage: { input_tokens: 30, output_tokens: 50, cache_creation_input_tokens: 4, cache_read_input_tokens: 8 }, stop_reason: stopReason, content: [{ type: "text", text: JSON.stringify(value) }] };
}
describe("whole-book analysis provider", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "test"); });
  afterEach(() => vi.unstubAllEnvs());
  it("extracts each chapter then synthesises evidenced conflicts across all three chapters", async () => {
    const extracted: AnalysisNote[] = [];
    for (const part of splitBookAnalysis(chapters)) {
      const chapterNotes = notes.filter((note) => note.evidence[0].chapterId === part.chapterId);
      create.mockResolvedValueOnce(response({ notes: chapterNotes }));
      extracted.push(...await generateBookAnalysisNotes(part));
    }
    create.mockResolvedValueOnce(response(report));
    expect(await generateBookAnalysisReport(chapters, extracted)).toEqual(report);
    const payload = JSON.parse(create.mock.calls.at(-1)![0].messages[0].content);
    expect(payload.chapters).toEqual(chapters.map(({ id, title, order }) => ({ id, title, order })));
    expect(payload.notes).toEqual(extracted);
    expect(payload.chapters[0].text).toBeUndefined();
    expect(construct).toHaveBeenCalledWith({ apiKey: "test", timeout: 40000, maxRetries: 0 });
    expect(BOOK_ANALYSIS_CATEGORIES).toHaveLength(4);
  });
  it.each(["max_tokens", "refusal"])("retains paid usage before rejecting %s", async (reason) => {
    const receipt = vi.fn();
    create.mockResolvedValue(response(report, reason));
    await expect(generateBookAnalysisReport(chapters, notes, receipt)).rejects.toThrow(/incomplete/);
    expect(receipt).toHaveBeenCalledWith({ model: "claude-sonnet-5", inputTokens: 30, outputTokens: 50, cacheCreationInputTokens: 4, cacheReadInputTokens: 8 });
  });
  it("retains paid usage before rejecting invalid quotations", async () => {
    const receipt = vi.fn();
    create.mockResolvedValue(response({ notes: [{ ...notes[0], evidence: [{ chapterId: "arrival", quote: "Fabricated text" }] }] }));
    await expect(generateBookAnalysisNotes(splitBookAnalysis(chapters)[0], receipt)).rejects.toThrow(/quotation/);
    expect(receipt).toHaveBeenCalledOnce();
  });
  it("rejects a quote found in a different chapter", async () => {
    create.mockResolvedValue(response({ ...report, findings: [{ ...report.findings[0], evidence: [{ chapterId: "arrival", quote: "The next morning was Friday 7 May." }, notes[1].evidence[0]] }] }));
    await expect(generateBookAnalysisReport(chapters, notes)).rejects.toThrow(/quotation/);
  });
  it("rejects duplicate areas and findings confined to one chapter", async () => {
    create.mockResolvedValueOnce(response({ ...report, areas: report.areas.map(() => report.areas[0]) }));
    await expect(generateBookAnalysisReport(chapters, notes)).rejects.toThrow(/categories/);
    create.mockResolvedValueOnce(response({ ...report, findings: [{ ...report.findings[0], evidence: [notes[0].evidence[0], notes[2].evidence[0]] }] }));
    await expect(generateBookAnalysisReport(chapters, notes)).rejects.toThrow(/two distinct chapters/);
  });
  it("rejects ungrounded or oversized inputs before any paid request", async () => {
    await expect(generateBookAnalysisReport(chapters, [{ ...notes[0], evidence: [{ chapterId: "wrong", quote: "text" }] }])).rejects.toThrow(/quotation/);
    await expect(generateBookAnalysisNotes({ ...splitBookAnalysis(chapters)[0], text: "a".repeat(12001) })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it("accepts cautious reports with no identified cross-chapter issues", async () => {
    create.mockResolvedValue(response({ ...report, findings: [] }));
    expect((await generateBookAnalysisReport(chapters, notes)).findings).toEqual([]);
  });
  it("fails explicitly if all notes cannot fit, without paying for a truncated synthesis", async () => {
    const oversizedNotes = Array.from({ length: 400 }, () => ({ ...notes[0], observation: "a".repeat(1000) }));
    await expect(generateBookAnalysisReport(chapters, oversizedNotes)).rejects.toThrow(/320,000-byte/);
    expect(() => estimateBookAnalysisReportUnits(chapters, oversizedNotes)).toThrow(/320,000-byte/);
    expect(create).not.toHaveBeenCalled();
  });
  it("reserves exact serialized UTF-8 request bytes including schema plus framing and output", async () => {
    const part = { ...splitBookAnalysis(chapters)[0], text: "語\n\"🦋".repeat(100) };
    create.mockResolvedValue(response({ notes: [] }));
    await generateBookAnalysisNotes(part);
    const request = create.mock.calls[0][0];
    expect(estimateBookAnalysisNotesUnits(part)).toBe(Buffer.byteLength(JSON.stringify(request), "utf8") + 4096 + request.max_tokens);
    create.mockResolvedValue(response(report));
    await generateBookAnalysisReport(chapters, notes);
    const synthesis = create.mock.calls[1][0];
    expect(estimateBookAnalysisReportUnits(chapters, notes)).toBe(Buffer.byteLength(JSON.stringify(synthesis), "utf8") + 4096 + synthesis.max_tokens);
  });
});
