import { describe, expect, it } from "vitest";

import { assertTranslationSegments, runTranslationQuality, TranslationQualityError, type QualityDependencies, type RevisionInput } from "./pipeline";
import { MAX_QUALITY_SOURCE_CHARS, type AuthorProfile } from "./types";

const profile: AuthorProfile = {
  voice: "Spare and uneasy", rhythm: "Intentional repetition and fragments",
  dialogue: "Abrupt", preserve: ["Repetition", "Proper nouns"], glossary: [],
};
const input = { texts: ["Hon väntar.", "Igen. Igen."], sourceLanguage: "sv", targetLanguage: "en" };
const translations = ["She waits.", "Again. Again."];
const usage = { inputTokens: 10, outputTokens: 5 };
const issue = {
  severity: "major", segment: 1, sourceQuote: "Igen. Igen.", targetQuote: "Again.",
  explanation: "The deliberate repetition was removed.", suggestion: "Restore the repeated word.",
};
const clean = { reviewedSegments: [0, 1], issues: [] };

function dependencies(overrides: Partial<QualityDependencies> = {}): QualityDependencies {
  return {
    profile: async () => ({ data: profile, usage }),
    translate: async () => ({ data: translations, usage }),
    review: async () => ({ data: clean, usage }),
    revise: async () => ({ data: [{ segment: 1, translation: "Again. Again." }], usage }),
    ...overrides,
  };
}

