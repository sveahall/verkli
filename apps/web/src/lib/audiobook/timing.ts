import { z } from "zod";

const wordSchema = z.object({
  word: z.string().min(1),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().nonnegative(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
});
const timingSchema = z.object({ sourceText: z.string().min(1).max(2_000_000), words: z.array(wordSchema).min(1).max(500_000) });
export type AudioTiming = z.infer<typeof timingSchema>;
export type TimedWord = AudioTiming["words"][number];

/** A removed title must end between segments; a partial word has no verified start time. */
export function canMapAudioTiming(timing: AudioTiming, visibleText: string, textOffset: number): boolean {
  return Number.isInteger(textOffset) && textOffset >= 0 &&
    timing.sourceText.slice(textOffset) === visibleText &&
    !timing.words.some((word) => word.startOffset < textOffset && word.endOffset > textOffset);
}

/** Fail closed: the complete narration must match, including punctuation and whitespace. */
export function parseAudioTiming(value: unknown): AudioTiming | null {
  const parsed = timingSchema.safeParse(value);
  if (!parsed.success) return null;
  const timing = parsed.data;
  let offset = 0;
  let end = 0;
  for (const word of timing.words) {
    if (word.start < end || word.end <= word.start || word.endOffset <= word.startOffset ||
        word.startOffset < offset || word.endOffset > timing.sourceText.length ||
        !/^\s*$/.test(timing.sourceText.slice(offset, word.startOffset)) ||
        timing.sourceText.slice(word.startOffset, word.endOffset) !== word.word) return null;
    offset = word.endOffset;
    end = word.end;
  }
  return /^\s*$/.test(timing.sourceText.slice(offset)) ? timing : null;
}

const alignmentSchema = z.object({
  characters: z.array(z.string().min(1)),
  character_start_times_seconds: z.array(z.number().finite().nonnegative()),
  character_end_times_seconds: z.array(z.number().finite().nonnegative()),
});

/** Only provider alignment for the exact original input is accepted; never estimate timestamps. */
export function alignmentToTiming(sourceText: string, value: unknown): AudioTiming | null {
  const parsed = alignmentSchema.safeParse(value);
  if (!parsed.success) return null;
  const { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends } = parsed.data;
  if (chars.join("") !== sourceText || starts.length !== chars.length || ends.length !== chars.length) return null;
  const startByOffset: number[] = [];
  const endByOffset: number[] = [];
  let offset = 0;
  for (let i = 0; i < chars.length; i++) {
    if (ends[i] < starts[i] || (i > 0 && starts[i] < ends[i - 1])) return null;
    for (let j = 0; j < chars[i].length; j++) {
      startByOffset[offset] = starts[i];
      endByOffset[offset++] = ends[i];
    }
  }
  const words = Array.from(sourceText.matchAll(/\S+/gu), (match) => ({
    word: match[0], start: startByOffset[match.index], end: endByOffset[match.index + match[0].length - 1],
    startOffset: match.index, endOffset: match.index + match[0].length,
  }));
  return parseAudioTiming({ sourceText, words });
}

/** Binary search always uses media time, so seeking/rate changes do not accumulate drift. */
export function activeWordAt(words: TimedWord[], seconds: number): TimedWord | null {
  if (!Number.isFinite(seconds)) return null;
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const word = words[mid];
    if (seconds < word.start) hi = mid - 1;
    else if (seconds >= word.end) lo = mid + 1;
    else return word;
  }
  return null;
}
