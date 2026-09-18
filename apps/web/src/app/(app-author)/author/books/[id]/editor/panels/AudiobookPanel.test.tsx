import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const previewPlayer = vi.hoisted(() => vi.fn(() => null));
vi.mock("./AudiobookPanel.components", () => ({ AudiobookPreviewPlayer: previewPlayer, AudiobookCheckoutModal: () => null }));
import AudiobookPanel from "./AudiobookPanel";

const props: React.ComponentProps<typeof AudiobookPanel> = {
  bookId: "book", bookLanguage: "en", bookOriginalLanguage: "en", chapters: [], selectedChapterId: null,
  activeVersion: { id: "swedish", book_id: "book", language_code: "sv", status: "draft" }, activeLanguage: "en",
  totalBookWordCount: 0, billingLoading: false, billingIsProActive: true, audiobookFeatureEnabled: true,
  isAudiobookActive: false, audiobookStatusUi: "idle", audiobookError: null, effectiveAudiobookProgress: null,
  effectiveAudiobookError: null, audiobookEtaText: null, audiobookScope: "book", setAudiobookScope: () => {},
  audiobookSelectedChapterIds: [], setAudiobookSelectedChapterIds: () => {}, isAudiobookChapterPickerOpen: false,
  setIsAudiobookChapterPickerOpen: () => {}, audiobookRequestedChapterIds: [], audiobookControlPending: null,
  canPauseAudiobook: false, canResumeAudiobook: false, canCancelAudiobook: false, handleAudiobookControl: async () => {},
  handleGenerateAudiobook: async () => {}, audiobookSelectedLanguages: [], setAudiobookSelectedLanguages: () => {},
  audiobookCheckoutModalOpen: false, setAudiobookCheckoutModalOpen: () => {}, audiobookCheckoutLoading: false,
  handleAudiobookCheckout: async () => {}, shouldShowGeneratedAudiobookPlayer: false,
  fallbackGeneratedAudiobookUrl: null, latestAudiobookManifestUrl: null,
};

describe("Audiobook edition navigation", () => {
  it("passes the selected edition into the voice preview request", () => {
    renderToStaticMarkup(<AudiobookPanel {...props} />);
    expect(previewPlayer).toHaveBeenLastCalledWith(expect.objectContaining({ bookId: "book", versionId: "swedish" }), undefined);
  });
  it.each(["edit", "translate"])("keeps the active Swedish edition when opening %s", (panel) => {
    const html = renderToStaticMarkup(<AudiobookPanel {...props} />);
    expect(html).toContain(`href="/author/books/book?panel=${panel}&amp;lang=sv"`);
  });
  it("keeps the selected language before its version is loaded", () => {
    const html = renderToStaticMarkup(<AudiobookPanel {...props} activeVersion={null} activeLanguage="de" />);
    expect(html).toContain('href="/author/books/book?panel=translate&amp;lang=de"');
  });
});
