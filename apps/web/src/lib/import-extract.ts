/**
 * Extract chapters from epub, docx, html, txt, pdf.
 * Returns { title, chapters: { title, sourceText }[] }.
 */

import * as cheerio from "cheerio";
import * as mammoth from "mammoth";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

export type ExtractedChapter = { title: string; sourceText: string };
export type ExtractedBook = { title: string; chapters: ExtractedChapter[] };

const DEFAULT_TITLE = "Untitled";
const TARGET_CHAPTER_CHARS = 12_000;
const MIN_CHAPTER_CHARS = 3_500;

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function normalizeInputText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

function splitParagraphs(text: string): string[] {
  return normalizeInputText(text)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isNumericPageReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^\d{1,4}$/.test(trimmed) || /^[ivxlcdm]{1,10}$/i.test(trimmed);
}

function isStandalonePageNumberParagraph(paragraph: string): boolean {
  return isNumericPageReference(paragraph.trim());
}

function removeStandalonePaginationParagraphs(paragraphs: string[]): string[] {
  return paragraphs.filter((paragraph, index) => {
    if (!isStandalonePageNumberParagraph(paragraph)) return true;

    const trimmed = paragraph.trim();
    const prev = paragraphs[index - 1]?.trim() ?? "";
    const next = paragraphs[index + 1]?.trim() ?? "";
    const prevWords = prev ? prev.split(/\s+/).length : 0;
    const nextWords = next ? next.split(/\s+/).length : 0;

    const looksStandaloneChapterNumber =
      /^(?:\d{1,2}|[ivxlcdm]{1,5})$/i.test(trimmed) &&
      prevWords === 0 &&
      nextWords >= 8;

    if (looksStandaloneChapterNumber) {
      return true;
    }

    return false;
  });
}

function normalizeTextForChapterSplit(text: string): string {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return "";
  const cleaned = removeStandalonePaginationParagraphs(paragraphs);
  return cleaned.join("\n\n").trim();
}

function chapterHeadingRegex(): RegExp {
  return /^\s*((?:(?:chapter|part|book|kapitel|del|chapitre|partie|teil|capitolo|cap(?:i|\u00ed)tulo|parte|libro|livro|bok)\s+[^\n]{1,120})|(?:prologue|epilogue|preface|foreword|afterword|introduction|prolog|epilog|f[öo]rord|inledning|efterord|inneh[åa]ll(?:sf[öo]rteckning)?|contents?|table of contents|acknowledg(?:e)?ments?))\s*$/gim;
}

function looksLikePlaceholderTitle(value: string | null | undefined): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) return true;
  return (
    normalized === "untitled" ||
    normalized === "namnlös" ||
    normalized === "namnlos" ||
    normalized === "book" ||
    normalized === "bok" ||
    normalized === "title"
  );
}

function canonicalFrontMatterTitle(rawHeading: string): string {
  const key = rawHeading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .replace(/\s+/g, " ");

  if (
    key === "innehåll" ||
    key === "innehållsförteckning" ||
    key === "innehallsforteckning" ||
    key === "contents" ||
    key === "content" ||
    key === "table of contents"
  ) {
    return "Innehållsförteckning";
  }
  if (key === "förord" || key === "forord" || key === "preface" || key === "foreword") {
    return "Förord";
  }
  if (key === "inledning" || key === "introduction") {
    return "Inledning";
  }
  if (key === "prolog" || key === "prologue") {
    return "Prolog";
  }
  if (key === "epilog" || key === "epilogue" || key === "afterword" || key === "efterord") {
    return "Epilog";
  }
  if (key === "acknowledgements" || key === "acknowledgments" || key === "tack") {
    return "Tack";
  }
  return rawHeading.trim();
}

