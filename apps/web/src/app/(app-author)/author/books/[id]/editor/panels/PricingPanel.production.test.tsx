import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishPanelProps } from "./PublishPanel";

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, toast: vi.fn(), refresh: vi.fn(), marketingEnabled: true }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === "function" ? initial() : initial;
    return [harness.slots[index], (value: unknown) => { harness.slots[index] = typeof value === "function" ? value(harness.slots[index]) : value; }];
  },
  useRef: (value: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: value };
    return harness.slots[index];
  },
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useId: () => "description-fixture",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: harness.refresh }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/toast", () => ({ useToastHelpers: () => ({ error: harness.toast }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => { throw new Error("Unexpected external save"); } }));
vi.mock("@/lib/flags", async (original) => ({
  ...await original<typeof import("@/lib/flags")>(),
  getMarketingEnabled: () => harness.marketingEnabled,
}));

import PricingPanel from "./PricingPanel";
import PublishPanel from "./PublishPanel";
import CoverPanel from "./CoverPanel";
import ReviewPanel from "./ReviewPanel";

type Element = React.ReactElement<Record<string, unknown>>;
function elements(node: React.ReactNode): Element[] {
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...React.Children.toArray(element.props.children as React.ReactNode).flatMap(elements)];
}
function text(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray((node as Element).props.children as React.ReactNode).map(text).join("");
}
function button(tree: React.ReactNode, label: string) {
  const found = elements(tree).find((element) => element.type === "button" && (text(element) === label || element.props["aria-label"] === label));
  expect(found, `button ${label}`).toBeDefined();
  return found!;
}
function click(element: Element) { (element.props.onClick as () => void)(); }
function render<T>(component: (props: T) => React.ReactNode, props: T) { harness.cursor = 0; return component(props); }
beforeEach(() => { harness.slots = []; harness.cursor = 0; harness.marketingEnabled = true; vi.clearAllMocks(); });

function pricingProps() {
  return {
    chapters: [], priceAmountMinor: 4900, setPriceAmountMinor: vi.fn(), priceCurrency: "SEK", setPriceCurrency: vi.fn(),
    pricingModel: "book_only" as const, setPricingModel: vi.fn(), pricingSaving: false, pricingDirty: true,
    pricingError: null, pricingSaved: false, handleSavePricing: vi.fn(), isPublished: false, stripeConfigured: true, currentVisibility: "public",
  };
}

describe("pricing decisions preserve saved-value callbacks", () => {
  it("keeps decimal input echo and passes the existing amount units to its parent", () => {
    const props = pricingProps();
    let tree = render(PricingPanel, props);
    const input = elements(tree).find((element) => element.props.id === "price-amount")!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "12," } });
    expect(props.setPriceAmountMinor).toHaveBeenCalledWith(1200);
    tree = render(PricingPanel, { ...props, priceAmountMinor: 1200 });
    expect(elements(tree).find((element) => element.props.id === "price-amount")!.props.value).toBe("12,");
    click(button(tree, "Save pricing"));
    expect(props.handleSavePricing).toHaveBeenCalledOnce();
  });
  it("prevents an invalid paid draft from saving, and Free clears the amount", () => {
    const props = pricingProps();
    const input = elements(render(PricingPanel, props)).find((element) => element.props.id === "price-amount")!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "abc" } });
    let tree = render(PricingPanel, props);
    expect(button(tree, "Save pricing").props.disabled).toBe(true);
    click(button(tree, "Save pricing"));
    expect(props.handleSavePricing).not.toHaveBeenCalled();
    const free = elements(tree).find((element) => element.type === "button" && text(element).startsWith("Free"))!;
    click(free);
    expect(props.setPriceAmountMinor).toHaveBeenCalledWith(0);
    tree = render(PricingPanel, { ...props, priceAmountMinor: 0 });
    expect(button(tree, "Save pricing").props.disabled).toBe(false);
  });
  it("retains chapter sales selection and makes the first chapter free", () => {
    const props = { ...pricingProps(), chapters: [{ id: "chapter", title: "Opening", content: "Text", order: 0, book_version_id: "edition" }] };
    const tree = render(PricingPanel, props);
    click(elements(tree).find((element) => element.type === "button" && text(element).startsWith("Per chapter"))!);
    expect(props.setPricingModel).toHaveBeenCalledWith("per_chapter");
    const chapterTree = render(PricingPanel, { ...props, pricingModel: "per_chapter" });
    expect(text(chapterTree)).toContain("OpeningFree");
  });
});

