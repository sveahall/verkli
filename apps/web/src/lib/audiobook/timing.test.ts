import { describe, expect, it } from "vitest";
import { alignmentToTiming, activeWordAt, parseAudioTiming } from "./timing";

const text = "Hej, 😀 igen!";
const chars = Array.from(text);
const alignment = { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.2), character_end_times_seconds: chars.map((_, i) => i * 0.2 + 0.1) };

describe("provider audio timing", () => {
  it("preserves exact UTF-16 text offsets and provider seconds", () => {
    const timing = alignmentToTiming(text, alignment)!;
    expect(timing.words[2]).toEqual({ word: "igen!", start: 7 * 0.2, end: 11 * 0.2 + 0.1, startOffset: 8, endOffset: 13 });
    expect(parseAudioTiming(timing)).toEqual(timing);
  });
  it("clears the word during silence and after audio, and supports backward seeking", () => {
    const timing = alignmentToTiming(text, alignment)!;
    expect(activeWordAt(timing.words, 1.6)?.word).toBe("igen!");
    expect(activeWordAt(timing.words, 0)?.word).toBe("Hej,");
    expect(activeWordAt(timing.words, 0.9)).toBeNull();
    expect(activeWordAt(timing.words, 30)).toBeNull();
    expect(activeWordAt(timing.words, NaN)).toBeNull();
  });
  it.each([
    { ...alignment, characters: ["wrong"] },
    { ...alignment, character_start_times_seconds: [] },
    { ...alignment, character_end_times_seconds: chars.map(() => NaN) },
    { ...alignment, character_start_times_seconds: chars.map(() => -1) },
    { ...alignment, character_end_times_seconds: chars.map(() => 0) },
  ])("refuses missing, guessed, normalized or malformed alignment %#", (value) => {
    expect(alignmentToTiming(text, value)).toBeNull();
  });
  it("refuses incomplete text coverage or altered offsets in stored timing", () => {
    const timing = alignmentToTiming(text, alignment)!;
    expect(parseAudioTiming({ ...timing, words: timing.words.slice(1) })).toBeNull();
    expect(parseAudioTiming({ ...timing, sourceText: "Other edition" })).toBeNull();
  });
});