function detectFrontMatterHeadingPrefix(text: string): { title: string; remainder: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^(f[öo]rord|preface|foreword|inledning|introduction|prolog(?:ue)?|epilog(?:ue)?|efterord|afterword|inneh[åa]ll(?:sf[öo]rteckning)?|contents?|table of contents|acknowledg(?:e)?ments?)\b\s*[:\-–—]?\s*/i
  );
  if (!match) return null;

  const heading = match[1] ?? "";
  return {
    title: canonicalFrontMatterTitle(heading),
    remainder: trimmed.slice(match[0].length).trim(),
  };
}

function isLikelyTocLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\.{2,}\s*\d{1,4}\s*$/i.test(trimmed)) return true;
  if (/\b\d{1,4}\b.*\b\d{1,4}\b/.test(trimmed)) return true;
  if (/\s+\d{1,4}\s*$/i.test(trimmed) && /\p{L}/u.test(trimmed)) return true;
  return false;
}

function splitIntroToFrontMatterSections(introText: string): ExtractedChapter[] {
  const blocks = splitParagraphs(introText);
  if (blocks.length === 0) return [];

  const chapters: ExtractedChapter[] = [];
  const genericBlocks: string[] = [];
  let current: { title: string; blocks: string[] } | null = null;

  const flushCurrent = () => {
    if (!current) return;
    const text = current.blocks.join("\n\n").trim();
    if (text) chapters.push({ title: current.title, sourceText: text });
    current = null;
  };

  for (const block of blocks) {
    const heading = detectFrontMatterHeadingPrefix(block);
    if (heading) {
      const remainderIsPageRef = isNumericPageReference(heading.remainder);
      const currentIsToc = current?.title === "Innehållsförteckning";

      if (remainderIsPageRef) {
        if (currentIsToc && current) {
          current.blocks.push(block);
          continue;
        }
        flushCurrent();
        current = {
          title: "Innehållsförteckning",
          blocks: [block],
        };
        continue;
      }

      flushCurrent();
      current = {
        title: heading.title,
        blocks: heading.remainder ? [heading.remainder] : [],
      };
      continue;
    }

    if (current && current.title === "Innehållsförteckning" && isLikelyTocLine(block)) {
      current.blocks.push(block);
      continue;
    }

    if (current) {
      current.blocks.push(block);
      continue;
    }

    genericBlocks.push(block);
  }

  flushCurrent();

  if (genericBlocks.length > 0) {
    chapters.unshift({
      title: chapters.length > 0 ? "Front matter" : "Introduction",
      sourceText: genericBlocks.join("\n\n").trim(),
    });
  }

  return chapters.filter((chapter) => {
    const sourceText = chapter.sourceText.trim();
    if (!sourceText) return false;

    const letters = sourceText.match(/\p{L}/gu)?.length ?? 0;
    const normalizedTitle = chapter.title.trim().toLowerCase();
    if (
      letters < 10 &&
      (normalizedTitle === "tack" ||
        normalizedTitle === "acknowledgements" ||
        normalizedTitle === "acknowledgments")
    ) {
      return false;
    }

    return true;
  });
}

function splitLeadingFrontMatterParagraphs(paragraphs: string[]): {
  frontMatter: ExtractedChapter[];
  remaining: string[];
} {
  if (paragraphs.length === 0) {
    return { frontMatter: [], remaining: paragraphs };
  }

  const leading: string[] = [];
  let sawFrontMatterSignal = false;
  let cursor = 0;
  const limit = Math.min(paragraphs.length, 12);

  while (cursor < limit) {
    const paragraph = paragraphs[cursor];
    const heading = detectFrontMatterHeadingPrefix(paragraph);
    const looksMetadata =
      /\b(isbn|copyright|all rights reserved|förlag|publisher|tryckning|utgiven|telefon|fax|e-post|www\.|@)\b/i.test(
        paragraph
      );
    const looksTableOfContents =
      /\b(inneh[åa]ll|contents?|table of contents)\b/i.test(paragraph) &&
      /\b\d{1,4}\b/.test(paragraph);
    const looksTitlePage = cursor === 0 && paragraph.length <= 140;

    if (heading || looksMetadata || looksTableOfContents || looksTitlePage) {
      if (heading || looksMetadata || looksTableOfContents) {
        sawFrontMatterSignal = true;
      }
      leading.push(paragraph);
      cursor += 1;
      continue;
    }

    break;
  }

  if (!sawFrontMatterSignal || leading.length === 0) {
    return { frontMatter: [], remaining: paragraphs };
  }

  const frontMatter = splitIntroToFrontMatterSections(leading.join("\n\n"));
  if (frontMatter.length === 0) {
    return { frontMatter: [], remaining: paragraphs };
  }

  return { frontMatter, remaining: paragraphs.slice(cursor) };
}

