import { describe, expect, it } from "vitest";
import { detectLanguageFromParts } from "./language-detect";
import { normalizeLanguage, normalizeLanguageOrNull } from "./languages";
import { chapterPlainText, resolveTranslationSourceContext } from "./book-translation";
import { isTranslationPairSupported } from "./translation-pairs";

describe("normalizeLanguageOrNull", () => {
  it("keeps an unspecified import language unknown", () => {
    expect(normalizeLanguageOrNull("und")).toBeNull();
    expect(normalizeLanguageOrNull("en-US")).toBe("en");
    expect(normalizeLanguageOrNull("sv_SE")).toBe("sv");
    expect(normalizeLanguageOrNull("nb-NO")).toBe("no");
    expect(normalizeLanguageOrNull("dansk")).toBe("da");
  });

  it("still shows a fallback label for an unknown code", () => {
    expect(normalizeLanguage("und")).toBe("en");
    expect(normalizeLanguage("sv-SE")).toBe("sv");
  });
});

describe("detectLanguageFromParts", () => {
  it("skips a short introduction and reads the next chapter", () => {
    const detected = detectLanguageFromParts([
      "Introduction",
      "The house was quiet and the night was long. She walked to the door and it was cold. She was there for the wind and the rain.",
    ]);
    expect(detected).toBe("en");
  });

  it("still recognizes Swedish and can tell Danish apart", () => {
    expect(detectLanguageFromParts([
      "Och det var inte så att hon är en av dem. Hon har ett hus på landet och det är för henne som det här är skrivet.",
    ])).toBe("sv");
    expect(detectLanguageFromParts([
      "Og jeg havde ikke af den slags. Hun blev hjemme og hun havde også nogle bøger. Det skal være sådan at jeg blev der.",
    ])).toBe("da");
  });

  it("can translate Swedish into the newly added languages", () => {
    for (const target of ["da", "no", "fi", "nl", "pl"]) {
      expect(isTranslationPairSupported("sv", target)).toBe(true);
    }
  });
});

describe("chapterPlainText", () => {
  it("uses TipTap content when source text is an empty string", () => {
    expect(chapterPlainText({
      source_text: "",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The door was open and the night was cold." }] }] },
    })).toContain("door was open");
  });
});

type Step = { data?: unknown; error?: { message: string } | null };

function client(steps: Record<string, Step[]>) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  return {
    updates,
    from(table: string) {
      const queue = steps[table] ?? [];
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        update(values: Record<string, unknown>) {
          updates.push({ table, values });
          return builder;
        },
        maybeSingle: async () => queue.shift(),
        then(resolve: (value: Step | undefined) => void, reject?: (reason: unknown) => void) {
          return Promise.resolve(queue.shift()).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const ENGLISH = "The house was quiet and the night was long. She walked to the door and it was cold. She was there for the wind and the rain.";

describe("resolveTranslationSourceContext", () => {
  it("detects English after an unknown language and a short first chapter", async () => {
    const db = client({
      book_versions: [
        { data: { id: "v1", book_id: "b1", language_code: "und" }, error: null },
        { error: null },
      ],
      chapters: [{ data: [{ source_text: "Introduction", content: null }, { source_text: ENGLISH, content: null }] }],
      books: [{ error: null }],
    });

    const result = await resolveTranslationSourceContext({
      supabase: db,
      bookId: "b1",
      book: { original_language: "und", language: "und" },
      requestedSourceVersionId: "v1",
    });

    expect(result.sourceLanguage).toBe("en");
    expect(result.sourceLanguageOrigin).toBe("heuristic");
    expect(db.updates).toEqual([
      { table: "book_versions", values: { language_code: "en" } },
      { table: "books", values: { original_language: "en", language: "en" } },
    ]);
  });

  it("does not let a requested language override a stored one", async () => {
    const db = client({
      book_versions: [{ data: { id: "v1", book_id: "b1", language_code: "sv" }, error: null }],
    });

    const result = await resolveTranslationSourceContext({
      supabase: db,
      bookId: "b1",
      book: { original_language: "sv", language: "sv" },
      requestedSourceVersionId: "v1",
      requestedSourceLanguage: "en",
    });

    expect(result.sourceLanguage).toBe("sv");
    expect(result.sourceLanguageOrigin).toBe("version");
    expect(db.updates).toEqual([]);
  });

  it("accepts the editor language when the manuscript cannot be detected", async () => {
    const db = client({
      book_versions: [
        { data: { id: "v1", book_id: "b1", language_code: "und" }, error: null },
        { error: null },
      ],
      chapters: [{ data: [{ source_text: "Hi", content: null }] }],
      books: [{ error: null }],
    });

    const result = await resolveTranslationSourceContext({
      supabase: db,
      bookId: "b1",
      book: { original_language: null, language: null },
      requestedSourceVersionId: "v1",
      requestedSourceLanguage: "en",
    });

    expect(result.sourceLanguage).toBe("en");
    expect(result.sourceLanguageOrigin).toBe("request");
  });
});
