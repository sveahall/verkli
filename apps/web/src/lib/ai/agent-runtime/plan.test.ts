import { describe, expect, it } from "vitest";
import { chapterSchema } from "@/lib/tiptap-schema";
import { hashChapterContent, type AgentBook, type AgentChapter } from "./book-context";
import { MatchRegistry, searchBook, listChapters, readChapter } from "./read-tools";
import { PlanBuilder, PlanRejection, summarisePlan } from "./plan";

const CHAPTER_ONE = "00000000-0000-4000-8000-000000000001";
const CHAPTER_TWO = "00000000-0000-4000-8000-000000000002";
const VERSION = "00000000-0000-4000-8000-0000000000ff";

function chapter(id: string, order: number, title: string, paragraphs: string[]): AgentChapter {
  const json = {
    type: "doc",
    content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  };
  return {
    id, order, title,
    hash: hashChapterContent(JSON.stringify(json)),
    updatedAt: "2026-09-22T10:00:00Z",
    versionNumber: 1,
    doc: chapterSchema.nodeFromJSON(json),
    unreadable: null,
  };
}

function book(): AgentBook {
  return {
    bookId: "00000000-0000-4000-8000-00000000000b",
    versionId: VERSION,
    bookTitle: "Inget kan stoppa",
    chapters: [
      chapter(CHAPTER_ONE, 1, "Hamnen", ["Johan gick ner till kajen.", "JOHAN! ropade hon.", "Hon väntade. Hon väntade länge."]),
      chapter(CHAPTER_TWO, 2, "Färjan", ["Johans väska stod kvar.", "Sedan kom johan tillbaka."]),
    ],
  };
}

function search(target: AgentBook, registry: MatchRegistry, query: string, options = {}) {
  return JSON.parse(searchBook(target, registry, { query, ...options })) as {
    total: number;
    matches: { id: string; text: string; chapterId: string; context: string }[];
  };
}