function inferTitleFromText(text: string): string | null {
  const normalized = normalizeTextForChapterSplit(text);
  if (!normalized) return null;

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length && i < 50; i++) {
    const line = lines[i];
    if (line.length < 2 || line.length > 120) continue;
    if (/^\s*(chapter|kapitel|part|del|book|bok)\b/i.test(line)) continue;
    if (/^\s*[\d\s:.,/\\\-–—]+$/.test(line)) continue;
    if (detectFrontMatterHeadingPrefix(line)) continue;
    if (/\b(isbn|copyright|telefon|phone|fax|www\.|@)\b/i.test(line)) continue;

    const wordCount = line.split(/\s+/).length;
    if (wordCount > 16) continue;

    const letters = line.match(/\p{L}/gu)?.length ?? 0;
    if (letters < 3) continue;

    return line.replace(/\s+/g, " ").trim();
  }

  return null;
}

function resolveExtractedTitle(metaTitle: string | null | undefined, fullText: string): string {
  const normalizedMeta = String(metaTitle ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!looksLikePlaceholderTitle(normalizedMeta)) {
    return normalizedMeta;
  }

  return inferTitleFromText(fullText) ?? DEFAULT_TITLE;
}

function isLikelyTableOfContentsEntry(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;

  if (/^(chapter|kapitel|part|del|book|bok)\s+(\d+|[ivxlcdm]+)$/i.test(trimmed)) {
    return false;
  }

  if (/\.{2,}\s*\d{1,4}\s*$/i.test(trimmed)) return true;
  if (/\b\d{1,4}\b.*\b\d{1,4}\b/.test(trimmed)) return true;
  if (/\s+\d{1,4}\s*$/i.test(trimmed) && /\p{L}/u.test(trimmed)) return true;

  return false;
}

function isLikelyStandaloneHeadingParagraph(paragraph: string, nextParagraph: string): boolean {
  const trimmed = paragraph.trim();
  if (!trimmed) return false;
  if (detectFrontMatterHeadingPrefix(trimmed)) return false;
  if (isLikelyTocLine(trimmed)) return false;
  if (/\b(isbn|copyright|telefon|fax|e-post|www\.|@)\b/i.test(trimmed)) return false;
  if (/^[\d\s]+$/.test(trimmed)) return false;
  if (/[.!?,;:]$/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 14) return false;
  if (trimmed.length < 6 || trimmed.length > 95) return false;

  const nextWords = nextParagraph.trim().split(/\s+/).filter(Boolean).length;
  if (nextWords < 20) return false;

  return true;
}

const CHAPTER_PREFIX_RE =
  /^(chapter|part|book|kapitel|del|chapitre|partie|teil|capitolo|cap(?:i|\u00ed)tulo|parte|libro|livro|bok)\b/i;

const SWEDISH_BASE_NUMERALS = [
  "ett",
  "en",
  "två",
  "tva",
  "tre",
  "fyra",
  "fem",
  "sex",
  "sju",
  "åtta",
  "atta",
  "nio",
  "tio",
  "elva",
  "tolv",
  "tretton",
  "fjorton",
  "femton",
  "sexton",
  "sjutton",
  "arton",
  "nitton",
];

