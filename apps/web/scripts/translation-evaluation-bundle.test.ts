import { describe, expect, it } from "vitest";
import { createEvaluationBundle } from "./fixtures/translation-evaluation-bundle";
import { planTranslationQualityChapter } from "../src/lib/translation-quality-budget";
describe("offline translation evaluation bundle", () => {
  it("covers the exact ten specification languages without claiming a quality result", () => {
    const bundle = createEvaluationBundle();
    expect(bundle.manifest.languages.filter((item) => item.specV1).map((item) => item.targetLanguage)).toEqual(["en", "es", "de", "fr", "pt", "it", "nl", "pl", "ja", "zh"]);
    for (const item of bundle.manifest.languages) { expect(item.machineStatus).toBe("not_run"); expect(item.humanStatus).toBe("not_reviewed"); expect(item.sourceLanguage).not.toBe(item.targetLanguage); }
    expect(bundle.manifest.providerCallsMade).toBe(0);
  });
  it("produces reproducible long books across real review batch boundaries", () => {
    const first = createEvaluationBundle(); const second = createEvaluationBundle();
    expect(first).toEqual(second);
    for (const manuscript of first.manuscripts) {
      expect(manuscript.chapters).toHaveLength(24);
      expect(manuscript.chapters.reduce((count, chapter) => count + chapter.content.length, 0)).toBeGreaterThan(250000);
      expect(new Set(manuscript.chapters.map((chapter) => chapter.title)).size).toBe(24);
      expect(planTranslationQualityChapter(manuscript.chapters[0]).batches.length).toBeGreaterThan(1);
    }
    expect(first.manifest.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
  });
});
