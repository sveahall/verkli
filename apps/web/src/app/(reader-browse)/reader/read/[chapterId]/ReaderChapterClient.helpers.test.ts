import { describe, expect, it } from "vitest";
import {
  getReaderPrefs,
  normalizeHighlights,
  parseHighlightRecord,
} from "./ReaderChapterClient.helpers";

describe("ReaderChapterClient helpers", () => {
  it("sorts highlights by start and end offsets", () => {
    const sorted = normalizeHighlights([
      {
        id: "b",
        startOffset: 12,
        endOffset: 16,
        snippet: "two",
        color: "green",
        note: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "a",
        startOffset: 2,
        endOffset: 8,
        snippet: "one",
        color: "yellow",
        note: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("parses persisted highlight rows into reader highlights", () => {
    expect(
      parseHighlightRecord({
        id: "highlight-1",
        start_offset: 4,
        end_offset: 14,
        snippet: "quoted text",
        color: "blue",
        note: "keep this",
        created_at: "2026-03-25T10:00:00.000Z",
        updated_at: "2026-03-25T10:05:00.000Z",
      })
    ).toEqual({
      id: "highlight-1",
      startOffset: 4,
      endOffset: 14,
      snippet: "quoted text",
      color: "blue",
      note: "keep this",
      createdAt: "2026-03-25T10:00:00.000Z",
      updatedAt: "2026-03-25T10:05:00.000Z",
    });

    expect(parseHighlightRecord({ id: "", start_offset: 1, end_offset: 2 })).toBeNull();
  });

  it("reads only numeric reader prefs from nested preferences", () => {
    expect(
      getReaderPrefs({
        reader: {
          settings: {
            fontSize: 18,
            lineHeight: 1.9,
            ignored: "value",
          },
        },
      })
    ).toEqual({
      settings: {
        fontSize: 18,
        lineHeight: 1.9,
      },
    });

    expect(getReaderPrefs({ reader: { settings: { fontSize: "18" } } })).toEqual({});
  });
});