const SWEDISH_TENS_NUMERALS = [
  "tjugo",
  "trettio",
  "fyrtio",
  "femtio",
  "sextio",
  "sjuttio",
  "åttio",
  "attio",
  "nittio",
];

const SWEDISH_NUMERAL_WORDS = (() => {
  const words = new Set<string>([
    ...SWEDISH_BASE_NUMERALS,
    ...SWEDISH_TENS_NUMERALS,
    "första",
    "forsta",
    "andra",
    "tredje",
    "fjärde",
    "fjaerde",
    "fjarde",
    "femte",
    "sjätte",
    "sjaette",
    "sjatte",
    "sjunde",
    "åttonde",
    "attonde",
    "nionde",
    "tionde",
    "elfte",
    "tolfte",
  ]);

  for (const ten of SWEDISH_TENS_NUMERALS) {
    for (const base of SWEDISH_BASE_NUMERALS.slice(0, 9)) {
      words.add(`${ten}${base}`);
    }
  }

  return words;
})();

const AMBIGUOUS_SWEDISH_NUMERAL_PREFIXES = new Set<string>([
  "en",
  "ett",
  "tre",
  "fem",
  "sex",
  "sju",
  "nio",
  "tio",
]);

function findLongestSwedishNumeralPrefix(value: string): string | null {
  let best: string | null = null;
  for (const numeral of SWEDISH_NUMERAL_WORDS) {
    if (!value.startsWith(numeral)) continue;
    if (!best || numeral.length > best.length) {
      best = numeral;
    }
  }
  return best;
}

function splitMergedSwedishOrdinal(token: string): string {
  const clean = token.replace(/[^\p{L}\p{N}]/gu, "");
  const lower = clean.toLowerCase();

  if (!clean || SWEDISH_NUMERAL_WORDS.has(lower)) {
    return token;
  }

  const prefix = findLongestSwedishNumeralPrefix(lower);
  if (!prefix) return token;

  const remainder = lower.slice(prefix.length);
  if (remainder.length < 2) return token;
  if (SWEDISH_NUMERAL_WORDS.has(remainder)) return token;

  if (AMBIGUOUS_SWEDISH_NUMERAL_PREFIXES.has(prefix)) {
    const boundary = clean.slice(prefix.length, prefix.length + 1);
    // Avoid collapsing OCR typos like "tretioettDen" into "tre".
    if (!/[A-ZÅÄÖ0-9]/u.test(boundary)) {
      return token;
    }
  }

  return clean.slice(0, prefix.length);
}

function isLikelyCorruptedChapterTitle(title: string): boolean {
  if (!title) return false;
  const compact = title.replace(/\s+/g, " ").trim();
  if (!CHAPTER_PREFIX_RE.test(compact)) return false;

  // Example: "Kapitel fyrtioettDen" indicates merged chapter heading + body start.
  if (/[a-zåäö][A-ZÅÄÖ]/u.test(compact)) return true;
  return false;
}

function normalizeCorruptedChapterTitles(chapters: ExtractedChapter[]): ExtractedChapter[] {
  const byOrder = [...chapters];
  if (byOrder.length < 6) return byOrder;

  const chapterLikeIndexes = byOrder
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => CHAPTER_PREFIX_RE.test(chapter.title))
    .map(({ index }) => index);

  if (chapterLikeIndexes.length < 6) return byOrder;

  const corruptedCount = chapterLikeIndexes.filter((index) =>
    isLikelyCorruptedChapterTitle(byOrder[index]?.title ?? "")
  ).length;

  const titleCounts = new Map<string, number>();
  for (const index of chapterLikeIndexes) {
    const key = byOrder[index].title.replace(/\s+/g, " ").trim().toLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const duplicateEntries = Array.from(titleCounts.values()).reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  );

  if (corruptedCount === 0 && duplicateEntries <= 1) {
    return byOrder;
  }

  let chapterNumber = 1;
  for (const chapter of byOrder) {
    if (!CHAPTER_PREFIX_RE.test(chapter.title)) continue;
    chapter.title = `Kapitel ${chapterNumber}`;
    chapterNumber += 1;
  }

  return byOrder;
}

