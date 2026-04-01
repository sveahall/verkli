export type TiptapMark = { type: "bold" } | { type: "italic" };

export type TiptapInlineNode =
  | { type: "text"; text: string; marks?: TiptapMark[] }
  | { type: "hardBreak" };

export type TiptapListItemNode = {
  type: "listItem";
  content: TiptapBlockNode[];
};

export type TiptapBlockNode =
  | { type: "paragraph"; content?: TiptapInlineNode[] }
  | { type: "heading"; attrs: { level: 1 | 2 | 3 }; content: TiptapInlineNode[] }
  | { type: "blockquote"; content: TiptapBlockNode[] }
  | { type: "bulletList"; content: TiptapListItemNode[] }
  | { type: "orderedList"; content: TiptapListItemNode[] };

export type TiptapDocument = {
  type: "doc";
  content: TiptapBlockNode[];
};

type ContentInput = string | Record<string, unknown> | null | undefined;

const CHAPTER_HEADING_RE =
  /^(chapter|part|book|kapitel|del|chapitre|partie|teil|capitolo|capitulo|parte|libro|livro|bok)\b/i;

const FRONT_MATTER_HEADING_RE =
  /^(prologue|epilogue|preface|foreword|afterword|introduction|prolog|epilog|forord|inledning|efterord|innehall(?:sforteckning)?|contents?|table of contents|acknowledg(?:e)?ments?|tack)\b/i;

function normalizeInputText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countLetters(text: string): number {
  return text.match(/\p{L}/gu)?.length ?? 0;
}

function looksLikePageReference(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^\d{1,4}$/.test(trimmed) || /^[ivxlcdm]{1,10}$/i.test(trimmed);
}

function looksLikeMetadataLine(text: string): boolean {
  return /\b(isbn|copyright|all rights reserved|publisher|forlag|telefon|phone|fax|e-post|email|www\.|https?:\/\/|@)\b/i.test(
    text
  );
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value);
}

function parseMarkdownHeading(block: string): { level: 1 | 2 | 3; text: string } | null {
  const match = block.match(/^(#{1,3})\s+(.+)$/);
  if (!match) return null;
  const hash = match[1] ?? "";
  const headingText = normalizeInlineText(match[2] ?? "");
  if (!headingText) return null;
  const level = hash.length as 1 | 2 | 3;
  return { level, text: headingText };
}

function shouldTreatSingleNewlineAsParagraphBreak(lines: string[]): boolean {
  if (lines.length < 4) return false;
  const punctuationRatio =
    lines.filter((line) => /[.!?]["')\]]?$/.test(line)).length / lines.length;
  const avgWords =
    lines.reduce((sum, line) => sum + countWords(line), 0) / lines.length;
  return punctuationRatio >= 0.65 && avgWords >= 4;
}

function splitBlocks(text: string): string[] {
  const initialBlocks = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (initialBlocks.length !== 1) {
    return initialBlocks;
  }

  const lines = initialBlocks[0]
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!shouldTreatSingleNewlineAsParagraphBreak(lines)) {
    return initialBlocks;
  }

  return lines;
}

function headingLevelFromText(text: string, index: number): 1 | 2 | 3 {
  if (CHAPTER_HEADING_RE.test(text) || FRONT_MATTER_HEADING_RE.test(text)) return 2;
  return index === 0 ? 1 : 2;
}

function isLikelyHeading(text: string, nextBlock: string | null, index: number): boolean {
  const trimmed = normalizeInlineText(text);
  if (!trimmed) return false;
  if (looksLikePageReference(trimmed)) return false;
  if (looksLikeMetadataLine(trimmed)) return false;
  if (countLetters(trimmed) < 2) return false;

  if (CHAPTER_HEADING_RE.test(trimmed) || FRONT_MATTER_HEADING_RE.test(trimmed)) {
    return true;
  }

  const wordCount = countWords(trimmed);
  if (wordCount < 1 || wordCount > 14) return false;
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  if (/\.$/.test(trimmed)) return false;
  if (/[,;]\s+\S+/.test(trimmed) && wordCount > 8) return false;

  const nextWords = countWords(nextBlock ?? "");
  const nextLength = normalizeInlineText(nextBlock ?? "").length;

  if (index === 0 && (nextWords >= 10 || nextLength >= 70)) return true;
  if (nextWords >= 14 || nextLength >= 90) return true;

  return false;
}

function paragraphNode(text: string): TiptapBlockNode | null {
  const normalized = normalizeInlineText(text.replace(/\n+/g, " "));
  if (!normalized) return null;
  return {
    type: "paragraph",
    content: [{ type: "text", text: normalized }],
  };
}

function headingNode(text: string, level: 1 | 2 | 3): TiptapBlockNode | null {
  const normalized = normalizeInlineText(text);
  if (!normalized) return null;
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text: normalized }],
  };
}

function createEmptyDoc(): TiptapDocument {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function isTiptapLikeJson(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "doc" && Array.isArray(candidate.content)) return true;
  return typeof candidate.type === "string";
}