function publishProps(): PublishPanelProps {
  return {
    bookId: "book", bookTitle: "The harbour", bookDescription: "A description", authorDisplayName: "Alex", coverImageUrl: null,
    chapters: [{ id: "chapter", title: "Opening", content: "Text", order: 0, book_version_id: "edition" }], selectedChapterId: "chapter", bookVersions: [],
    isPublished: false, publishVisibility: "public", publishedChapterCount: 0, missingPublishRequirements: ["Ladda upp en omslagsbild", "Add at least one chapter", "Add a display name in your author profile"],
    publishDisabled: true, chapterPublishDisabled: true, selectedChapterAlreadyPublished: false, visibilityChanged: false, isPublishing: false, publishError: null,
    confirmPublishAction: null, confirmCopy: null, onVisibilityChange: vi.fn(), onPublishFull: vi.fn(), onPublishChapter: vi.fn(), onUpdateSettings: vi.fn(), onUnpublish: vi.fn(),
    onConfirm: vi.fn(), onCancelConfirm: vi.fn(), onChapterPublishToggle: vi.fn(), onSelectChapter: vi.fn(), onOpenCover: vi.fn(), onNavigate: vi.fn(),
  };
}

describe("publication readiness and confirmations", () => {
  it("routes missing requirements to cover, manuscript and author profile", () => {
    const props = publishProps();
    const tree = render(PublishPanel, props);
    click(button(tree, "Open cover"));
    click(button(tree, "Open manuscript"));
    expect(props.onOpenCover).toHaveBeenCalledOnce();
    expect(props.onNavigate).toHaveBeenCalledWith("edit");
    expect(elements(tree).find((element) => text(element) === "Open profile")?.props.href).toBe("/author/profile");
    click(button(tree, "Publish book"));
    expect(props.onPublishFull).not.toHaveBeenCalled();
    expect(button(tree, "Publish book").props["aria-disabled"]).toBe(true);
  });
  it("requires the existing confirmation callback after a release decision", () => {
    const props = { ...publishProps(), missingPublishRequirements: [], publishDisabled: false };
    click(button(render(PublishPanel, props), "Publish book"));
    expect(props.onPublishFull).toHaveBeenCalledOnce();
    expect(props.onConfirm).not.toHaveBeenCalled();
    const tree = render(PublishPanel, { ...props, confirmPublishAction: "publish", confirmCopy: "Make the book available?" });
    click(button(tree, "Confirm publication"));
    expect(props.onConfirm).toHaveBeenCalledOnce();
    click(button(tree, "Cancel"));
    expect(props.onCancelConfirm).toHaveBeenCalledOnce();
  });
  it("retains the unpublished-chapter sequence safeguard", () => {
    const props = { ...publishProps(), isPublished: true, chapters: [
      { id: "chapter-1", title: "Opening", content: "Text", order: 0, book_version_id: "edition" },
      { id: "chapter-2", title: "Later", content: "Text", order: 1, book_version_id: "edition" },
    ] };
    const drafts = elements(render(PublishPanel, props)).filter((element) => element.type === "button" && text(element) === "Draft");
    expect(drafts.map((element) => element.props.disabled)).toEqual([false, true]);
    click(drafts[0]);
    expect(props.onChapterPublishToggle).toHaveBeenCalledWith(props.chapters[0], true);
  });
  it("retains a failed description draft and offers retry without an external save", async () => {
    const save = vi.fn().mockRejectedValue(new Error("offline"));
    const props = { ...publishProps(), onSaveDescription: save };
    let tree = render(PublishPanel, props);
    (elements(tree).find((element) => element.type === "textarea")!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "Changed description" } });
    tree = render(PublishPanel, props);
    (elements(tree).find((element) => element.type === "textarea")!.props.onBlur as () => void)();
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith("Changed description"));
    tree = render(PublishPanel, props);
    expect(text(tree)).toContain("Your text is still here");
    expect(elements(tree).find((element) => element.type === "textarea")!.props.value).toBe("Changed description");
    save.mockResolvedValue(undefined);
    click(button(tree, "Retry save"));
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledOnce());
  });
  it("keeps the description readonly during a pending save and only acknowledges the saved draft", async () => {
    let complete!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    const props = { ...publishProps(), onSaveDescription: save };
    const textarea = (tree: React.ReactNode) => elements(tree).find((element) => element.type === "textarea")!;
    const change = (tree: React.ReactNode, value: string) => (textarea(tree).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    change(render(PublishPanel, props), "Submitted description");
    let tree = render(PublishPanel, props);
    (textarea(tree).props.onBlur as () => void)();
    tree = render(PublishPanel, props);
    expect(textarea(tree).props.readOnly).toBe(true);
    expect(textarea(tree).props.disabled).toBeUndefined();
    change(tree, "Text entered during pending save");
    expect(textarea(render(PublishPanel, props)).props.value).toBe("Submitted description");
    complete();
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledOnce());
    tree = render(PublishPanel, props);
    expect(textarea(tree).props.readOnly).toBe(false);
    expect(text(tree)).toContain("Description saved.");
    change(tree, "Next draft");
    tree = render(PublishPanel, props);
    expect(text(tree)).not.toContain("Description saved.");
    (textarea(tree).props.onBlur as () => void)();
    expect(save).toHaveBeenLastCalledWith("Next draft");
    complete();
  });
});