function normalizeExtractedChapters(chapters: ExtractedChapter[]): ExtractedChapter[] {
  return normalizeCorruptedChapterTitles(chapters);
}

export function normalizeChapterTitlesToNumericSequence(titles: string[]): string[] {
  if (titles.length === 0) return [];

  let chapterNumber = 1;
  return titles.map((title) => {
    const compact = String(title ?? "").replace(/\s+/g, " ").trim();
    if (!compact) return compact;
    if (!CHAPTER_PREFIX_RE.test(compact)) return compact;

    const normalized = `Kapitel ${chapterNumber}`;
    chapterNumber += 1;
    return normalized;
  });
}

export function repairImportedChapterTitles(titles: string[]): string[] {
  return normalizeChapterTitlesToNumericSequence(titles);
}

function splitIntoChaptersHeuristicInternal(text: string): ExtractedChapter[] {
  const normalized = normalizeTextForChapterSplit(text);
  if (!normalized) return [];

  const headingMatches = Array.from(normalized.matchAll(chapterHeadingRegex()))
    .map((match) => {
      if (typeof match.index !== "number") return null;

      const rawTitle = normalizeChapterHeadingTitle(
        (match[1] ?? "").trim().slice(0, 200)
      );
      const frontMatter = detectFrontMatterHeadingPrefix(rawTitle);
      const title =
        frontMatter && !frontMatter.remainder ? frontMatter.title : rawTitle;

      if (!title || isLikelyTableOfContentsEntry(title)) return null;

      return {
        start: match.index,
        end: match.index + match[0].length,
        title,
      };
    })
    .filter(Boolean) as Array<{ start: number; end: number; title: string }>;

  const inferredMatches: Array<{ start: number; end: number; title: string }> = [];
  if (headingMatches.length < 2) {
    const paragraphs = splitParagraphs(normalized);
    let cursor = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      const nextParagraph = paragraphs[i + 1] ?? "";
      if (!isLikelyStandaloneHeadingParagraph(paragraph, nextParagraph)) continue;

      const start = normalized.indexOf(paragraph, cursor);
      if (start === -1) continue;
      const end = start + paragraph.length;
      cursor = end;

      const title = paragraph.trim().slice(0, 200);
      if (isLikelyTableOfContentsEntry(title)) continue;
      inferredMatches.push({ start, end, title });
    }
  }

  const allMatches = [...headingMatches, ...inferredMatches]
    .sort((a, b) => a.start - b.start)
    .filter((current, index, arr) => {
      if (index === 0) return true;
      const prev = arr[index - 1];
      return current.start >= prev.end;
    });

  if (allMatches.length === 0) {
    return splitWithoutHeadings(normalized);
  }

  const chapters: ExtractedChapter[] = [];
  const intro = normalized.slice(0, allMatches[0].start).trim();
  if (intro) {
    chapters.push(...splitIntroToFrontMatterSections(intro));
  }

  for (let i = 0; i < allMatches.length; i++) {
    const current = allMatches[i];
    const end = i + 1 < allMatches.length ? allMatches[i + 1].start : normalized.length;
    const sourceText = normalized.slice(current.end, end).trim();
    if (!sourceText) continue;
    chapters.push({ title: current.title, sourceText });
  }

  if (chapters.length === 0) {
    return splitWithoutHeadings(normalized);
  }

  return chapters;
}

/**
 * Heuristic split for plain text:
 * 1) explicit chapter-like headings
 * 2) title-like standalone headings followed by long paragraphs
 * 3) fallback chunking
 */
export function splitIntoChaptersHeuristic(text: string): ExtractedChapter[] {
  return normalizeExtractedChapters(splitIntoChaptersHeuristicInternal(text));
}

