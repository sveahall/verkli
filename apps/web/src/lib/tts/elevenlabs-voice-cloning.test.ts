import { describe, expect, it } from "vitest";
import { groupCharsIntoWords } from "./elevenlabs-voice-cloning";

describe("groupCharsIntoWords", () => {
  it("returns empty array for empty input", () => {
    expect(groupCharsIntoWords({})).toEqual([]);
  });

  it("groups simple characters into one word per whitespace-separated token", () => {
    const block = {
      characters: ["H", "i", " ", "y", "o", "u"],
      character_start_times_seconds: [0.00, 0.05, 0.10, 0.20, 0.25, 0.30],
      character_end_times_seconds: [0.05, 0.10, 0.20, 0.25, 0.30, 0.35],
    };
    const words = groupCharsIntoWords(block);
    expect(words).toEqual([
      { word: "Hi", start: 0.0, end: 0.1 },
      { word: "you", start: 0.2, end: 0.35 },
    ]);
  });

  it("preserves Swedish characters (å, ä, ö) within a word", () => {
    const block = {
      characters: ["S", "n", "ö", " ", "f", "a", "l", "l"],
      character_start_times_seconds: [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21],
      character_end_times_seconds: [0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24],
    };
    const words = groupCharsIntoWords(block);
    expect(words.map((w) => w.word)).toEqual(["Snö", "fall"]);
  });

  it("handles trailing punctuation by ending the word before the punctuation", () => {
    const block = {
      characters: ["Y", "o", "!", " ", "G", "o"],
      character_start_times_seconds: [0, 0.05, 0.10, 0.12, 0.15, 0.20],
      character_end_times_seconds: [0.05, 0.10, 0.12, 0.15, 0.20, 0.25],
    };
    const words = groupCharsIntoWords(block);
    expect(words).toEqual([
      { word: "Yo", start: 0.0, end: 0.10 },
      { word: "Go", start: 0.15, end: 0.25 },
    ]);
  });

  it("handles a single trailing word without a closing space", () => {
    const block = {
      characters: ["E", "n", "d"],
      character_start_times_seconds: [0, 0.05, 0.10],
      character_end_times_seconds: [0.05, 0.10, 0.15],
    };
    expect(groupCharsIntoWords(block)).toEqual([
      { word: "End", start: 0, end: 0.15 },
    ]);
  });
});
