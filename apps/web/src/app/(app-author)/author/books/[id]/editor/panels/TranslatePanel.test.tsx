import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("./TranslationCheckoutModal", () => ({ default: () => null }));
import TranslatePanel from "./TranslatePanel";
import { TranslateMoreLanguagesCard, TranslatePreviewPanes } from "./TranslatePanel.components";

const props: React.ComponentProps<typeof TranslatePanel> = {
  bookId: "book", bookTitle: "The harbour", authorDisplayName: "Mira", bookLengthLabel: "1 chapters",
  sourceLanguage: "en", sourceVersionId: "edition", chapters: [{ id: "chapter", title: "The crossing" }], selectedChapterId: "chapter",
};
const paneProps = { targetLanguage: "sv" as const, originalPreview: "The book opening.", translationPreview: "", loadingPreview: false, previewUnavailable: false, previewError: null, onRetry: vi.fn() };

describe("translation workspace", () => {
  it("keeps full book, chapter and batch actions distinct", () => {
    const html = renderToStaticMarkup(<TranslatePanel {...props} />);
    expect(html).toContain('aria-label="Translation scope"');
    expect(html).toContain('aria-pressed="true">Full book');
    expect(html).toContain('aria-pressed="false">Current chapter');
    expect(html).toContain("Translate selected languages");
    expect(html).toContain("1 chapter</span>");
  });
  it("discloses checkout before a paid action and keeps chapter-only controls Pro-only", () => {
    const html = renderToStaticMarkup(<TranslatePanel {...props} isProLocked />);
    expect(html).toContain("View translation options");
    expect(html).toContain("Review payment options before you start.");
    expect(html).not.toContain("Current chapter</button>");
  });
  it.each([{ billingLoading: true }, { sourceVersionId: null }])("disables submission until billing and a source exist: %o", (override) => {
    const html = renderToStaticMarkup(<TranslatePanel {...props} {...override} />);
    expect(html).toMatch(/disabled="">Translate book/);
    expect(html).toMatch(/disabled="">Translate selected languages/);
  });
  it("includes the default Swedish selection and allows removing it", () => {
    const html = renderToStaticMarkup(<TranslateMoreLanguagesCard sourceLanguage="en" selectedLanguages={new Set(["sv"])} onToggleLanguage={() => {}} />);
    expect(html).toMatch(/aria-label="Translate to Swedish" checked=""/);
    expect(html).not.toMatch(/disabled="" aria-label="Translate to Swedish"/);
    // The source is the only entry that cannot be a target, and it says so in
    // its own words. Every other listed language pairs with English, so nothing
    // here is "Not available" — that used to appear only because the picker
    // appended no/da/fi a second time as raw codes with no provider behind them.
    expect(html).toMatch(/aria-label="Translate to Danish"/);
    expect(html).toMatch(/aria-label="Translate to Polish"/);
    expect(html).toContain("Original language");
    expect(html).not.toContain("Not available");
  });

  it("shows retry for a failed preview while preserving the original", () => {
    const html = renderToStaticMarkup(<TranslatePreviewPanes {...paneProps} previewError="Couldn’t connect." />);
    expect(html).toContain("The book opening.");
    expect(html).toContain('role="alert">Couldn’t connect.');
    expect(html).toContain("Retry preview");
  });
  it("does not describe a failed preview as an empty manuscript", () => {
    const html = renderToStaticMarkup(<TranslatePreviewPanes {...paneProps} originalPreview="" previewError="Try again." />);
    expect(html).toContain("Your manuscript is safe.");
    expect(html).not.toContain("Add text in Write");
  });
  it("announces loading and labels the preview as an excerpt", () => {
    const html = renderToStaticMarkup(<TranslatePreviewPanes {...paneProps} loadingPreview />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Opening excerpt");
  });
  it("handles bidirectional manuscript text without rendering HTML", () => {
    const html = renderToStaticMarkup(<TranslatePreviewPanes {...paneProps} targetLanguage="ar" translationPreview={'<script>text</script>'} />);
    expect(html).toContain('dir="auto" lang="ar"');
    expect(html).toContain("&lt;script&gt;text&lt;/script&gt;");
  });
});