function splitIntoChaptersHeuristicLegacy(text: string): ExtractedChapter[] {
  // Legacy alias left for backward-compatible stack traces.
  return splitIntoChaptersHeuristic(text);
}

function normalizeChapterHeadingTitle(rawTitle: string): string {
  const compact = rawTitle.replace(/\s+/g, " ").trim();
  if (!compact) return compact;
  if (!CHAPTER_PREFIX_RE.test(compact)) return compact;

  const sentence = compact.split(/[.!?]/)[0]?.trim() ?? compact;
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length < 2) return sentence;

  words[1] = splitMergedSwedishOrdinal(words[1]);
  if (words.length > 3) {
    return `${words[0]} ${words[1]}`.trim();
  }

  return words.join(" ").trim();
}

function chunkSingleBlock(block: string): string[] {
  const clean = block.trim();
  if (!clean) return [];
  if (clean.length <= TARGET_CHAPTER_CHARS) return [clean];

  const chunks: string[] = [];
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [clean];
  let current = "";

  for (const sentence of sentences) {
    const next = sentence.trim();
    if (!next) continue;

    const nextLength = current.length === 0 ? next.length : current.length + 1 + next.length;
    const shouldFlush =
      current.length > 0 &&
      nextLength > TARGET_CHAPTER_CHARS &&
      current.length >= MIN_CHAPTER_CHARS;

    if (shouldFlush) {
      chunks.push(current.trim());
      current = next;
      continue;
    }

    current = current.length === 0 ? next : `${current} ${next}`;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [clean];
}

function splitWithoutHeadings(text: string): ExtractedChapter[] {
  const normalized = normalizeTextForChapterSplit(text);
  if (!normalized) return [];

  const allParagraphs = splitParagraphs(normalized);
  const { frontMatter, remaining } = splitLeadingFrontMatterParagraphs(allParagraphs);

  if (remaining.length <= 1) {
    const body = remaining[0]?.trim() ?? "";
    if (!body) return frontMatter;

    const chapters = chunkSingleBlock(body).map((sourceText, index) => ({
      title: `Chapter ${index + 1}`,
      sourceText,
    }));

    return [...frontMatter, ...chapters];
  }

  const bodies: string[] = [];
  let currentParts: string[] = [];
  let currentLength = 0;

  for (const paragraph of remaining) {
    const addition = (currentParts.length > 0 ? 2 : 0) + paragraph.length;
    const shouldFlush =
      currentParts.length > 0 &&
      currentLength + addition > TARGET_CHAPTER_CHARS &&
      currentLength >= MIN_CHAPTER_CHARS;

    if (shouldFlush) {
      bodies.push(currentParts.join("\n\n"));
      currentParts = [paragraph];
      currentLength = paragraph.length;
      continue;
    }

    currentParts.push(paragraph);
    currentLength += addition;
  }

  if (currentParts.length > 0) {
    bodies.push(currentParts.join("\n\n"));
  }

  if (bodies.length > 1) {
    const lastIndex = bodies.length - 1;
    const last = bodies[lastIndex];
    if (last.length < Math.floor(MIN_CHAPTER_CHARS / 2)) {
      bodies[lastIndex - 1] = `${bodies[lastIndex - 1]}\n\n${last}`;
      bodies.pop();
    }
  }

  const chapters = bodies.map((sourceText, index) => ({
    title: `Chapter ${index + 1}`,
    sourceText: sourceText.trim(),
  }));

  return [...frontMatter, ...chapters];
}

function htmlToStructuredText(html: string): string {
  const $ = cheerio.load(html);
  const blocks: string[] = [];

  $("h1, h2, h3, h4, h5, h6, p, li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) blocks.push(text);
  });

  if (blocks.length === 0) {
    return $("body").text().replace(/\s+/g, " ").trim();
  }

  return blocks.join("\n\n").trim();
}

