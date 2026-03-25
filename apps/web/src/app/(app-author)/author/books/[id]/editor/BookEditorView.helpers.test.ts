import { describe, expect, it } from "vitest";
import {
  countWordsInContent,
  formatAudiobookEta,
  getGeneratedCoverExtension,
  hasReadableContent,
  normalizeVisibility,
} from "./BookEditorView.helpers";

describe("BookEditorView helpers", () => {
  it("counts words from tiptap json content", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello brave new" },
            { type: "text", text: " world" },
          ],
        },
      ],
    });

    expect(countWordsInContent(content)).toBe(4);
    expect(hasReadableContent(content)).toBe(true);
  });

  it("falls back to plain text parsing when content is not json", () => {
    expect(countWordsInContent("one   two\nthree")).toBe(3);
    expect(hasReadableContent("   ")).toBe(false);
  });

  it("normalizes publish visibility safely", () => {
    expect(normalizeVisibility(" Public ")).toBe("public");
    expect(normalizeVisibility("FOLLOWERS")).toBe("followers");
    expect(normalizeVisibility("unknown")).toBeNull();
  });

  it("derives generated cover extension from content type before url", () => {
    expect(
      getGeneratedCoverExtension("image/jpeg", "https://cdn.example.com/cover.png")
    ).toBe("jpg");
    expect(
      getGeneratedCoverExtension(null, "https://cdn.example.com/cover.webp?sig=1")
    ).toBe("webp");
    expect(getGeneratedCoverExtension(undefined, "https://cdn.example.com/cover"))
      .toBe("png");
  });

  it("formats audiobook eta consistently", () => {
    expect(formatAudiobookEta(25)).toBe("Less than 1 min remaining");
    expect(formatAudiobookEta(120)).toBe("About 2 min remaining");
    expect(formatAudiobookEta(3900)).toBe("About 1h 5m remaining");
    expect(formatAudiobookEta(-1)).toBeNull();
  });
});
