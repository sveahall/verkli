import { MAX_AUTHOR_GUIDANCE_CHARS, MAX_PROFILE_SAMPLE_CHARS, MAX_QUALITY_SEGMENTS, MAX_QUALITY_SOURCE_CHARS } from "./ai/translation-quality/types";

export type TranslationQualityEstimate = { sourceChars: number; batchCount: number; maxCalls: number; estimatedCostUnits: number };
export const MAX_TRANSLATION_QUALITY_BATCHES = 200;
export const MAX_TRANSLATION_QUALITY_CALLS = 1 + MAX_TRANSLATION_QUALITY_BATCHES * 6;
export class TranslationQualityBudgetError extends Error {
  constructor(message: string) { super(message); this.name = "TranslationQualityBudgetError"; }
}

type ChapterInput = { title: string; content: string };
type ChapterPlan = { sourceChars: number; batches: Array<{ segmentOffset: number; texts: string[] }> };

/** Shared extraction and batching for reservation and execution; no model calls. */
export function prepareTranslationQualityChapter(input: ChapterInput) {
  const texts: string[] = [];
  const setters: Array<(text: string) => void> = [];
  let title = input.title;
  function add(text: string, set: (translation: string) => void) {
    if (!text.trim()) return;
    if (text.length > MAX_QUALITY_SOURCE_CHARS) throw new TranslationQualityBudgetError("A manuscript passage exceeds the 12,000-character review limit. Split this passage into smaller paragraphs and try again.");
    texts.push(text); setters.push(set);
  }
  add(title, (translated) => { title = translated; });
  let document: Record<string, unknown> | null = null;
  if (input.content.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(input.content);
      if (parsed && typeof parsed === "object" && typeof parsed.type === "string") document = parsed;
    } catch { /* Ordinary prose can begin with a brace. */ }
  }
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type === "text" && typeof node.text === "string") add(node.text, (translated) => { node.text = translated; });
    else if (Array.isArray(node.content)) node.content.forEach(visit);
  }
  const parts = document ? [] : input.content.split(/(\n{2,})/);
  if (document) visit(document);
  else parts.forEach((part, i) => add(part, (translated) => { parts[i] = translated; }));

  const batches: ChapterPlan["batches"] = [];
  let offset = 0;
  while (offset < texts.length) {
    let end = offset;
    let chars = 0;
    while (end < texts.length && end - offset < MAX_QUALITY_SEGMENTS && (end === offset || chars + texts[end].length <= 6000)) {
      chars += texts[end].length; end++;
    }
    batches.push({ segmentOffset: offset, texts: texts.slice(offset, end) });
    offset = end;
  }
  return {
    plan: { sourceChars: texts.reduce((sum, text) => sum + text.length, 0), batches },
    replaceSegment: (index: number, text: string) => setters[index](text),
    result: () => ({ title, content: document ? JSON.stringify(document) : parts.join("") }),
  };
}

export function planTranslationQualityChapter(input: ChapterInput): ChapterPlan {
  return prepareTranslationQualityChapter(input).plan;
}

// Conservative internal reservation units, not a token invoice or price quote.
// Keep these caps aligned with translation-quality/anthropic.ts. One profile
// has a 2500-token output cap; a batch can use translation 8000 + four reviews
// of 5000 + one revision of 8000 = 36000 output tokens across six calls.
const PROFILE_OUTPUT = 2500;
const DRAFT_OUTPUT = 8000;
const REVIEW_OUTPUT = 5000;
const REVISION_OUTPUT = 8000;
// Covers static instructions and the exact-key output schema at 80 segments.
// Adapter tests measure the real serialized prompt/schema against this bound.
export const TRANSLATION_QUALITY_FRAMING_UNITS_PER_CALL = 6000;

