import { z } from "zod";

export const assistantToolSchema = z.enum([
  "edit", "cover", "audiobook", "translate", "market", "pricing", "publish", "review",
]);
export type AssistantTool = z.infer<typeof assistantToolSchema>;

const text = (max: number) => z.string().min(1).max(max).refine((value) => value.trim().length > 0);
const reason = text(500);

// Strict objects deliberately exclude model-selected IDs, URLs and execution options.
export const agentActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("edit_text"), original: text(4000), replacement: text(8000), reason }).strict(),
  z.object({ kind: z.literal("cover_brief"), prompt: text(2000), style: z.enum(["minimal", "photographic", "illustrated", "vintage"]), reason }).strict(),
  z.object({ kind: z.literal("pronunciation"), word: text(120), spokenAs: text(200), sampleText: text(500), reason }).strict(),
  z.object({ kind: z.literal("pricing_draft"), amount: z.number().finite().min(0).max(10000), currency: z.string().regex(/^[A-Z]{3}$/), reason }).strict(),
  z.object({ kind: z.literal("marketing_draft"), copy: text(4000), channel: z.enum(["ig", "tiktok", "x", "email", "generic"]), reason }).strict(),
]);
export type AgentAction = z.infer<typeof agentActionSchema>;

export const agentReplySchema = z.object({
  content: text(4000),
  actions: z.array(agentActionSchema).max(3).refine((actions) => actions.filter((action) => action.kind === "edit_text").length <= 1, "Offer one text correction at a time against the current chapter."),
}).strict();
export type AgentReply = z.infer<typeof agentReplySchema>;

export type AgentActionContext = {
  tool: AssistantTool;
  chapterText: string | null;
  marketingEnabled?: boolean;
  audiobookEnabled?: boolean;
  translationsEnabled?: boolean;
};

export const assistantToolPersonas: Record<AssistantTool, string> = {
  edit: "Edith, the editor helping with spelling, prose, pacing and dialogue",
  cover: "Stella, the cover designer helping with visual direction and cover revisions",
  audiobook: "August, the audiobook producer helping with pronunciation and narration",
  translate: "Alma, the translator helping preserve meaning and the author's voice",
  market: "Stella, the marketer helping draft copy for the chosen audience",
  pricing: "Ernst, the pricing assistant helping prepare pricing drafts for author review",
  publish: "Edith, the publishing guide helping the author review readiness",
  review: "Edith, the editor reviewing the manuscript with the author",
};

export function getAllowedAgentActionKinds(context: AgentActionContext): AgentAction["kind"][] {
  switch (context.tool) {
    case "edit": return ["edit_text"];
    case "cover": return ["cover_brief"];
    case "audiobook": return context.audiobookEnabled ? ["pronunciation"] : [];
    case "translate": return context.translationsEnabled ? ["edit_text"] : [];
    case "market": return context.marketingEnabled ? ["marketing_draft"] : [];
    case "pricing": return ["pricing_draft"];
    default: return [];
  }
}

/** Proposals are drafts, validated once before the server exposes them to the UI. */
export function parseAgentReply(raw: string, context: AgentActionContext): AgentReply {
  if (raw.length > 40_000) throw new Error("Assistant response exceeds the allowed size.");
  const reply = agentReplySchema.parse(JSON.parse(raw));
  const allowedKinds = getAllowedAgentActionKinds(context);
  for (const action of reply.actions) {
    if (!allowedKinds.includes(action.kind)) throw new Error("Assistant proposed an unavailable action for this tool.");
    if (action.kind === "edit_text") {
      const chapter = context.chapterText ?? "";
      const first = chapter.indexOf(action.original);
      if (first < 0 || chapter.indexOf(action.original, first + 1) >= 0) {
        throw new Error("Assistant edit must match exactly one passage in the current chapter.");
      }
    }
    if (action.kind === "pronunciation") {
      if (!context.chapterText?.includes(action.word) || !action.sampleText.includes(action.word)) {
        throw new Error("Assistant pronunciation must refer to a word in the chapter and preview.");
      }
    }
  }
  return reply;
}

/** Shared with the editor: preserve exact inline text so stale/unique-match checks agree. */
export function extractAgentChapterText(content: string | Record<string, unknown> | null): string {
  if (content === null) return "";
  let doc: unknown = content;
  if (typeof content === "string") {
    try { doc = JSON.parse(content); } catch { return content; }
    if (!doc || typeof doc !== "object") return content;
  }
  function extract(node: unknown): string {
    if (!node || typeof node !== "object") return "";
    const value = node as { type?: unknown; text?: unknown; content?: unknown };
    if (value.type === "text") return typeof value.text === "string" ? value.text : "";
    if (value.type === "hardBreak") return "\n";
    if (!Array.isArray(value.content)) return "";
    const separator = value.type === "paragraph" || value.type === "heading" ? "" : "\n\n";
    return value.content.map(extract).join(separator);
  }
  return extract(doc);
}
