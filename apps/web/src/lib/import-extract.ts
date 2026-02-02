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

/** Heuristic: split on "Chapter N", "Part N", "Kapitel N" or similar. */
function splitIntoChaptersHeuristic(text: string): ExtractedChapter[] {
  const re = /(?:^|\n)\s*((?:Chapter|Part|Kapitel)\s*\d+[:\-–—]?\s*[^\n]*)/gi;
  const parts: { index: number; length: number; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const title = (m[1]?.trim() || "").slice(0, 200);
    if (title) parts.push({ index: m.index, length: m[0].length, title });
  }

  if (parts.length === 0) {
    return text.trim() ? [{ title: "Chapter 1", sourceText: text.trim() }] : [];
  }

  const chapters: ExtractedChapter[] = [];
  for (let i = 0; i < parts.length; i++) {
    const start = parts[i].index + parts[i].length;
    const end = i + 1 < parts.length ? parts[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body.length > 0) {
      chapters.push({ title: parts[i].title, sourceText: body });
    }
  }
  const beforeFirst = text.slice(0, parts[0].index).trim();
  if (beforeFirst.length > 0) {
    chapters.unshift({ title: "Chapter 1", sourceText: beforeFirst });
  }
  return chapters.length > 0 ? chapters : [{ title: "Chapter 1", sourceText: text.trim() }];
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