/** Get chapter content from epub (callback-based epub package). */
function getEpubChapter(
  epub: { getChapter: (id: string, cb: (err: Error | null, text: string) => void) => void },
  id: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    epub.getChapter(id, (err: Error | null, text: string) => {
      if (err) reject(err);
      else resolve(text ?? "");
    });
  });
}

/** Extract text from HTML string (strip tags, normalize whitespace). */
function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html);
  return $("body").text().replace(/\s+/g, " ").trim();
}

type EpubInstance = {
  metadata?: { title?: string };
  flow?: Array<{ id: string; title?: string; href?: string }>;
  toc?: Array<{ id?: string; title?: string; href?: string }>;
  spine?: Array<{ contents?: string }>;
  on: (event: "end" | "error", listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: "end" | "error", listener: (...args: unknown[]) => void) => void;
  off?: (event: "end" | "error", listener: (...args: unknown[]) => void) => void;
  parse: () => void;
  getChapter: (id: string, cb: (err: Error | null, text: string) => void) => void;
};

type EpubConstructor = new (filePath: string) => EpubInstance;

function loadEpubConstructor(): EpubConstructor {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require("epub") as unknown;
  if (typeof loaded === "function") {
    return loaded as EpubConstructor;
  }
  throw new Error("EPUB parser module is not available");
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;
  const raw = String(error ?? "").trim();
  return new Error(raw || fallbackMessage);
}

export async function extractFromEpub(filePath: string): Promise<ExtractedBook> {
  const EPub = loadEpubConstructor();
  const epub = new EPub(filePath);

  return new Promise((resolve, reject) => {
    let settled = false;

    const settleResolve = (result: ExtractedBook) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(toError(error, "EPUB parsing failed"));
    };

    const onError = (error: unknown) => {
      settleReject(error);
    };

    const onEnd = async () => {
      try {
        const rawTitle = (epub.metadata?.title as string) || DEFAULT_TITLE;
        const chapters: ExtractedChapter[] = [];
        const flow = epub.flow ?? [];

        const tocTitleById = new Map<string, string>();
        const toc = epub.toc ?? [];
        for (const entry of toc) {
          if (entry.id && entry.title) {
            tocTitleById.set(entry.id, entry.title);
          }
          if (entry.href && entry.title) {
            const hrefBase = entry.href.split("#")[0];
            tocTitleById.set(hrefBase, entry.title);
          }
        }

        for (let i = 0; i < flow.length; i++) {
          const item = flow[i];
          const text = await getEpubChapter(epub, item.id);
          const plain = htmlToPlainText(text);
          if (plain.length > 0) {
            const tocTitle =
              tocTitleById.get(item.id) ??
              (item.href ? tocTitleById.get(item.href.split("#")[0]) : undefined);
            const chapterTitle = (item.title as string) || tocTitle || `Chapter ${i + 1}`;
            chapters.push({ title: chapterTitle, sourceText: plain });
          }
        }

        if (chapters.length === 0 && flow.length === 0) {
          const spine = epub.spine ?? [];
          for (let i = 0; i < spine.length; i++) {
            const id = spine[i]?.contents;
            if (id) {
              const text = await getEpubChapter(epub, id);
              const plain = htmlToPlainText(text);
              if (plain.length > 0) {
                const tocTitle = tocTitleById.get(id);
                chapters.push({ title: tocTitle || `Chapter ${i + 1}`, sourceText: plain });
              }
            }
          }
        }

        const fullText = normalizeTextForChapterSplit(
          chapters.map((chapter) => chapter.sourceText).join("\n\n")
        );

        settleResolve({
          title: resolveExtractedTitle(rawTitle, fullText),
          chapters,
        });
      } catch (e) {
        settleReject(e);
      }
    };

    const cleanup = () => {
      if (typeof epub.removeListener === "function") {
        epub.removeListener("end", onEnd);
        epub.removeListener("error", onError);
        return;
      }
      if (typeof epub.off === "function") {
        epub.off("end", onEnd);
        epub.off("error", onError);
      }
    };

    epub.on("error", onError);
    epub.on("end", onEnd);

    try {
      epub.parse();
    } catch (error) {
      settleReject(error);
    }
  });
}

