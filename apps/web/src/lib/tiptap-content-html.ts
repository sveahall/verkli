/**
 * HTML → TipTap JSON conversion (server-only).
 *
 * Lives in its own module so that `cheerio` (~115 KB gzipped, used only here)
 * does not get pulled into the client bundle through tiptap-content.ts. The
 * function is invoked exclusively from server-side import flows
 * (`import-extract.ts`) and security tests.
 */
import * as cheerio from "cheerio";
import type {
  TiptapBlockNode,
  TiptapDocument,
  TiptapInlineNode,
  TiptapListItemNode,
  TiptapMark,
} from "./tiptap-content";

type CheerioElement = {
  type: string;
  name?: string;
  data?: string;
  children?: CheerioElement[];
  attribs?: Record<string, string>;
  parent?: CheerioElement;
};

function createEmptyDoc(): TiptapDocument {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function convertInlineChildren(
  el: CheerioElement,
  inheritedMarks: TiptapMark[] = []
): TiptapInlineNode[] {
  const nodes: TiptapInlineNode[] = [];
  const children = el.children ?? [];

  for (const child of children) {
    if (child.type === "text") {
      const text = (child.data ?? "").replace(/\s+/g, " ");
      if (!text) continue;
      const allMarks = [...inheritedMarks];
      const node: TiptapInlineNode = { type: "text", text };
      if (allMarks.length > 0) {
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

    if (
      tag === "strong" ||
      tag === "b" ||
      tag === "em" ||
      tag === "i" ||
      tag === "span" ||
      tag === "a" ||
      tag === "u" ||
      tag === "s"
    ) {
      const extraMarks: TiptapMark[] = [...inheritedMarks];
      if (tag === "strong" || tag === "b") extraMarks.push({ type: "bold" });
      if (tag === "em" || tag === "i") extraMarks.push({ type: "italic" });
      nodes.push(...convertInlineChildren(child, extraMarks));
      continue;
    }

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

  if (tag === "li") {
    const content = convertInlineChildren(el);
    if (inlineNodesToText(content)) {
      blocks.push({ type: "paragraph", content });
    }
    return blocks;
  }

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
  const $ = cheerio.load(html);

  // Defense-in-depth: strip elements that the TipTap schema cannot represent
  // anyway, *before* we walk. cheerio's parser treats `<noscript>` content as
  // raw text (browser-style), so failing to remove noscript here causes its
  // inner HTML to leak as paragraph text. See tests/security/hostile-epub.test.ts.
  $(
    "script, style, noscript, iframe, object, embed, form, svg, math, link, meta"
  ).remove();

  const body = $("body")[0];
  if (!body) return createEmptyDoc();

  const nodes = convertChildBlockElements(body as unknown as CheerioElement);

  if (nodes.length === 0) return createEmptyDoc();

  return { type: "doc", content: nodes };
}