describe("cover artwork choices", () => {
  it("previews first, then calls the existing save handler only after Use as cover", () => {
    const noop = vi.fn();
    const select = vi.fn();
    const props: React.ComponentProps<typeof CoverPanel> = {
      coverInputRef: { current: null }, coverUploading: false, coverError: null, displayCoverUrl: null, coverDropActive: false, setCoverDropActive: noop,
      coverAIPrompt: "A harbour", setCoverAIPrompt: noop, coverAIStyle: "photo", setCoverAIStyle: noop, coverAIGeneratedUrls: ["/artwork.jpg"], coverAIGenerating: false,
      coverAIError: null, setCoverAIError: noop, coverCropSrc: null, setCoverCropSrc: noop, coverAIPreviewUrl: null, setCoverAIPreviewUrl: select, handleRemoveCover: noop,
      handleCropSave: async () => {}, handleCoverChange: noop, handleCoverDrop: noop, handleCoverAIGenerate: noop, handleCoverSetFromGenerated: noop,
      coverAITemplate: null, setCoverAITemplate: noop, coverAITemplateFields: {}, setCoverAITemplateFields: noop, coverEditorOpen: false, setCoverEditorOpen: noop,
      handleEditorSave: async () => {}, bookId: "book", bookTitle: "Harbour", authorName: "Alex",
    };
    click(button(render(CoverPanel, props), "Preview cover variation 1"));
    expect(select).toHaveBeenCalledWith("/artwork.jpg");
    expect(noop).not.toHaveBeenCalled();
    click(button(render(CoverPanel, { ...props, coverAIPreviewUrl: "/artwork.jpg" }), "Use as cover"));
    expect(props.handleCoverSetFromGenerated).toHaveBeenCalledWith("/artwork.jpg");
    expect(select).toHaveBeenLastCalledWith(null);
  });
});

describe("review marketing availability", () => {
  it.each([false, true])("only shows working marketing entries when the feature is enabled: %s", (enabled) => {
    harness.marketingEnabled = enabled;
    const onNavigate = vi.fn();
    const props: React.ComponentProps<typeof ReviewPanel> = {
      bookId: "book", bookTitle: "Harbour", chapters: [], bookVersions: [], activeVersion: null, coverImageUrl: null,
      audiobookStatus: null, isPublished: true, printOnDemandSettings: null, pricingModel: "book_only", priceAmountMinor: 0,
      priceCurrency: "SEK", marketingCampaigns: [], onNavigate, onApplyReview: async () => "", saveBlocked: false,
    };
    const tree = render(ReviewPanel, props);
    expect(elements(tree).some((element) => element.props.title === "Marketing · optional")).toBe(enabled);
    expect(elements(tree).some((element) => element.type === "button" && text(element) === "Promote")).toBe(enabled);
    if (enabled) {
      click(button(tree, "Promote"));
      click(button(tree, "Create first campaign"));
      expect(onNavigate.mock.calls).toEqual([["market"], ["market"]]);
    } else {
      expect(text(tree)).not.toContain("Create first campaign");
    }
  });
});
