import { describe, expect, it } from "vitest";
import { buildPronunciationPreview } from "./pronunciation-preview";

describe("buildPronunciationPreview", () => {
  it("literally replaces a pronunciation target without regex interpretation", () => {
    expect(buildPronunciationPreview({ word: "a+b[0]", spokenAs: "alpha", sampleText: "Read a+b[0], then a+b[0]." })).toBe("Read alpha, then alpha.");
  });

  it("keeps a late target inside a centered 200-character spoken window", () => {
    const result = buildPronunciationPreview({ word: "Mira", spokenAs: "Mee-ra", sampleText: `${"Before. ".repeat(50)}Mira waited.` });
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result).toContain("Mee-ra waited.");
  });

  it("never cuts the spoken form even when it fills the whole preview", () => {
    const spokenAs = "x".repeat(200);
    expect(buildPronunciationPreview({ word: "Mira", spokenAs, sampleText: "Before Mira after." })).toBe(spokenAs);
  });

  it("does not split Unicode surrogate pairs at the window boundary", () => {
    const result = buildPronunciationPreview({ word: "Mira", spokenAs: "Mee-ra", sampleText: `${"🙂".repeat(180)}Mira` });
    expect(Array.from(result).length).toBeLessThanOrEqual(200);
    expect(result).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    expect(result).toContain("Mee-ra");
  });

  it("rejects a missing word, blank inputs and an overlong spoken form", () => {
    expect(() => buildPronunciationPreview({ word: "Mira", spokenAs: "Mee-ra", sampleText: "Another name." })).toThrow();
    expect(() => buildPronunciationPreview({ word: "", spokenAs: "Mee-ra", sampleText: "Mira waited." })).toThrow();
    expect(() => buildPronunciationPreview({ word: "Mira", spokenAs: " ", sampleText: "Mira waited." })).toThrow();
    expect(() => buildPronunciationPreview({ word: "Mira", spokenAs: "x".repeat(201), sampleText: "Mira waited." })).toThrow();
  });
});
