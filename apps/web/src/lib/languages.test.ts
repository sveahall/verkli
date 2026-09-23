import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGE_CODES, LANGUAGE_OPTIONS, isSupportedLanguage, normalizeLanguage, normalizeLanguageOrNull, getLanguageLabel, getSeoLanguageLabel } from "./languages";
import { detectLanguageFromText } from "./language-detect";
import { getProviderForPair } from "./translation-pairs";

describe("documented v1 text languages", () => {
  it.each(["en", "es", "de", "fr", "pt", "it", "nl", "pl", "ja", "zh"])("accepts specification language %s without changing its edition identity", (language) => {
    expect(isSupportedLanguage(language)).toBe(true);
    expect(normalizeLanguage(language)).toBe(language);
    expect(normalizeLanguageOrNull(` ${language.toUpperCase()} `)).toBe(language);
  });
  it("preserves every previously offered language", () => {
    expect(SUPPORTED_LANGUAGE_CODES).toEqual(expect.arrayContaining(["en", "es", "fr", "de", "it", "pt", "sv", "ru", "zh", "ja", "ko", "ar"]));
  });
  it.each([["nl", "Dutch"], ["pl", "Polish"]])("uses the existing provider and explicit labels for %s", (language, label) => {
    expect(getProviderForPair("sv", language)).toBe("anthropic");
    expect(getProviderForPair(language, "en")).toBe("anthropic");
    expect(getLanguageLabel(language)).toBe(label);
    expect(getSeoLanguageLabel(language)).toBe(`in ${label}`);
    expect(LANGUAGE_OPTIONS.filter((option) => option.value === language)).toHaveLength(1);
  });
  it("keeps existing English and Swedish source heuristics unchanged", () => {
    expect(detectLanguageFromText("The book was in the room and it was on the table with the letter.")).toBe("en");
    expect(detectLanguageFromText("Det var en bok som låg på ett bord och det var inte min bok.")).toBe("sv");
  });
  it("still rejects unsupported language codes", () => { expect(isSupportedLanguage("xx")).toBe(false); expect(normalizeLanguageOrNull("xx")).toBeNull(); });
});
