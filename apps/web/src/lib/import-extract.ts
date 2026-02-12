/**
 * Extract chapters from epub, docx, html, txt. Returns { title, chapters: { title, sourceText }[] }.
 */

import * as cheerio from "cheerio";
import * as mammoth from "mammoth";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

export type ExtractedChapter = { title: string; sourceText: string };
export type ExtractedBook = { title: string; chapters: ExtractedChapter[] };
const TARGET_CHAPTER_CHARS = 12_000;
const MIN_CHAPTER_CHARS = 3_500;
const DEFAULT_TITLE = "Untitled";

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function normalizeInputText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

function chapterHeadingRegex(): RegExp {
  return /^\s*((?:(?:chapter|part|book|kapitel|del|chapitre|partie|teil|capitolo|cap(?:i|\u00ed)tulo|parte|libro|livro|bok)\s+[^\n]{1,120})|(?:prologue|epilogue|preface|foreword|afterword|introduction|prolog|epilog|f[öo]rord|inledning|inneh[åa]ll(?:sf[öo]rteckning)?|contents?|table of contents|acknowledg(?:e)?ments?|tack))\s*$/gim;
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
  if (key === "epilog" || key === "epilogue" || key === "afterword") {
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
    /^(f[öo]rord|preface|foreword|inledning|introduction|prolog(?:ue)?|epilog(?:ue)?|afterword|inneh[åa]ll(?:sf[öo]rteckning)?|contents?|table of contents|acknowledg(?:e)?ments?|tack)\b\s*[:\-–—]?\s*/i
  );
  if (!match) return null;

  const heading = match[1] ?? "";
  return {
    title: canonicalFrontMatterTitle(heading),
    remainder: trimmed.slice(match[0].length).trim(),
  };
}