describe("runTranslationQuality", () => {
  it("profiles once and requires separate complete fidelity and style reviews", async () => {
    const calls: string[] = [];
    const result = await runTranslationQuality(input, dependencies({
      profile: async () => { calls.push("profile"); return { data: profile, usage }; },
      review: async (role) => { calls.push(role); return { data: clean, usage }; },
      revise: async () => { throw new Error("Clean drafts must not be revised"); },
    }));
    expect(calls).toEqual(["profile", "fidelity", "style"]);
    expect(result.translations).toEqual(translations);
    expect(result.report).toMatchObject({ status: "checks_passed", revisionCount: 0, reviewRounds: 1, profile, usage: { inputTokens: 40, outputTokens: 20 } });
  });

  it("uses a supplied profile without generating a second profile", async () => {
    const result = await runTranslationQuality({ ...input, profile }, dependencies({
      profile: async () => { throw new Error("Must reuse the profile"); },
    }));
    expect(result.report.usage.inputTokens).toBe(30);
  });

  it("preserves formatting-run boundary whitespace before the reviewers inspect it", async () => {
    const result = await runTranslationQuality({ ...input, texts: ["Hon ", " väntar.\n", "\t"] }, dependencies({
      translate: async () => ({ data: ["She", "waits.", ""], usage }),
      review: async (_role, args) => {
        expect(args.translations).toEqual(["She ", " waits.\n", "\t"]);
        return { data: { reviewedSegments: [0, 1, 2], issues: [] }, usage };
      },
    }));
    expect(result.translations).toEqual(["She ", " waits.\n", "\t"]);
  });

  it("performs exactly one targeted revision, re-reviews both roles and retains unresolved major issues", async () => {
    let revision: RevisionInput | undefined;
    let reviews = 0;
    const result = await runTranslationQuality(input, dependencies({
      translate: async () => ({ data: [translations[0], "Again."], usage }),
      review: async (role) => {
        reviews++;
        return { data: role === "style" ? { ...clean, issues: [issue] } : clean, usage };
      },
      revise: async (args) => { revision = args; return { data: [{ segment: 1, translation: "Again. Again." }], usage }; },
    }));
    expect(revision?.segments).toEqual([1]);
    expect(revision?.issues).toEqual([{ ...issue, reviewer: "style" }]);
    expect(result.translations).toEqual(translations);
    expect(reviews).toBe(4);
    expect(result.report).toMatchObject({ status: "needs_review", revisionCount: 1, reviewRounds: 2, usage: { inputTokens: 70, outputTokens: 35 } });
  });

  it("does not revise minor issues but keeps them visible with the role assigned by code", async () => {
    const result = await runTranslationQuality(input, dependencies({
      review: async (role) => ({ data: role === "style" ? { ...clean, issues: [{ ...issue, severity: "minor", reviewer: "fidelity" }] } : clean, usage }),
      revise: async () => { throw new Error("Do not polish minor differences"); },
    }));
    expect(result.report.status).toBe("checks_passed");
    expect(result.report.issues[0]).toMatchObject({ reviewer: "style", severity: "minor" });
    expect(result.report.revisionCount).toBe(0);
  });

  it("allows a corrected draft only after both re-reviews succeed", async () => {
    let revised = false;
    const result = await runTranslationQuality(input, dependencies({
      translate: async () => ({ data: [translations[0], "Again."], usage }),
      review: async (role) => ({ data: !revised && role === "style" ? { ...clean, issues: [issue] } : clean, usage }),
      revise: async () => { revised = true; return { data: [{ segment: 1, translation: "Again. Again." }], usage }; },
    }));
    expect(result.report).toMatchObject({ status: "checks_passed", revisionCount: 1, reviewRounds: 2, issues: [] });
  });

  it.each([
    { reviewedSegments: [0], issues: [] },
    { reviewedSegments: [0, 0], issues: [] },
    { reviewedSegments: [0, 1, 2], issues: [] },
    { reviewedSegments: [0, 1] },
    { ...clean, issues: [{ ...issue, sourceQuote: "Invented original" }] },
    { ...clean, issues: [{ ...issue, targetQuote: "Invented translation" }] },
    { ...clean, issues: [{ ...issue, segment: 2 }] },
    { ...clean, issues: [{ ...issue, sourceQuote: "" }] },
  ])("fails closed on malformed, incomplete or unanchored review %#", async (data) => {
    await expect(runTranslationQuality(input, dependencies({ review: async () => ({ data, usage }) })))
      .rejects.toMatchObject({ name: "TranslationQualityError", code: "INVALID_REVIEW" });
  });

  it("uses a safe failure when a reviewer is unavailable without echoing manuscript text", async () => {
    await expect(runTranslationQuality(input, dependencies({ review: async () => { throw new Error("SECRET MANUSCRIPT in SDK error"); } })))
      .rejects.toMatchObject({ name: "TranslationQualityError", code: "REVIEW_UNAVAILABLE", message: "Translation quality review is unavailable. Please try again." });
  });

  it("rejects revisions to unflagged segments", async () => {
    await expect(runTranslationQuality(input, dependencies({
      review: async () => ({ data: { ...clean, issues: [issue] }, usage }),
      revise: async () => ({ data: [{ segment: 0, translation: "A different voice." }, { segment: 1, translation: "Again. Again." }], usage }),
    }))).rejects.toMatchObject({ code: "INVALID_REVISION" });
  });

  it.each([[], [{ segment: 1, translation: "" }], [{ segment: 1, translation: "Again." }, { segment: 1, translation: "Again." }]].map((data) => ({ data })))("rejects missing, empty or duplicate targeted revisions %#", async ({ data }) => {
    await expect(runTranslationQuality(input, dependencies({
      review: async () => ({ data: { ...clean, issues: [issue] }, usage }),
      revise: async () => ({ data, usage }),
    }))).rejects.toBeInstanceOf(TranslationQualityError);
  });

  it.each([{ ...profile, voice: "" }, { ...profile, rhythm: "a".repeat(1001) }, { ...profile, glossary: [{ source: "Missing character", target: "Name" }] }])("rejects malformed or unanchored generated profiles %#", async (data) => {
    await expect(runTranslationQuality(input, dependencies({ profile: async () => ({ data, usage }) })))
      .rejects.toMatchObject({ code: "INVALID_PROFILE" });
  });

  it("rejects oversized inputs before calling a provider", async () => {
    await expect(runTranslationQuality({ ...input, texts: ["a".repeat(MAX_QUALITY_SOURCE_CHARS + 1)] }, dependencies()))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("stops before any call when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runTranslationQuality({ ...input, signal: controller.signal }, dependencies()))
      .rejects.toMatchObject({ code: "CANCELLED" });
  });
});

describe("assertTranslationSegments", () => {
  it.each([[], ["She waits."], ["She waits.", ""], ["She waits.", "  "], ["She waits.", 1], null].map((target) => ({ target })))("rejects invalid counts or empty nonempty-source translations %#", ({ target }) => {
    expect(() => assertTranslationSegments(input.texts, target)).toThrow(TranslationQualityError);
  });

  it("accepts segment structure and whitespace-only source runs", () => {
    expect(() => assertTranslationSegments(["Hon", " ", "väntar."], ["She", " ", "waits."])).not.toThrow();
  });

  it("rejects inserted content in empty source runs", () => {
    expect(() => assertTranslationSegments([" "], ["Invented content"])).toThrow(TranslationQualityError);
  });

  it("rejects oversized output before any review request", () => {
    expect(() => assertTranslationSegments(["Hej"], ["a".repeat(MAX_QUALITY_SOURCE_CHARS * 4 + 1)])).toThrow(TranslationQualityError);
  });
});

it("waits for the other paid reviewer to settle before returning a failure", async () => {
  let finish!: () => void;
  const delayed = new Promise<void>((resolve) => { finish = resolve; });
  let settled = false;
  const pending = runTranslationQuality(input, dependencies({ review: async (role) => {
    if (role === "fidelity") throw new Error("review failed");
    await delayed;
    return { data: clean, usage };
  } })).catch(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(settled).toBe(false);
  finish(); await pending;
  expect(settled).toBe(true);
});
