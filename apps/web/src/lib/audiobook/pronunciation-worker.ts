import { createHash } from "node:crypto";
import { z } from "zod";
import { applyPronunciation, parsePronunciationSnapshot } from "./pronunciation";

const inputSchema = z.object({
  scope: z.object({ ownerId: z.string().min(1), bookId: z.string().uuid(), editionId: z.string().uuid() }).strict(),
  snapshot: z.unknown(),
  originalText: z.string(),
  chapterId: z.string().min(1),
  voiceId: z.string().min(1),
  model: z.string().min(1),
  language: z.string().min(1),
}).strict();

/** Pure preparation only: intentionally not imported by live generation, cache or worker code. */
export function preparePronunciationJob(input: unknown, options: { enableForLocalTests?: true } = {}) {
  if (options.enableForLocalTests !== true) throw new Error("[audiobook pronunciation] Worker integration is disabled.");
  const parsed = inputSchema.parse(input);
  const validated = parsePronunciationSnapshot(parsed.snapshot, parsed.scope);
  const snapshot = Object.freeze({
    scope: Object.freeze({ ...validated.scope }),
    revision: validated.revision,
    rules: Object.freeze(validated.rules.map((rule) => Object.freeze({ ...rule }))),
  });
  // Code-unit ordering is independent of host locale and incoming rule order.
  const canonicalRules = [...snapshot.rules].sort((a, b) => a.word < b.word ? -1 : a.word > b.word ? 1 : 0);
  const cacheIdentity = createHash("sha256").update(JSON.stringify({
    version: 1,
    ownerId: snapshot.scope.ownerId,
    bookId: snapshot.scope.bookId,
    editionId: snapshot.scope.editionId,
    chapterId: parsed.chapterId,
    originalText: parsed.originalText,
    voiceId: parsed.voiceId,
    model: parsed.model,
    language: parsed.language,
    revision: snapshot.revision,
    rules: canonicalRules,
  })).digest("hex");
  const narrationText = applyPronunciation(parsed.originalText, canonicalRules).text;
  const narrationChanged = narrationText !== parsed.originalText;
  return Object.freeze({
    snapshot,
    originalText: parsed.originalText,
    narrationText,
    narrationChanged,
    chapterId: parsed.chapterId,
    voiceId: parsed.voiceId,
    model: parsed.model,
    language: parsed.language,
    cacheIdentity,
    // Changed narration needs verified alignment; this helper never invents timing.
    manuscriptTiming: null,
    manuscriptTimingReason: narrationChanged ? "narration-changed" as const : "not-provided" as const,
  });
}
