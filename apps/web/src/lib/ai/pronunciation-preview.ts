import { z } from "zod";
import { agentActionSchema } from "./agent-actions";

export const pronunciationRuleSchema = agentActionSchema.options[2].omit({ kind: true, reason: true });
export type PronunciationRule = z.infer<typeof pronunciationRuleSchema>;
const MAX_SPOKEN_CHARACTERS = 200;

/** Shared by the visible sample and TTS request; no manuscript text is changed. */
export function buildPronunciationPreview(rule: PronunciationRule): string {
  const { word, spokenAs, sampleText } = pronunciationRuleSchema.parse(rule);
  const targetIndex = sampleText.indexOf(word);
  if (targetIndex < 0) throw new Error("The pronunciation word is missing from the preview sample.");

  // split/join is literal, including words containing regex characters and aliases containing '$'.
  const spoken = Array.from(sampleText.split(word).join(spokenAs));
  const targetStart = Array.from(sampleText.slice(0, targetIndex)).length;
  const targetLength = Array.from(spokenAs).length;
  if (targetLength > MAX_SPOKEN_CHARACTERS) throw new Error("The spoken form is too long for a preview.");
  const contextBefore = Math.floor((MAX_SPOKEN_CHARACTERS - targetLength) / 2);
  const start = Math.max(0, Math.min(targetStart - contextBefore, spoken.length - MAX_SPOKEN_CHARACTERS));
  return spoken.slice(start, start + MAX_SPOKEN_CHARACTERS).join("");
}
