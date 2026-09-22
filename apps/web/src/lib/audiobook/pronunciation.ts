import { z } from "zod";

/** Proposed demo bound; production policy awaits the separate schema/product review. */
export const PROPOSED_MAX_PRONUNCIATION_RULES = 100;
const literal = (max: number) => z.string().min(1).max(max).refine((value) => value.trim().length > 0, "Enter a nonempty value.");
export const pronunciationRulesSchema = z.array(z.object({ word: literal(120), spokenAs: literal(200) }).strict())
  .max(PROPOSED_MAX_PRONUNCIATION_RULES, "The demo proposal allows up to 100 rules.")
  .refine((rules) => new Set(rules.map((rule) => rule.word)).size === rules.length, "Each written form must be unique.");
export type PronunciationRule = z.infer<typeof pronunciationRulesSchema>[number];
const scopeSchema = z.object({ ownerId: z.string().min(1), bookId: z.string().min(1), editionId: z.string().min(1) }).strict();
export type PronunciationScope = z.infer<typeof scopeSchema>;
const snapshotSchema = z.object({ scope: scopeSchema, revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), rules: pronunciationRulesSchema }).strict();
export type PronunciationSnapshot = z.infer<typeof snapshotSchema>;
export type PronunciationSaveResult = { kind: "saved" | "conflict"; snapshot: PronunciationSnapshot };
export type PronunciationAdapter = {
  load(scope: PronunciationScope): Promise<PronunciationSnapshot>;
  save(scope: PronunciationScope, expectedRevision: number, rules: PronunciationRule[]): Promise<PronunciationSaveResult>;
};
export function samePronunciationScope(a: PronunciationScope, b: PronunciationScope): boolean {
  return a.ownerId === b.ownerId && a.bookId === b.bookId && a.editionId === b.editionId;
}
export function parsePronunciationSnapshot(value: unknown, scope: PronunciationScope): PronunciationSnapshot {
  const snapshot = snapshotSchema.parse(value);
  if (!samePronunciationScope(snapshot.scope, scope)) throw new Error("Pronunciation response does not belong to this author and edition.");
  if (snapshot.revision === 0 && snapshot.rules.length) throw new Error("Unsaved pronunciation cannot contain stored rules.");
  return snapshot;
}

/** Earliest literal match wins; longest target wins ties. Replacements are never reprocessed. */
export function applyPronunciation(text: string, input: PronunciationRule[]) {
  const rules = pronunciationRulesSchema.parse(input).sort((a, b) => b.word.length - a.word.length);
  const matches: { start: number; end: number; word: string; spokenAs: string }[] = [];
  const output: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let start = -1;
    let chosen: PronunciationRule | undefined;
    for (const rule of rules) {
      const index = text.indexOf(rule.word, cursor);
      if (index !== -1 && (start === -1 || index < start)) { start = index; chosen = rule; }
    }
    if (!chosen) break;
    output.push(text.slice(cursor, start), chosen.spokenAs);
    cursor = start + chosen.word.length;
    matches.push({ start, end: cursor, ...chosen });
  }
  output.push(text.slice(cursor));
  return { text: output.join(""), matches };
}
