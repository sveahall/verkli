import { describe, expect, it } from "vitest";
import { createProductionSettings } from "@/features/book-production/model";
import { localDraftSchema } from "./local-draft";

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
