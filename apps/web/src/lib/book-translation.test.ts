import { describe, expect, it } from "vitest";
import { collectTranslationPreviewText, resolveTranslationSourceContext } from "./book-translation";

const document = (text: string) => JSON.stringify({
  type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

type Chapter = {
  content: string | null;
  source_text: string;
  deleted_at?: string | null;
};

function client(chapters: Chapter[], error: { message: string } | null = null) {
  return {
    from(table: string) {
      let rows = table === "chapters" ? chapters : [{ id: "edition", book_id: "book", language_code: null }];
      const query = {
        select: () => query,
        eq: () => query,
        is: () => { rows = chapters.filter((chapter) => !chapter.deleted_at); return query; },
        order: () => query,
        limit: () => query,
        update: () => query,
        maybeSingle: async () => ({ data: rows[0], error }),
        then: (resolve: (result: { data: typeof rows; error: typeof error }) => unknown) => resolve({ data: rows, error }),
      };
      return query;
    },
  };
}

describe("translation manuscript source", () => {
  it("previews the saved edit instead of the imported source snapshot", async () => {
    const result = await collectTranslationPreviewText(client([
      { content: document("Mira left the green letter."), source_text: "Mira left the blue letter." },
      { content: document("Jonas waited by the ferry."), source_text: "An earlier draft." },
    ]), "edition");

    expect(result).toBe("Mira left the green letter.\n\nJonas waited by the ferry.");
  });

  it.each([null, "", document("")])("does not resurrect old text when the saved manuscript is empty (%s)", async (content) => {
    expect(await collectTranslationPreviewText(client([
      { content, source_text: "Removed from the manuscript." },
    ]), "edition")).toBe("");
  });

  it("excludes deleted chapters and applies the word limit across remaining chapters", async () => {
    const result = await collectTranslationPreviewText(client([
      { content: "Deleted chapter", source_text: "Deleted chapter", deleted_at: "2026-09-20" },
      { content: "One two", source_text: "One two" },
      { content: "three four five", source_text: "three four five" },
    ]), "edition", 4);

    expect(result).toBe("One two\n\nthree four");
  });

  it("propagates a chapter read failure instead of returning a misleading preview", async () => {
    await expect(collectTranslationPreviewText(client([], { message: "Chapter read failed" }), "edition"))
      .rejects.toThrow("Chapter read failed");
  });

  it("detects missing edition language from current content, not the prior source language", async () => {
    const result = await resolveTranslationSourceContext({
      supabase: client([{
        content: document("Det är en bok som jag har på bordet och den är inte färdig än."),
        source_text: "The book is on the table and it was written for the reader in the morning.",
      }]),
      bookId: "book", book: {}, requestedSourceVersionId: "edition",
    });

    expect(result.sourceLanguage).toBe("sv");
    expect(result.sourceLanguageOrigin).toBe("heuristic");
  });

  it("reads past a short introduction when the edition language is unknown", async () => {
    const result = await resolveTranslationSourceContext({
      supabase: client([
        { content: document("Introduction"), source_text: "" },
        { content: document("Det är en bok som jag har på bordet och den är inte färdig än."), source_text: "" },
      ]),
      bookId: "book", book: { original_language: "und", language: "und" }, requestedSourceVersionId: "edition",
    });

    expect(result.sourceLanguage).toBe("sv");
    expect(result.sourceLanguageOrigin).toBe("heuristic");
  });
});
