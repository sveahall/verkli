import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ReviewPanel, { type ReviewPanelProps } from "./ReviewPanel";

vi.mock("./WholeBookAnalysisPanel", () => ({ default: () => null }));
vi.mock("./EditorialReviewPanel", () => ({ default: () => null }));

const props: ReviewPanelProps = {
  bookId: "book", bookTitle: "Book", chapters: [], bookVersions: [], activeVersion: null,
  coverImageUrl: null, audiobookStatus: null, isPublished: false, printOnDemandSettings: null,
  pricingModel: "free", priceAmountMinor: 0, priceCurrency: "SEK", marketingCampaigns: [],
  onNavigate: () => {}, onApplyReview: async () => "applied", saveBlocked: false,
};

describe("translation state in the publication review", () => {
  it.each([
    ["translation-claim:run-id", false],
    ["Translation review could not be completed.", true],
  ])("shows only genuine translation errors (%s)", (error, visible) => {
    const html = renderToStaticMarkup(<ReviewPanel {...props} bookVersions={[
      { id: "source", language_code: "sv", status: "draft" },
      { id: "target", language_code: "en", status: "translating", error_message: error },
    ]} />);
    expect(html.includes(">Error</span>")).toBe(visible);
  });
});
