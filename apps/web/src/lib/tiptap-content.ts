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

// Exported so callers can avoid re-defining this trivially. Takes plain text
// (already extracted), not a Tiptap node.
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Parses a stored Tiptap JSON string (or falls back to plain text) and counts
// words. Canonical replacement for the ~6 local copies scattered across panels
// and API routes.
export function countWordsInContent(content: string | null): number {
  if (!content) return 0;
  try {
    const parsed = JSON.parse(content);
    return countWords(extractTextFromTiptapNode(parsed));
  } catch {
    return countWords(content);
  }
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
// HTML → TipTap JSON conversion lives in `./tiptap-content-html.ts` because it
// pulls in cheerio (~115 KB gz). Keeping it out of this module ensures client
// bundles that only need countWords/extractTextFromTiptapNode/toTiptapContent
// don't drag cheerio in via webpack tree-shaking edge cases. Server callers
// should `import { htmlToTiptapDoc } from "./tiptap-content-html"`.
// ─────────────────────────────────────────────────────────────────────────────


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