function tryParseStoredJson(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isTiptapLikeJson(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function extractTextFromTiptapNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const candidate = node as Record<string, unknown>;

  if (candidate.type === "text" && typeof candidate.text === "string") {
    return candidate.text;
  }

  if (Array.isArray(candidate.content)) {
    return candidate.content
      .map((child) => extractTextFromTiptapNode(child))
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

function splitLeadingTitleFromLegacyBlock(text: string): { heading: string; body: string } | null {
  const normalized = normalizeInlineText(text);
  if (!normalized) return null;

  const match = normalized.match(/^(.{3,100}?[!?:])\s+(.+)$/);
  if (!match) return null;

  const heading = normalizeInlineText(match[1] ?? "");
  const body = normalizeInlineText(match[2] ?? "");
  if (!heading || !body) return null;

  if (countWords(heading) > 10) return null;
  if (countWords(body) < 20) return null;
  if (looksLikePageReference(heading) || looksLikeMetadataLine(heading)) return null;

  return { heading, body };
}

function normalizeLegacyFlattenedDoc(
  parsed: Record<string, unknown>
): Record<string, unknown> {
  if (parsed.type !== "doc" || !Array.isArray(parsed.content) || parsed.content.length !== 1) {
    return parsed;
  }

  const onlyBlock = parsed.content[0];
  if (!onlyBlock || typeof onlyBlock !== "object") return parsed;
  const blockType = (onlyBlock as Record<string, unknown>).type;
  if (blockType !== "paragraph" && blockType !== "heading") {
    return parsed;
  }

  const flattenedText = normalizeInlineText(extractTextFromTiptapNode(onlyBlock));
  if (countWords(flattenedText) < 25 || flattenedText.length < 140) {
    return parsed;
  }

  const split = splitLeadingTitleFromLegacyBlock(flattenedText);
  if (!split) return parsed;

  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: split.heading }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: split.body }],
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML → TipTap JSON (preserves formatting from EPUB/DOCX)
// ─────────────────────────────────────────────────────────────────────────────

type CheerioElement = {
  type: string;
  name?: string;
  data?: string;
  children?: CheerioElement[];
  attribs?: Record<string, string>;
  parent?: CheerioElement;
};


function convertInlineChildren(el: CheerioElement, inheritedMarks: TiptapMark[] = []): TiptapInlineNode[] {
  const nodes: TiptapInlineNode[] = [];
  const children = el.children ?? [];

  for (const child of children) {
    if (child.type === "text") {
      const text = (child.data ?? "").replace(/\s+/g, " ");
      if (!text) continue;
      const allMarks = [...inheritedMarks];
      const node: TiptapInlineNode = { type: "text", text };
      if (allMarks.length > 0) {
        // Deduplicate marks
        const seen = new Set<string>();
        node.marks = allMarks.filter((m) => {
          if (seen.has(m.type)) return false;
          seen.add(m.type);
          return true;
        });
      }
      nodes.push(node);
      continue;
    }

    const tag = child.name?.toLowerCase();

    if (tag === "br") {
      nodes.push({ type: "hardBreak" });
      continue;
    }

    // Inline formatting elements — recurse with accumulated marks
    if (tag === "strong" || tag === "b" || tag === "em" || tag === "i" || tag === "span" || tag === "a" || tag === "u" || tag === "s") {
      const extraMarks: TiptapMark[] = [...inheritedMarks];
      if (tag === "strong" || tag === "b") extraMarks.push({ type: "bold" });
      if (tag === "em" || tag === "i") extraMarks.push({ type: "italic" });
      nodes.push(...convertInlineChildren(child, extraMarks));
      continue;
    }

    // Nested block element inside inline context — extract text
    if (child.children?.length) {
      nodes.push(...convertInlineChildren(child, inheritedMarks));
    }
  }

  return nodes;
}

function inlineNodesToText(nodes: TiptapInlineNode[]): string {
  return nodes
    .map((n) => (n.type === "text" ? n.text : ""))
    .join("")
    .trim();
}

function convertBlockElement(el: CheerioElement): TiptapBlockNode[] {
  const tag = el.name?.toLowerCase();
  const blocks: TiptapBlockNode[] = [];

  if (tag === "h1" || tag === "h2" || tag === "h3") {
    const level = Number(tag[1]) as 1 | 2 | 3;
    const content = convertInlineChildren(el);
    if (inlineNodesToText(content)) {
      blocks.push({ type: "heading", attrs: { level }, content });
    }
    return blocks;
  }

  // h4-h6 → treat as h3
  if (tag === "h4" || tag === "h5" || tag === "h6") {
    const content = convertInlineChildren(el);
    if (inlineNodesToText(content)) {
      blocks.push({ type: "heading", attrs: { level: 3 }, content });
    }
    return blocks;
  }

  if (tag === "p" || tag === "div") {
    const content = convertInlineChildren(el);
    if (inlineNodesToText(content)) {
      blocks.push({ type: "paragraph", content });
    }
    return blocks;
  }

  if (tag === "blockquote") {
    const innerBlocks = convertChildBlockElements(el);
    if (innerBlocks.length > 0) {
      blocks.push({ type: "blockquote", content: innerBlocks });
    }
    return blocks;
  }

  if (tag === "ul" || tag === "ol") {
    const items: TiptapListItemNode[] = [];
    for (const child of el.children ?? []) {
      if (child.name?.toLowerCase() === "li") {
        const liBlocks = convertChildBlockElements(child);
        if (liBlocks.length === 0) {
          const content = convertInlineChildren(child);
          if (inlineNodesToText(content)) {
            liBlocks.push({ type: "paragraph", content });
          }
        }
        if (liBlocks.length > 0) {
          items.push({ type: "listItem", content: liBlocks });
        }
      }
    }
    if (items.length > 0) {
      blocks.push({
        type: tag === "ol" ? "orderedList" : "bulletList",
        content: items,
      });
    }
    return blocks;
  }

  // li outside of list context — treat as paragraph
  if (tag === "li") {
    const content = convertInlineChildren(el);
    if (inlineNodesToText(content)) {
      blocks.push({ type: "paragraph", content });
    }
    return blocks;
  }

  // Fallback: recurse into children
  if (el.children?.length) {
    for (const child of el.children) {
      if (child.type === "text") {
        const text = (child.data ?? "").trim();
        if (text) {
          blocks.push({ type: "paragraph", content: [{ type: "text", text }] });
        }
        continue;
      }
      blocks.push(...convertBlockElement(child));
    }
  }

  return blocks;
}

function convertChildBlockElements(parent: CheerioElement): TiptapBlockNode[] {
  const blocks: TiptapBlockNode[] = [];
  for (const child of parent.children ?? []) {
    if (child.type === "text") {
      const text = (child.data ?? "").trim();
      if (text) {
        blocks.push({ type: "paragraph", content: [{ type: "text", text }] });
      }
      continue;
    }
    if (child.type === "tag" || child.type === "script" || child.type === "style") {
      if (child.name?.toLowerCase() === "script" || child.name?.toLowerCase() === "style") continue;
      blocks.push(...convertBlockElement(child));
    }
  }
  return blocks;
}

/**
 * Convert HTML string to TipTap JSON document.
 * Preserves: paragraphs, headings (h1-h3), bold, italic, lists, blockquotes.
 * Use this instead of plainTextToTiptapDoc when the source has HTML structure.
 */
export function htmlToTiptapDoc(html: string): TiptapDocument {
  // Lazy-load cheerio to avoid import at module level (cheerio is already a dependency)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cheerio = require("cheerio") as typeof import("cheerio");
  const $ = cheerio.load(html);

  const body = $("body")[0];
  if (!body) return createEmptyDoc();

  const nodes = convertChildBlockElements(body as unknown as CheerioElement);

  if (nodes.length === 0) return createEmptyDoc();

  return { type: "doc", content: nodes };
}

export function plainTextToTiptapDoc(text: string): TiptapDocument {
  const normalized = normalizeInputText(text);
  if (!normalized) return createEmptyDoc();

  const blocks = splitBlocks(normalized);
  const nodes: TiptapBlockNode[] = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const markdownHeading = parseMarkdownHeading(block);
    if (markdownHeading) {
      const node = headingNode(markdownHeading.text, markdownHeading.level);
      if (node) nodes.push(node);
      continue;
    }

    const lines = block
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length > 1) {
      const candidate = lines[0];
      const remainder = lines.slice(1).join(" ");
      const nextForHeading = remainder || blocks[index + 1] || null;
      if (isLikelyHeading(candidate, nextForHeading, index)) {
        const level = headingLevelFromText(candidate, index);
        const heading = headingNode(candidate, level);
        if (heading) nodes.push(heading);
        const paragraph = paragraphNode(remainder);
        if (paragraph) nodes.push(paragraph);
        continue;
      }
    }

    const nextBlock = blocks[index + 1] ?? null;
    if (isLikelyHeading(block, nextBlock, index)) {
      const level = headingLevelFromText(block, index);
      const node = headingNode(block, level);
      if (node) nodes.push(node);
      continue;
    }

    const paragraph = paragraphNode(block);
    if (paragraph) nodes.push(paragraph);
  }

  if (nodes.length === 0) {
    return createEmptyDoc();
  }

  return {
    type: "doc",
    content: nodes,
  };
}

export function toTiptapContent(
  input: ContentInput
): string | Record<string, unknown> {
  if (!input) return "";
  if (typeof input !== "string") return input;

  const trimmed = input.trim();
  if (!trimmed) return "";

  const parsed = tryParseStoredJson(trimmed);
  if (parsed) return normalizeLegacyFlattenedDoc(parsed);

  if (looksLikeHtml(trimmed)) {
    return trimmed;
  }

  return plainTextToTiptapDoc(trimmed);
}
