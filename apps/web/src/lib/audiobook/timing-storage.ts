import { createHash } from "node:crypto";
import { z } from "zod";
import { parseAudioTiming, type AudioTiming } from "./timing";

export type TimingIdentity = { chapterId: string; bookVersionId: string; audioPath: string; sourceText: string };
const sidecarSchema = z.object({ version: z.literal(1), chapterId: z.string(), bookVersionId: z.string(), audioPath: z.string(), timing: z.unknown() });

/** Existing cache filenames remain readable; new files cannot overwrite another voice's bytes. */
export function audioObjectHash(audio: Buffer, sourceText: string): string {
  return createHash("sha256").update(audio).update("\0").update(sourceText).digest("hex").slice(0, 16);
}

export function parseTimingSidecar(value: unknown, identity: TimingIdentity): AudioTiming | null {
  const parsed = sidecarSchema.safeParse(value);
  if (!parsed.success) return null;
  const data = parsed.data;
  if (data.audioPath !== identity.audioPath || data.chapterId !== identity.chapterId || data.bookVersionId !== identity.bookVersionId) return null;
  const timing = parseAudioTiming(data.timing);
  return timing?.sourceText === identity.sourceText ? timing : null;
}