function jsonUnits(value: unknown): number {
  // UTF-8 bytes avoid assuming Latin prose's approximate four chars per token,
  // and include JSON escaping/segment framing sent with the source text.
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function guidanceUnits(authorGuidance?: string): number {
  if (authorGuidance !== undefined && (typeof authorGuidance !== "string" || authorGuidance.length > MAX_AUTHOR_GUIDANCE_CHARS)) {
    throw new TranslationQualityBudgetError("Author guidance exceeds the 2,000-character review limit.");
  }
  return jsonUnits(authorGuidance ?? "");
}

function estimate(batches: ChapterPlan["batches"], sourceChars: number, profileSourceUnits: number, authorGuidance?: string): TranslationQualityEstimate {
  const batchCount = batches.length;
  const maxCalls = 1 + batchCount * 6;
  if (!batchCount) throw new TranslationQualityBudgetError("Add manuscript text before requesting translation quality checks.");
  if (batchCount > MAX_TRANSLATION_QUALITY_BATCHES || maxCalls > MAX_TRANSLATION_QUALITY_CALLS) {
    throw new TranslationQualityBudgetError(`This translation requires too many review batches. Select fewer chapters: a job can use at most ${MAX_TRANSLATION_QUALITY_BATCHES} review batches (${MAX_TRANSLATION_QUALITY_CALLS} model calls including one correction round).`);
  }
  const guidance = guidanceUnits(authorGuidance);
  let estimatedCostUnits = profileSourceUnits + guidance + TRANSLATION_QUALITY_FRAMING_UNITS_PER_CALL + PROFILE_OUTPUT;
  for (const batch of batches) {
    const source = jsonUnits(batch.texts);
    const repeatedContext = 6 * (source + guidance + PROFILE_OUTPUT + TRANSLATION_QUALITY_FRAMING_UNITS_PER_CALL);
    // Draft appears in both initial reviews and the revision. Re-reviews see
    // the original untouched runs plus all replacement text, at most both caps.
    const repeatedGeneratedText = 3 * DRAFT_OUTPUT + 2 * REVIEW_OUTPUT + 2 * (DRAFT_OUTPUT + REVISION_OUTPUT);
    const maxOutput = DRAFT_OUTPUT + 4 * REVIEW_OUTPUT + REVISION_OUTPUT;
    estimatedCostUnits += repeatedContext + repeatedGeneratedText + maxOutput;
  }
  return { sourceChars, batchCount, maxCalls, estimatedCostUnits };
}

export function estimateTranslationQualityBook(chapters: Array<{ title: string | null; content: string | null }>, authorGuidance?: string): TranslationQualityEstimate {
  const plans = chapters.map((chapter) => planTranslationQualityChapter({ title: chapter.title ?? "", content: chapter.content ?? "" }));
  const sourceChars = plans.reduce((sum, plan) => sum + plan.sourceChars, 0);
  const batches = plans.flatMap((plan) => plan.batches);
  // Book sampling selects original excerpts once. Reserve up to its full UTF-8
  // sample limit, even when titles or source markup make this an overestimate.
  const profileSourceUnits = Math.min(sourceChars, MAX_PROFILE_SAMPLE_CHARS) * 4 + 2;
  return estimate(batches, sourceChars, profileSourceUnits, authorGuidance);
}
export function estimateTranslationQualitySample(texts: string[], authorGuidance?: string): TranslationQualityEstimate {
  if (!Array.isArray(texts) || !texts.length || texts.length > MAX_QUALITY_SEGMENTS ||
    !texts.every((text) => typeof text === "string") || !texts.some((text) => text.trim()) ||
    texts.reduce((sum, text) => sum + text.length, 0) > MAX_QUALITY_SOURCE_CHARS) {
    throw new TranslationQualityBudgetError("A quality sample must contain text, at most 80 segments and at most 12,000 characters.");
  }
  return estimate([{ segmentOffset: 0, texts }], texts.reduce((sum, text) => sum + text.length, 0), jsonUnits(texts.join("\n").slice(0, MAX_PROFILE_SAMPLE_CHARS)), authorGuidance);
}
export function translationQualityReservationKey(job: { id?: string | number; timestamp: number }): string {
  if (job.id === undefined || !String(job.id).trim() || !Number.isSafeInteger(job.timestamp) || job.timestamp < 0) {
    throw new TranslationQualityBudgetError("Translation queue metadata is missing a stable job ID or enqueue timestamp.");
  }
  // BullMQ preserves timestamp across retries but assigns a fresh enqueue
  // timestamp when a removed deterministic job ID is used again.
  return `translation-quality:${JSON.stringify([String(job.id), job.timestamp])}`;
}
