/**
 * What the book agents can do, and what they can only propose.
 *
 * The split is the whole safety model. A read tool runs immediately during the
 * model's turn and its result goes straight back into the conversation. A write
 * tool never runs during the turn: it is recorded as a plan step, the model is
 * told it was recorded, and nothing reaches the manuscript until the author
 * approves the finished plan.
 *
 * That is why a write tool can be described to the model in the imperative
 * ("replace", "set") without lying — from the model's point of view the call
 * succeeds, and the author's approval is a separate gate it never sees.
 */

import { z } from "zod";

export type ToolMode = "read" | "write";

const reason = z.string().trim().min(1).max(500);
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex colour, such as #FFFFFF.");
const matchId = z.string().regex(/^m[1-9][0-9]{0,5}$/);

/** How many matches one run may touch, and how many a search may return. */
export const MAX_MATCHES_PER_SEARCH = 500;
export const MAX_REPLACEMENTS_PER_RUN = 1500;
export const MAX_PLAN_STEPS = 20;
export const MAX_TOOL_TURNS = 8;
/** Per `read_chapter` call. Longer chapters come back as head + tail. */
export const MAX_CHAPTER_CHARS = 20_000;

/** Every field on these tools is optional except `reason`, so "set nothing" has to be rejected explicitly. */
const setsSomething = (value: Record<string, unknown>) =>
  Object.entries(value).some(([key, entry]) => key !== "reason" && entry !== undefined);

export const toolInputSchemas = {
  list_chapters: z.object({}).strict(),

  read_chapter: z.object({
    chapterId: z.string().uuid(),
  }).strict(),

  search_book: z.object({
    query: z.string().min(1).max(200),
    caseSensitive: z.boolean().optional(),
    wholeWord: z.boolean().optional(),
  }).strict(),

  replace_in_book: z.object({
    /** Applied when the author approves the plan, ticked by default. */
    matchIds: z.array(matchId).max(MAX_REPLACEMENTS_PER_RUN),
    /** Offered unticked, for matches the author should decide on. */
    optionalMatchIds: z.array(matchId).max(MAX_REPLACEMENTS_PER_RUN).optional(),
    /** May be empty, which deletes the matched text. */
    replacement: z.string().max(4000),
    reason,
  }).strict().refine(
    (value) => value.matchIds.length + (value.optionalMatchIds?.length ?? 0) > 0,
    "Name at least one match to replace.",
  ),

  rewrite_passage: z.object({
    chapterId: z.string().uuid(),
    original: z.string().min(1).max(4000),
    replacement: z.string().max(8000),
    reason,
  }).strict(),

  set_cover_text: z.object({
    subtitle: z.string().max(240).optional(),
    backText: z.string().max(4000).optional(),
    spineText: z.string().max(180).optional(),
    reason,
  }).strict().refine(setsSomething, "Set at least one of subtitle, backText or spineText."),

  set_cover_style: z.object({
    background: hexColor.optional(),
    textColor: hexColor.optional(),
    printTitle: z.boolean().optional(),
    reserveBarcode: z.boolean().optional(),
    reason,
  }).strict().refine(setsSomething, "Set at least one cover style field."),

  set_book_description: z.object({
    description: z.string().min(1).max(4000),
    reason,
  }).strict(),

  add_front_matter_section: z.object({
    // The three automatic pages (title, copyright, contents) are generated from
    // the book's own fields and may exist only once, so they are not offered.
    kind: z.enum(["dedication", "foreword", "preface", "acknowledgements", "afterword", "bibliography", "about-author", "custom"]),
    title: z.string().min(1).max(180),
    body: z.string().min(1).max(20_000),
    reason,
  }).strict(),

  generate_cover_image: z.object({
    prompt: z.string().min(1).max(2000),
    style: z.enum(["minimal", "photographic", "illustrated", "vintage"]),
    reason,
  }).strict(),
} as const;

export type ToolName = keyof typeof toolInputSchemas;
export type ToolInput<Name extends ToolName> = z.infer<(typeof toolInputSchemas)[Name]>;

export const TOOL_MODES: Record<ToolName, ToolMode> = {
  list_chapters: "read",
  read_chapter: "read",
  search_book: "read",
  replace_in_book: "write",
  rewrite_passage: "write",
  set_cover_text: "write",
  set_cover_style: "write",
  set_book_description: "write",
  add_front_matter_section: "write",
  generate_cover_image: "write",
};

export function isWriteTool(name: ToolName): boolean {
  return TOOL_MODES[name] === "write";
}

type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };

const REASON_PROPERTY = { type: "string", description: "One short sentence the author will read in the plan, explaining why." };

/**
 * The descriptions carry the author-facing policy, because that is the only
 * place the model reads it. In particular the inflection rule: a Swedish
 * genitive is a different word, not a variant spelling, and guessing it wrong
 * ("Jonass bok") is the kind of error an author notices only after publishing.
 */