export async function extractFromDocx(buffer: Buffer): Promise<ExtractedBook> {
  let rawText = "";
  let htmlValue = "";

  try {
    const raw = await mammoth.extractRawText({ buffer });
    rawText = raw.value ?? "";
    const html = await mammoth.convertToHtml({ buffer });
    htmlValue = html.value ?? "";
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    if (/Could not find main document part/i.test(raw)) {
      throw new Error("Invalid DOCX: missing word/document.xml");
    }
    throw error;
  }

  const structured = normalizeInputText(htmlToStructuredText(htmlValue));
  const fallback = normalizeInputText(rawText);
  const source = normalizeTextForChapterSplit(structured.length > 0 ? structured : fallback);

  if (!source) {
    throw new Error("Invalid DOCX: no readable text found");
  }

  const chapters = splitIntoChaptersHeuristic(source);
  return {
    title: resolveExtractedTitle(DEFAULT_TITLE, source),
    chapters,
  };
}

export async function extractFromHtml(buffer: Buffer): Promise<ExtractedBook> {
  const html = buffer.toString("utf8");
  const $ = cheerio.load(html);
  const chapters: ExtractedChapter[] = [];
  let currentTitle = "Chapter 1";
  let currentParts: string[] = [];

  const flush = () => {
    const text = currentParts.join(" ").replace(/\s+/g, " ").trim();
    if (text.length > 0) {
      chapters.push({ title: currentTitle, sourceText: text });
    }
    currentParts = [];
  };

  $("h1, h2, h3, h4, h5, h6, p").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    const text = $(el).text().trim();
    if (!text) return;

    if (tag && tag.startsWith("h")) {
      flush();
      currentTitle = text;
    } else {
      currentParts.push(text);
    }
  });
  flush();

  const structuredBody = normalizeTextForChapterSplit(htmlToStructuredText(html));

  if (chapters.length === 0 && structuredBody.length > 0) {
    chapters.push(...splitIntoChaptersHeuristic(structuredBody));
  }

  return {
    title: resolveExtractedTitle($("title").text().trim(), structuredBody),
    chapters,
  };
}

export async function extractFromTxt(buffer: Buffer): Promise<ExtractedBook> {
  const source = normalizeTextForChapterSplit(buffer.toString("utf8"));
  const chapters = splitIntoChaptersHeuristic(source);
  return { title: resolveExtractedTitle(DEFAULT_TITLE, source), chapters };
}

export async function extractFromPdf(buffer: Buffer): Promise<ExtractedBook> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{
    text: string;
    info?: Record<string, unknown>;
  }>;

  const data = await pdfParse(buffer);
  const source = normalizeTextForChapterSplit((data.text ?? "").trim());
  const chapters = splitIntoChaptersHeuristic(source);

  return {
    title: resolveExtractedTitle((data.info?.Title as string) || DEFAULT_TITLE, source),
    chapters,
  };
}

void splitIntoChaptersHeuristicLegacy;

export function contentHash(sourceText: string): string {
  return hashText(sourceText);
}

/** Run extraction. filePath must be a local path (worker downloads from Supabase to temp first if needed). */
export async function runExtract(filePath: string): Promise<ExtractedBook> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".epub") {
    return extractFromEpub(filePath);
  }

  const buffer = await fs.readFile(filePath);
  if (ext === ".docx") {
    return extractFromDocx(buffer);
  }
  if (ext === ".html" || ext === ".htm") {
    return extractFromHtml(buffer);
  }
  if (ext === ".txt") {
    return extractFromTxt(buffer);
  }
  if (ext === ".pdf") {
    return extractFromPdf(buffer);
  }

  throw new Error(`Unsupported format: ${ext}`);
}
