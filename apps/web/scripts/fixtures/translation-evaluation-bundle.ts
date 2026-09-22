import { createHash } from "node:crypto";
import { EVALUATION_CASES } from "../../src/lib/ai/translation-quality/evaluation-corpus";
import { SUPPORTED_LANGUAGE_CODES, isSupportedLanguage } from "../../src/lib/languages";
import { isTranslationPairSupported } from "../../src/lib/translation-pairs";
import { estimateTranslationQualityBook } from "../../src/lib/translation-quality-budget";

const SPEC_V1 = ["en", "es", "de", "fr", "pt", "it", "nl", "pl", "ja", "zh"];
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function longManuscript(language: "sv" | "en") {
  const prose = language === "sv"
    ? "Mira hade inte öppnat brevet. Det låg under den blå koppen, där Aron hade lagt det på hennes begäran. Den sista färjan gick klockan sex, men hon skulle inte följa med. Ett steg. Ett steg. Sedan stilla. Hon mindes att nyckeln till förrådet tillhörde Lea, inte Aron. När klockan slog igen flyttade hon bara koppen. Brevet låg kvar. Ingen i rummet sa att väntan var över."
    : "Mira had not opened the letter. It lay under the blue cup, where Aron had put it because she asked him to. The last ferry left at six, but she would not be on it. One step. One step. Then stillness. She remembered that the key to the storehouse belonged to Lea, not Aron. When the clock struck again, she moved only the cup. The letter stayed where it was. Nobody in the room said the waiting was over.";
  return { id: `structural-long-${language}-v1`, language, purpose: "synthetic structural stress only; repeated prose is not a literary benchmark", chapters: Array.from({ length: 24 }, (_, chapter) => ({
    title: `${language === "sv" ? "Kapitel" : "Chapter"} ${chapter + 1} [C${String(chapter + 1).padStart(2, "0")}]`,
    content: Array.from({ length: 40 }, (_, paragraph) => `[C${chapter + 1}P${paragraph + 1}] ${prose}`).join("\n\n"),
  })) };
}

/** No provider imports, credentials, network, database, or live execution mode. */
export function createEvaluationBundle() {
  const manuscripts = (["sv", "en"] as const).map(longManuscript);
  const literarySources = (["sv", "en"] as const).map((language) => ({
    id: `literary-fragments-${language}-v1`, language,
    purpose: "original short literary risk passages; labels need bilingual human calibration",
    passages: [...new Set(EVALUATION_CASES.filter((sample) => sample.sourceLanguage === language).flatMap((sample) => sample.texts))],
  }));
  const targets = [...new Set([...SPEC_V1, ...SUPPORTED_LANGUAGE_CODES])];
  const languages = targets.map((targetLanguage) => ({
    targetLanguage, sourceLanguage: targetLanguage === "sv" ? "en" : "sv", specV1: SPEC_V1.includes(targetLanguage),
    textSelectable: isSupportedLanguage(targetLanguage), providerRoutingAvailable: isTranslationPairSupported(targetLanguage === "sv" ? "en" : "sv", targetLanguage),
    machineStatus: "not_run", humanStatus: "not_reviewed", audioStatus: "not_evaluated",
    shortSourceId: `literary-fragments-${targetLanguage === "sv" ? "en" : "sv"}-v1`,
    longSourceId: `structural-long-${targetLanguage === "sv" ? "en" : "sv"}-v1`,
  }));
  const manifest = {
    formatVersion: 1, corpusVersion: "translation-evaluation-20260922-v1", providerCallsMade: 0,
    spec: "Verkli Erbjudande Fredrik 2026-07-29.docx; Bilaga 1; 3.2.1; paragraph 128",
    languages,
    sources: [...manuscripts, ...literarySources].map((source) => ({ id: source.id, sha256: sha256(source), origin: "original synthetic repository fixtures; no customer manuscript", purpose: source.purpose })),
    structuralPlans: manuscripts.map((manuscript) => ({ sourceId: manuscript.id, chapterCount: manuscript.chapters.length, ...estimateTranslationQualityBook(manuscript.chapters), note: "Offline planner output, internal reservation units only; no currency quote or authorization" })),
    humanAcceptance: { criticalRemaining: 0, majorRemaining: 0, minimumEachScore: 4, maximumScore: 5, dimensions: ["fidelity", "idiom", "voice", "rhythm", "dialogue", "continuity"], independentBilingualReviewerRequired: true },
  };
  const reviewSheets = languages.map((language) => ({
    ...language, reviewer: null, reviewedAt: null, languageVariant: null, sourceSha256: null, targetSha256: null, model: null, promptVersion: null, rubricVersion: null,
    scores: Object.fromEntries(manifest.humanAcceptance.dimensions.map((dimension) => [dimension, null])),
    findings: [], decision: "not_reviewed", actualUsage: null, actualCost: null,
  }));
  return { manifest, manuscripts, literarySources, reviewSheets };
}