function splitIntroToFrontMatterSections(introText: string): ExtractedChapter[] {
  const intro = normalizeInputText(introText);
  if (!intro) return [];

  const blocks = intro
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

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
      flushCurrent();
      current = {
        title: heading.title,
        blocks: heading.remainder ? [heading.remainder] : [],
      };
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

  return chapters.filter((chapter) => chapter.sourceText.trim().length > 0);
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
  const limit = Math.min(paragraphs.length, 10);

  while (cursor < limit) {
    const paragraph = paragraphs[cursor];
    const heading = detectFrontMatterHeadingPrefix(paragraph);
    const looksMetadata =
      /\b(isbn|copyright|all rights reserved|förlag|publisher|tryckning|utgiven)\b/i.test(
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
  const normalized = normalizeInputText(text);
  if (!normalized) return null;

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length && i < 40; i++) {
    const line = lines[i];
    if (line.length < 2 || line.length > 120) continue;
    if (/^\s*(chapter|kapitel|part|del|book)\b/i.test(line)) continue;
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

function isLikelyTableOfContentsEntry(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;

  if (/\.{2,}\s*\d{1,4}\s*$/i.test(trimmed)) {
    return true;
  }

  const startsWithChapterLike = /^(chapter|kapitel|part|del|book|bok)\b/i.test(trimmed);
  if (!startsWithChapterLike) return false;

  const numericTokens = trimmed.match(/\b\d+\b/g) ?? [];
  if (numericTokens.length >= 2) return true;

  if (/\s+\d{1,4}\s*$/i.test(trimmed) && /\s/.test(trimmed.replace(/\b\d+\b/g, "").trim())) {
    return true;
  }

  return false;
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
  const normalized = normalizeInputText(text);
  if (!normalized) return [];

  const allParagraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const { frontMatter, remaining } = splitLeadingFrontMatterParagraphs(allParagraphs);
  const paragraphs = remaining;

  if (paragraphs.length <= 1) {
    const body = paragraphs[0]?.trim() ?? "";
    if (!body) {
      return frontMatter;
    }
    const chapters = chunkSingleBlock(body).map((sourceText, index) => ({
      title: `Chapter ${index + 1}`,
      sourceText,
    }));
    return [...frontMatter, ...chapters];
  }

  const bodies: string[] = [];
  let currentParts: string[] = [];
  let currentLength = 0;

  for (const paragraph of paragraphs) {
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

/** Get chapter content from epub (callback-based epub package). */
function getEpubChapter(epub: { getChapter: (id: string, cb: (err: Error | null, text: string) => void) => void }, id: string): Promise<string> {
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

export async function extractFromEpub(filePath: string): Promise<ExtractedBook> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const EPub = require("epub");
  const epub = new EPub(filePath);

  return new Promise((resolve, reject) => {
    epub.on("end", async () => {
      try {
        const title = (epub.metadata?.title as string) || DEFAULT_TITLE;
        const chapters: ExtractedChapter[] = [];
        const flow = (epub.flow as Array<{ id: string; title?: string }>) ?? [];

        for (let i = 0; i < flow.length; i++) {
          const item = flow[i];
          const text = await getEpubChapter(epub, item.id);
          const plain = htmlToPlainText(text);
          if (plain.length > 0) {
            chapters.push({
              title: (item.title as string) || `Chapter ${i + 1}`,
              sourceText: plain,
            });
          }
        }

        if (chapters.length === 0 && flow.length === 0) {
          const spine = (epub.spine as { contents?: string }[]) ?? [];
          for (let i = 0; i < spine.length; i++) {
            const id = spine[i]?.contents;
            if (id) {
              const text = await getEpubChapter(epub, id);
              const plain = htmlToPlainText(text);
              if (plain.length > 0) {
                chapters.push({ title: `Chapter ${i + 1}`, sourceText: plain });
              }
            }
          }
        }

        resolve({
          title: resolveExtractedTitle(
            title,
            chapters.map((chapter) => chapter.sourceText).join("\n\n")
          ),
          chapters,
        });
      } catch (e) {
        reject(e);
      }
    });

    epub.parse();
  });
}

export async function extractFromDocx(buffer: Buffer): Promise<ExtractedBook> {
  let value: string | null | undefined;
  let htmlValue = "";
  try {
    const result = await mammoth.extractRawText({ buffer });
    value = result.value;
    const htmlResult = await mammoth.convertToHtml({ buffer });
    htmlValue = htmlResult.value ?? "";
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    if (/Could not find main document part/i.test(raw)) {
      throw new Error("Invalid DOCX: missing word/document.xml");
    }
    throw error;
  }

  const raw = normalizeInputText(value ?? "");
  const structured = normalizeInputText(htmlToStructuredText(htmlValue));
  const full = structured.length > 0 ? structured : raw;
  if (!full) {
    throw new Error("Invalid DOCX: no readable text found");
  }

  const chapters = splitIntoChaptersHeuristic(full);
  return { title: resolveExtractedTitle(DEFAULT_TITLE, full), chapters };
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

  if (chapters.length === 0) {
    const body = $("body").text().replace(/\s+/g, " ").trim();
    if (body.length > 0) chapters.push({ title: "Chapter 1", sourceText: body });
  }

  return { title: resolveExtractedTitle($("title").text().trim(), $("body").text()), chapters };
}

export async function extractFromTxt(buffer: Buffer): Promise<ExtractedBook> {
  const full = buffer.toString("utf8").trim();
  const chapters = splitIntoChaptersHeuristic(full);
  return { title: resolveExtractedTitle(DEFAULT_TITLE, full), chapters };
}

/**
 * Heuristic split for plain text: use explicit chapter-like headings when present.
 * If no headings are found, chunk by paragraph/sentence size to avoid one giant chapter.
 */
export function splitIntoChaptersHeuristic(text: string): ExtractedChapter[] {
  const normalized = normalizeInputText(text);
  if (!normalized) return [];

  const headingMatches = Array.from(normalized.matchAll(chapterHeadingRegex()))
    .map((match) => {
      if (typeof match.index !== "number") return null;
      const rawTitle = (match[1] ?? "").trim().slice(0, 200);
      const normalizedFrontMatterHeading = detectFrontMatterHeadingPrefix(rawTitle);
      const title =
        normalizedFrontMatterHeading && !normalizedFrontMatterHeading.remainder
          ? normalizedFrontMatterHeading.title
          : rawTitle;
      if (!title) return null;
      if (isLikelyTableOfContentsEntry(title)) return null;
      return {
        start: match.index,
        end: match.index + match[0].length,
        title,
      };
    })
    .filter(Boolean) as Array<{ start: number; end: number; title: string }>;

  if (headingMatches.length === 0) {
    return splitWithoutHeadings(normalized);
  }

  const chapters: ExtractedChapter[] = [];
  const intro = normalized.slice(0, headingMatches[0].start).trim();
  if (intro) {
    chapters.push(...splitIntroToFrontMatterSections(intro));
  }

  for (let i = 0; i < headingMatches.length; i++) {
    const current = headingMatches[i];
    const end = i + 1 < headingMatches.length ? headingMatches[i + 1].start : normalized.length;
    const sourceText = normalized.slice(current.end, end).trim();
    if (!sourceText) continue;
    chapters.push({ title: current.title, sourceText });
  }

  if (chapters.length === 0) {
    return splitWithoutHeadings(normalized);
  }

  return chapters;
}

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

  throw new Error(`Unsupported format: ${ext}`);
}
