import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionSettings } from "@/features/book-production/model";
import { localDraftSchema, productionDraftKey, readPrintArtwork, pendingProductionDraft, rememberProductionDraft } from "./browser-draft";

function draft() {
  const settings = createProductionSettings();
  const path = "preview/front-00000000-0000-4000-8000-000000000001.jpg";
  settings.cover.frontPath = path;
  return { settings, artwork: { front: { path, url: "data:image/png;base64,aGVsbG8=", width: 1800, height: 2400 } } };
}
describe("local production draft boundary", () => {
  it("restores bounded settings and the matching artwork metadata", () => {
    expect(localDraftSchema.safeParse(draft()).success).toBe(true);
    expect(localDraftSchema.safeParse({ settings: createProductionSettings(), artwork: {} }).success).toBe(true);
  });
  it.each([{ path: "../unrelated.jpg" }, { path: undefined }, { width: -5 }, { width: Infinity }, { height: NaN }, { width: 20000, height: 20000 }, { url: "https://example.com/picture.png" }, { url: "data:image/png;base64,not data" }, { privateMetadata: "unexpected" }])("rejects malformed artwork %j", (patch) => {
    const value = draft(); Object.assign(value.artwork.front, patch);
    expect(localDraftSchema.safeParse(value).success).toBe(false);
  });
  it("rejects artwork attached to another side or not referenced by the settings", () => {
    const value = draft(); value.settings.cover.frontPath = null;
    expect(localDraftSchema.safeParse(value).success).toBe(false);
    expect(localDraftSchema.safeParse({ settings: draft().settings, artwork: { back: draft().artwork.front } }).success).toBe(false);
  });
});


describe("edition draft isolation", () => {
  it("keeps drafts separate for each account, book and language edition", () => {
    const keys = [
      productionDraftKey("owner-a", "book-a", "sv"),
      productionDraftKey("owner-b", "book-a", "sv"),
      productionDraftKey("owner-a", "book-b", "sv"),
      productionDraftKey("owner-a", "book-a", "en"),
      productionDraftKey("owner:a", "book", "sv"),
      productionDraftKey("owner", "a:book", "sv"),
    ];
    const storage = new Map(keys.map((key, index) => [key, index]));
    expect(storage.size).toBe(keys.length);
    expect(storage.get(productionDraftKey("owner-a", "book-a", "sv"))).toBe(0);
  });
});

describe("print artwork input", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects unsupported and oversized files before attempting to decode", async () => {
    const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
    await expect(readPrintArtwork("front", { type: "image/svg+xml", size: 100 } as File)).rejects.toThrow("JPG or PNG");
    await expect(readPrintArtwork("back", { type: "image/png", size: 21 * 1024 * 1024 } as File)).rejects.toThrow("20 MB");
    expect(decode).not.toHaveBeenCalled();
  });
  it("reports a corrupt image without replacing the current artwork", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode failed")));
    await expect(readPrintArtwork("front", { type: "image/png", size: 100 } as File)).rejects.toThrow("could not be opened");
  });
  it("releases decoded resources and rejects oversized dimensions before base64 encoding", async () => {
    const close = vi.fn(); const reader = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 10000, height: 10000, close }));
    vi.stubGlobal("FileReader", reader);
    await expect(readPrintArtwork("front", { type: "image/png", size: 100 } as File)).rejects.toThrow("50 megapixels");
    expect(close).toHaveBeenCalledOnce(); expect(reader).not.toHaveBeenCalled();
  });
});


describe("navigation recovery", () => {
  it("recovers unsaved and incomplete edits without marking them saved", () => {
    const key = productionDraftKey("owner", "recover-test", "en");
    const savedSettings = createProductionSettings({ title: "Before" });
    const settings = { ...savedSettings, title: "", trimWidthMm: 0 };
    rememberProductionDraft(key, { settings, artwork: {}, savedSettings });
    expect(pendingProductionDraft(key)?.settings).toEqual(settings);
    expect(pendingProductionDraft(key)?.savedSettings.title).toBe("Before");
    expect(pendingProductionDraft(productionDraftKey("another-owner", "recover-test", "en"))).toBeUndefined();
    rememberProductionDraft(key, { settings: savedSettings, artwork: {}, savedSettings });
    expect(pendingProductionDraft(key)).toBeUndefined();
  });
});