describe("search_book", () => {
  it("finds every casing across every chapter and hands back quotable ids", () => {
    const registry = new MatchRegistry();
    const result = search(book(), registry, "johan");
    expect(result.total).toBe(4);
    expect(result.matches.map((match) => match.text)).toEqual(["Johan", "JOHAN", "Johan", "johan"]);
    expect(result.matches.map((match) => match.id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(result.matches[0].context).toContain("«Johan»");
    // The third match is the one inside "Johans". What comes back is the five
    // characters that matched, not the word they sit in — so the surrounding
    // text is the only thing that tells the model, and later the author, that
    // replacing it with "Jonas" would read "Jonass".
    expect(result.matches[2].context).toBe("«Johan»s väska stod kvar.");
  });

  it("excludes the inflected form when whole words are asked for", () => {
    // "Johans" is a longer word, so the author's rule — inflections are a
    // separate decision — starts here, at the search.
    const result = search(book(), new MatchRegistry(), "johan", { wholeWord: true });
    expect(result.matches.map((match) => match.text)).toEqual(["Johan", "JOHAN", "johan"]);
  });

  it("pins each match to the chapter text it was measured against", () => {
    const registry = new MatchRegistry();
    const target = book();
    search(target, registry, "johan");
    expect(registry.get("m1")?.chapterHash).toBe(target.chapters[0].hash);
    expect(registry.get("m3")?.chapterHash).toBe(target.chapters[1].hash);
  });
});

describe("list_chapters and read_chapter", () => {
  it("lists without prose and reads a named chapter", () => {
    const target = book();
    const listed = JSON.parse(listChapters(target));
    expect(listed.chapters).toEqual([
      { chapterId: CHAPTER_ONE, order: 1, title: "Hamnen", words: 13 },
      { chapterId: CHAPTER_TWO, order: 2, title: "Färjan", words: 8 },
    ]);
    expect(JSON.stringify(listed)).not.toContain("kajen");
    expect(JSON.parse(readChapter(target, { chapterId: CHAPTER_ONE })).text).toContain("kajen");
  });

  it("answers an unknown chapter id with something the model can act on", () => {
    expect(JSON.parse(readChapter(book(), { chapterId: VERSION })).error).toMatch(/list_chapters/);
  });
});

describe("PlanBuilder", () => {
  function planner(target = book()) {
    const registry = new MatchRegistry();
    search(target, registry, "johan");
    return { target, registry, builder: new PlanBuilder(target, registry) };
  }

  it("records a replacement without touching anything, and carries casing per match", () => {
    const { builder, target } = planner();
    const acknowledgement = JSON.parse(builder.record("replace_in_book", {
      matchIds: ["m1", "m2", "m4"],
      optionalMatchIds: ["m3"],
      replacement: "Jonas",
      reason: "The author renamed the character.",
    }));

    expect(acknowledgement).toEqual({ recorded: true, stepId: "s1", awaitingApproval: true, willApply: 3, offeredForReview: 1 });
    // Nothing was written: the chapters are the same objects they were.
    expect(target.chapters[0].doc!.textBetween(0, target.chapters[0].doc!.content.size, " ")).toContain("Johan gick");

    const [step] = builder.build().steps;
    if (step.tool !== "replace_in_book") throw new Error("expected a replacement step");
    expect(step.matches.map((match) => [match.text, match.replacement, match.preselected])).toEqual([
      ["Johan", "Jonas", true],
      ["JOHAN", "JONAS", true],
      ["johan", "Jonas", true],
      ["Johan", "Jonas", false],
    ]);
    // The inflected match is offered unticked, and it carries the text that
    // follows it, so the plan can show the author "Jonass väska" rather than
    // the tidier lie "Jonas väska".
    expect(step.matches[3].after).toBe("s väska stod kvar.");
  });

  it("refuses ids it never issued and ids listed twice", () => {
    expect(() => planner().builder.record("replace_in_book", { matchIds: ["m99"], replacement: "Jonas", reason: "x" }))
      .toThrow(PlanRejection);
    expect(() => planner().builder.record("replace_in_book", { matchIds: ["m1", "m1"], replacement: "Jonas", reason: "x" }))
      .toThrow(/more than once/);
  });

  it("checks a rewrite against the chapter while the model can still fix it", () => {
    const { builder } = planner();
    expect(() => builder.record("rewrite_passage", {
      chapterId: CHAPTER_ONE, original: "en mening som inte finns", replacement: "x", reason: "y",
    })).toThrow(/does not appear/);
    expect(() => builder.record("rewrite_passage", {
      chapterId: CHAPTER_ONE, original: "Hon väntade", replacement: "Hon dröjde", reason: "y",
    })).toThrow(/appears 2 times/);
    expect(JSON.parse(builder.record("rewrite_passage", {
      chapterId: CHAPTER_ONE, original: "gick ner till kajen", replacement: "sprang ner till kajen", reason: "Pacing.",
    })).recorded).toBe(true);
  });

  it("records cover text without the fields the model left alone", () => {
    const { builder } = planner();
    builder.record("set_cover_text", { backText: "En roman om att inte ge upp.", reason: "The author asked for back-cover copy." });
    const [step] = builder.build().steps;
    if (step.tool !== "set_cover_text") throw new Error("expected a cover step");
    expect(step.fields).toEqual({ backText: "En roman om att inte ge upp." });
  });

  it("summarises what the author is being asked to approve", () => {
    const { builder } = planner();
    builder.record("replace_in_book", { matchIds: ["m1", "m2"], optionalMatchIds: ["m3"], replacement: "Jonas", reason: "Rename." });
    builder.record("set_cover_style", { background: "#F4EFE6", reason: "Warmer." });
    expect(summarisePlan(builder.build())).toEqual({
      steps: 2,
      replacements: 2,
      optional: 1,
      chapters: [
        { chapterId: CHAPTER_ONE, chapterTitle: "Hamnen", count: 2 },
        { chapterId: CHAPTER_TWO, chapterTitle: "Färjan", count: 1 },
      ],
    });
  });
});