export const TOOL_DEFINITIONS: { name: ToolName; description: string; input_schema: JsonSchema }[] = [
  {
    name: "list_chapters",
    description: "List the book's chapters in reading order with their titles and word counts. Cheap — call it first to orient yourself. Returns no chapter text.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "read_chapter",
    description: `Read one chapter's text. Use it when you need the prose itself — for judging style, pacing or a specific passage. Do NOT use it to find occurrences of a word; search_book is both cheaper and complete. Chapters longer than ${MAX_CHAPTER_CHARS} characters come back as the opening and the ending with the middle marked as omitted.`,
    input_schema: {
      type: "object",
      properties: { chapterId: { type: "string", description: "A chapter id from list_chapters." } },
      required: ["chapterId"],
      additionalProperties: false,
    },
  },
  {
    name: "search_book",
    description: `Find every occurrence of a literal string across every chapter, with surrounding text and a stable matchId for each. This reads the whole book without costing you the whole book. Leave wholeWord off when renaming someone or something: you need to see the longer words a match sits inside, because that is how you tell an inflected form of the same name (offer it) from a different name that merely starts the same way (leave it out). Use wholeWord only to cut noise when a short word appears inside many unrelated ones. Returns at most ${MAX_MATCHES_PER_SEARCH} matches.`,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Literal text to find. Not a pattern." },
        caseSensitive: { type: "boolean", description: "Default false." },
        wholeWord: { type: "boolean", description: "Require non-letter characters on both sides. Default false. Leave it off for renames." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "replace_in_book",
    description:
      "Replace matches found by search_book. Put a match in matchIds when you are confident it should change — the author sees it ticked. Put it in optionalMatchIds when it needs a human decision; the author sees it unticked with your reason.\n" +
      "Policy the author has chosen: exact matches of the search term, in any letter case, belong in matchIds. Write the replacement in its natural casing once — letter case is carried over from each match for you, so JOHAN becomes JONAS without you asking for it. Occurrences inside dialogue and quotations belong in matchIds too: a character keeps their name when spoken to. Inflected forms are a different word, not a casing variant — an inflected match belongs in optionalMatchIds, never matchIds, and your reason must name the inflection so the author can judge it (a Swedish genitive of a name already ending in s takes an apostrophe, which you must not guess at). A match that turns out to be part of an unrelated word or a different name belongs in neither list: leave it out and say so in your closing message. Every match in one call shares a single replacement string, so an inflected form needing different text than the rest cannot be handled here at all: the genitive of Johan needs the whole phrase rewritten, not the name swapped. Record that as its own rewrite_passage step, quoting enough of the sentence to be unique. Never describe an outcome to the author that the steps you recorded cannot produce.\n" +
      "Replacement may be empty, which deletes the matched text.",
    input_schema: {
      type: "object",
      properties: {
        matchIds: { type: "array", items: { type: "string" }, description: "Matches to apply, shown ticked." },
        optionalMatchIds: { type: "array", items: { type: "string" }, description: "Matches to offer, shown unticked." },
        replacement: { type: "string", description: "The new text. Empty deletes the match." },
        reason: REASON_PROPERTY,
      },
      required: ["matchIds", "replacement", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "rewrite_passage",
    description: "Rewrite one passage in one chapter. `original` must appear exactly once in that chapter, character for character, and must not span a paragraph break. For changing the same word in many places, use search_book plus replace_in_book instead.",
    input_schema: {
      type: "object",
      properties: {
        chapterId: { type: "string" },
        original: { type: "string", description: "The passage as it currently reads, quoted exactly." },
        replacement: { type: "string", description: "What it should read instead." },
        reason: REASON_PROPERTY,
      },
      required: ["chapterId", "original", "replacement", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "set_cover_text",
    description: "Set the words printed on the cover: the subtitle, the back-cover copy, and the spine text. Only the fields you pass change. This is the tool for 'put this text on the cover'.",
    input_schema: {
      type: "object",
      properties: {
        subtitle: { type: "string" },
        backText: { type: "string", description: "Back-cover copy. Plain text; paragraph breaks are kept." },
        spineText: { type: "string" },
        reason: REASON_PROPERTY,
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "set_cover_style",
    description: "Set the cover's colours and layout switches. Only the fields you pass change.",
    input_schema: {
      type: "object",
      properties: {
        background: { type: "string", description: "Six-digit hex, e.g. #F4EFE6." },
        textColor: { type: "string", description: "Six-digit hex." },
        printTitle: { type: "boolean", description: "Print the title and author on the front." },
        reserveBarcode: { type: "boolean", description: "Reserve a barcode area on the back." },
        reason: REASON_PROPERTY,
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "set_book_description",
    description: "Set the book's description — the blurb readers see on its page and in search. This replaces the whole description; read the book first if you are refining what is there rather than writing it fresh.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Plain text. Paragraph breaks are kept." },
        reason: REASON_PROPERTY,
      },
      required: ["description", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "add_front_matter_section",
    description: "Add a page before or after the manuscript: a dedication, foreword, preface, acknowledgements, afterword, bibliography, an about-the-author page, or a custom section. Its placement follows its kind. Use this for text that belongs to the book but not to a chapter. Title page, copyright and contents are generated automatically and cannot be added here.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["dedication", "foreword", "preface", "acknowledgements", "afterword", "bibliography", "about-author", "custom"] },
        title: { type: "string", description: "The heading printed on the page." },
        body: { type: "string", description: "The page's text. Plain text; paragraph breaks are kept." },
        reason: REASON_PROPERTY,
      },
      required: ["kind", "title", "body", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_cover_image",
    description: "Generate new cover artwork options from a visual brief. The author picks one afterwards; this never replaces the current artwork on its own.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The visual brief. Describe mood, subject and composition, not typography." },
        style: { type: "string", enum: ["minimal", "photographic", "illustrated", "vintage"] },
        reason: REASON_PROPERTY,
      },
      required: ["prompt", "style", "reason"],
      additionalProperties: false,
    },
  },
];
