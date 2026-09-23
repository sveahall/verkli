import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The language picker and the provider pair table are separate config. Today
// every listed language pairs with every other, so the unavailable branch never
// renders in production — which is exactly why it needs a test of its own: the
// day someone adds a language the providers do not cover, this is what readers
// of the picker are supposed to see instead of a checkbox that fails later.
vi.mock("@/lib/translation-pairs", () => ({
  isTranslationPairSupported: (_source: string, target: string) => target !== "ko",
  getProviderForPair: () => null,
}));

import { TranslateMoreLanguagesCard } from "./TranslatePanel.components";

describe("translation language picker without provider coverage", () => {
  it("offers an uncovered language as unavailable rather than selectable", () => {
    const html = renderToStaticMarkup(
      <TranslateMoreLanguagesCard sourceLanguage="en" selectedLanguages={new Set(["sv"])} onToggleLanguage={() => {}} />
    );
    expect(html).toContain("Not available");
    expect(html).toMatch(/disabled="" aria-label="Translate to Korean"/);
    // The source keeps its own wording, and a covered pair stays selectable.
    expect(html).toContain("Original language");
    expect(html).toMatch(/aria-label="Translate to Swedish" checked=""/);
  });
});
