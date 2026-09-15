import { describe, expect, it } from "vitest";
import { agentActionSchema, extractAgentChapterText, parseAgentReply } from "./agent-actions";

const edit = { kind: "edit_text", original: " teh boat ", replacement: " the boat ", reason: "Fix spelling." };
const context = { tool: "edit" as const, chapterText: "On teh boat today." };
const envelope = (actions: unknown[]) => JSON.stringify({ content: "Review this suggestion.", actions });

describe("agent actions", () => {
  it("extracts exact marked text, hard breaks, paragraphs and nested blocks", () => {
    const doc = { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "  Mi" }, { type: "text", text: "ra", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "waited. " }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] }] },
      { type: "paragraph" },
    ] };
    expect(extractAgentChapterText(doc)).toBe("  Mira\nwaited. \n\nOne\n\n");
    expect(extractAgentChapterText(JSON.stringify(doc))).toBe(extractAgentChapterText(doc));
    expect(extractAgentChapterText("  raw prose \n")).toBe("  raw prose \n");
    expect(extractAgentChapterText(null)).toBe("");
  });

  it("preserves exact whitespace in a unique manuscript replacement", () => {
    expect(parseAgentReply(envelope([edit]), context).actions).toEqual([edit]);
  });

  it.each([null, "Different text.", "On teh boat then teh boat again."])("rejects missing or ambiguous originals in %s", (chapterText) => {
    expect(() => parseAgentReply(envelope([edit]), { ...context, chapterText })).toThrow();
  });

  it("rejects empty replacement and executable model extras", () => {
    expect(agentActionSchema.safeParse({ ...edit, replacement: " " }).success).toBe(false);
    expect(agentActionSchema.safeParse({ ...edit, chapterId: "model-picked-id" }).success).toBe(false);
    expect(agentActionSchema.safeParse({ ...edit, url: "https://example.com" }).success).toBe(false);
  });

  it("rejects malformed envelopes and too many proposals", () => {
    expect(() => parseAgentReply("```json\n{}\n```", context)).toThrow();
    expect(() => parseAgentReply(envelope([edit, edit, edit, edit]), context)).toThrow();
    expect(() => parseAgentReply(JSON.stringify({ content: "Done", actions: [], execute: true }), context)).toThrow();
  });

  it("offers one text correction per snapshot so applying it does not invalidate siblings", () => {
    expect(() => parseAgentReply(envelope([edit, { ...edit, original: "today.", replacement: "tomorrow." }]), context)).toThrow();
  });
  it("only permits each tool's actions", () => {
    const cover = { kind: "cover_brief", prompt: "A small boat in a storm", style: "illustrated", reason: "Match the setting." };
    expect(() => parseAgentReply(envelope([cover]), context)).toThrow();
    expect(parseAgentReply(envelope([cover]), { tool: "cover", chapterText: null, marketingEnabled: false }).actions).toEqual([cover]);
    expect(() => parseAgentReply(envelope([edit]), { ...context, tool: "review" })).toThrow();
  });

  it("requires an enabled feature for marketing, translation and audio actions", () => {
    const marketing = { kind: "marketing_draft", copy: "Come aboard.", channel: "generic", reason: "Introduce the book." };
    expect(() => parseAgentReply(envelope([marketing]), { ...context, tool: "market" })).toThrow();
    expect(parseAgentReply(envelope([marketing]), { ...context, tool: "market", marketingEnabled: true }).actions).toEqual([marketing]);
    expect(() => parseAgentReply(envelope([edit]), { ...context, tool: "translate" })).toThrow();
    expect(parseAgentReply(envelope([edit]), { ...context, tool: "translate", translationsEnabled: true }).actions).toEqual([edit]);
  });

  it("anchors pronunciation to a word in both the chapter and preview without editing spelling", () => {
    const pronunciation = { kind: "pronunciation", word: "Mira", spokenAs: "Mee-ra", sampleText: "Mira waited.", reason: "Pronounce the name." };
    const audioContext = { tool: "audiobook" as const, chapterText: "Mira waited.", audiobookEnabled: true };
    expect(parseAgentReply(envelope([pronunciation]), audioContext).actions).toEqual([pronunciation]);
    expect(() => parseAgentReply(envelope([pronunciation]), { ...audioContext, audiobookEnabled: false })).toThrow();
    expect(() => parseAgentReply(envelope([{ ...pronunciation, word: "Unknown" }]), audioContext)).toThrow();
    expect(() => parseAgentReply(envelope([{ ...pronunciation, sampleText: "A different name." }]), audioContext)).toThrow();
  });

  it("accepts a bounded pricing draft and rejects invalid amounts", () => {
    const price = { kind: "pricing_draft", amount: 4.99, currency: "USD", reason: "A draft for review." };
    expect(parseAgentReply(envelope([price]), { tool: "pricing", chapterText: null }).actions).toEqual([price]);
    expect(agentActionSchema.safeParse({ ...price, amount: -1 }).success).toBe(false);
    expect(agentActionSchema.safeParse({ ...price, currency: "US Dollars" }).success).toBe(false);
  });
});
