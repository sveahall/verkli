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

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
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
        const title = (epub.metadata?.title as string) || "Untitled";
        const chapters: ExtractedChapter[] = [];
        const flow = (epub.flow as Array<{ id: string; title?: string; href?: string }>) ?? [];

        // Build a TOC title lookup from epub.toc (table of contents) for better chapter names
        const tocTitleById = new Map<string, string>();
        const toc = (epub.toc as Array<{ id?: string; title?: string; href?: string }>) ?? [];
        for (const entry of toc) {
          if (entry.id && entry.title) {
            tocTitleById.set(entry.id, entry.title);
          }
          // Some EPUB libraries use href-based matching
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
            // Try: flow title → TOC by id → TOC by href → fallback
            const tocTitle = tocTitleById.get(item.id) ??
              (item.href ? tocTitleById.get(item.href.split("#")[0]) : undefined);
            const chapterTitle = (item.title as string) || tocTitle || `Chapter ${i + 1}`;
            chapters.push({
              title: chapterTitle,
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
                const tocTitle = tocTitleById.get(id);
                chapters.push({ title: tocTitle || `Chapter ${i + 1}`, sourceText: plain });
              }
            }
          }
        }

        resolve({ title, chapters });
      } catch (e) {
        reject(e);
      }
    });

    epub.parse();
  });
}

export async function extractFromDocx(buffer: Buffer): Promise<ExtractedBook> {
  const { value } = await mammoth.extractRawText({ buffer });
  const full = (value ?? "").trim();
  const chapters = splitIntoChaptersHeuristic(full);
  return { title: "Untitled", chapters };
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

  return { title: $("title").text().trim() || "Untitled", chapters };
}

export async function extractFromTxt(buffer: Buffer): Promise<ExtractedBook> {
  const full = buffer.toString("utf8").trim();
  const chapters = splitIntoChaptersHeuristic(full);
  return { title: "Untitled", chapters };
}

/**
 * Heuristic chapter detection with multi-pattern matching and smart chunking fallback.
 *
 * Patterns matched (case-insensitive):
 * 1. "Chapter N", "Part N", "Kapitel N", "Chapitre N", "Capítulo N", "Del N" (with optional Roman numerals)
 * 2. "Prologue", "Epilogue", "Introduction", "Foreword", "Afterword", "Prolog", "Epilog", "Förord", "Inledning"
 * 3. Numbered headings like "1. Title Case Heading" or "1 — Title Here"
 *
 * If no chapter markers found and text exceeds CHUNK_TARGET_WORDS, splits at paragraph
 * boundaries into roughly equal chunks.
 */
const CHUNK_TARGET_WORDS = 5000;

function splitIntoChaptersHeuristic(text: string): ExtractedChapter[] {
  const matches: { index: number; length: number; title: string }[] = [];

  // Pattern 1: "Chapter N", "Part N", "Kapitel N", etc. with Arabic or Roman numerals
  const chapterRe = /(?:^|\n)\s*((?:Chapter|Part|Kapitel|Chapitre|Capítulo|Del)\s+(?:\d+|[IVXLCDM]+)[:\-–—.]?\s*[^\n]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = chapterRe.exec(text)) !== null) {
    const title = (m[1]?.trim() || "").slice(0, 200);
    if (title) matches.push({ index: m.index, length: m[0].length, title });
  }

  // Pattern 2: Named sections (Prologue, Epilogue, etc.)
  const namedRe = /(?:^|\n)\s*((?:Prologue|Epilogue|Introduction|Foreword|Afterword|Preface|Prolog|Epilog|Förord|Inledning|Efterord)\s*[:\-–—]?\s*[^\n]*)/gi;
  while ((m = namedRe.exec(text)) !== null) {
    const title = (m[1]?.trim() || "").slice(0, 200);
    if (title) matches.push({ index: m.index, length: m[0].length, title });
  }

  // Pattern 3: "1. Title Case" or "1 — Title" (numbered headings, only at line start)
  const numberedRe = /(?:^|\n)\s*(\d{1,3})[.\s]+[—–\-:]?\s*([A-ZÅÄÖÉÈÜÏ][^\n]{2,80})/g;
  while ((m = numberedRe.exec(text)) !== null) {
    const num = m[1];
    const heading = m[2]?.trim() || "";
    // Only count if there are at least 2 capitalized words (avoids matching random numbered lists)
    const capWords = heading.match(/[A-ZÅÄÖÉÈÜÏ][a-zåäöéèüïñ]+/g);
    if (capWords && capWords.length >= 2) {
      const title = `${num}. ${heading}`.slice(0, 200);
      matches.push({ index: m.index, length: m[0].length, title });
    }
  }

  // Sort matches by index position, deduplicate overlaps
  matches.sort((a, b) => a.index - b.index);
  const parts: { index: number; length: number; title: string }[] = [];
  for (const match of matches) {
    const last = parts[parts.length - 1];
    // Skip if this match overlaps with the previous one
    if (last && match.index < last.index + last.length) continue;
    parts.push(match);
  }

  // If chapter markers found, split on them
  if (parts.length >= 2) {
    return splitOnMarkers(text, parts);
  }

  // Single marker: just use it as a divider
  if (parts.length === 1) {
    return splitOnMarkers(text, parts);
  }

  // No markers found — use smart chunking if text is large enough
  const wordCount = text.split(/\s+/).length;
  if (wordCount > CHUNK_TARGET_WORDS) {
    return smartChunk(text, CHUNK_TARGET_WORDS);
  }

  // Short text with no markers — single chapter
  return text.trim() ? [{ title: "Chapter 1", sourceText: text.trim() }] : [];
}

