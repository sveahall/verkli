import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGE_CODES } from "./languages";
import { getProviderForPair, isTranslationPairSupported } from "./translation-pairs";

describe("translation pairs", () => {
  it("offers every supported language except the source itself", () => {
    for (const source of SUPPORTED_LANGUAGE_CODES) {
      for (const target of SUPPORTED_LANGUAGE_CODES) {
        expect(isTranslationPairSupported(source, target)).toBe(source !== target);
        expect(getProviderForPair(source, target)).toBe(source === target ? null : "anthropic");
      }
    }
  });

  it("rejects a language the app does not offer", () => {
    expect(isTranslationPairSupported("en", "xx")).toBe(false);
    expect(getProviderForPair("sv", "xx")).toBeNull();
  });
});