/** Split text using detected chapter markers. */
function splitOnMarkers(
  text: string,
  parts: { index: number; length: number; title: string }[]
): ExtractedChapter[] {
  const chapters: ExtractedChapter[] = [];

  // Content before first marker
  const beforeFirst = text.slice(0, parts[0].index).trim();
  if (beforeFirst.length > 0) {
    chapters.push({ title: "Foreword", sourceText: beforeFirst });
  }

  for (let i = 0; i < parts.length; i++) {
    const start = parts[i].index + parts[i].length;
    const end = i + 1 < parts.length ? parts[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body.length > 0) {
      chapters.push({ title: parts[i].title, sourceText: body });
    }
  }

  return chapters.length > 0 ? chapters : [{ title: "Chapter 1", sourceText: text.trim() }];
}

/**
 * Smart chunking: split text into ~targetWords-sized chunks at paragraph boundaries.
 * Looks for double-newlines (paragraph breaks) nearest to the target split point.
 */
function smartChunk(text: string, targetWords: number): ExtractedChapter[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chapters: ExtractedChapter[] = [];
  let currentParts: string[] = [];
  let currentWordCount = 0;
  let chapterNum = 1;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const paraWords = trimmed.split(/\s+/).length;
    currentParts.push(trimmed);
    currentWordCount += paraWords;

    if (currentWordCount >= targetWords) {
      chapters.push({
        title: `Chapter ${chapterNum}`,
        sourceText: currentParts.join("\n\n"),
      });
      chapterNum++;
      currentParts = [];
      currentWordCount = 0;
    }
  }

  // Remaining content
  if (currentParts.length > 0) {
    const remaining = currentParts.join("\n\n");
    if (remaining.trim().length > 0) {
      // If remaining is very short, merge with last chapter
      if (chapters.length > 0 && currentWordCount < targetWords * 0.3) {
        const last = chapters[chapters.length - 1];
        last.sourceText += "\n\n" + remaining;
      } else {
        chapters.push({
          title: `Chapter ${chapterNum}`,
          sourceText: remaining,
        });
      }
    }
  }

  return chapters.length > 0 ? chapters : [{ title: "Chapter 1", sourceText: text.trim() }];
}

export async function extractFromPdf(buffer: Buffer): Promise<ExtractedBook> {
  // pdf-parse uses `export =` (CJS), so dynamic import yields the fn directly or on .default
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; info?: Record<string, unknown> }>;
  const data = await pdfParse(buffer);
  const title = (data.info?.Title as string) || "Untitled";
  const chapters = splitIntoChaptersHeuristic((data.text ?? "").trim());
  return { title, chapters };
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
  if (ext === ".pdf") {
    return extractFromPdf(buffer);
  }

  throw new Error(`Unsupported format: ${ext}`);
}
