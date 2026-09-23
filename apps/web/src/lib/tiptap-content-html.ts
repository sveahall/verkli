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

/**
 * Which `src` values are allowed to become an image node.
 *
 * Chapter HTML comes from an uploaded manuscript, so `src` is attacker
 * controlled under the threat model in tests/security/hostile-epub.test.ts.
 * Exactly two shapes can be safe:
 *
 *   http(s)://…      a real remote image
 *   data:image/…     what mammoth hands back for pictures embedded in a .docx
 *
 * `data:image/svg+xml` is deliberately absent. An SVG is a document, not a
 * bitmap: it can carry <script> and event handlers that run when a browser
 * loads it as a top-level document. Everything else is dropped too — relative
 * paths (unresolvable once the epub zip is gone), `javascript:`,
 * `data:text/html`, `vbscript:`, and protocol-relative `//host`.
 */
const SAFE_IMAGE_DATA_URI = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/;

function safeImageSrc(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // Browsers ignore whitespace and control characters when resolving a URL,
  // so "java\tscript:alert(1)" is live markup that a naive prefix check
  // misses. Strip them before deciding anything.
  const cleaned = raw.replace(/[\u0000- \u007f]/g, "");
  if (!cleaned) return null;
  if (SAFE_IMAGE_DATA_URI.test(cleaned)) return cleaned;
  if (/^https?:\/\/[^/]/i.test(cleaned)) return cleaned;
  return null;
}

function imageBlock(el: CheerioElement): TiptapBlockNode | null {
  const src = safeImageSrc(el.attribs?.src);
  if (!src) return null;
  const alt = el.attribs?.alt?.replace(/\s+/g, " ").trim();
  const title = el.attribs?.title?.replace(/\s+/g, " ").trim();
  return { type: "image", attrs: { src, alt: alt || null, title: title || null } };
}

/**
 * Pull images out of a block we otherwise convert inline-only.
 *
 * mammoth wraps every picture in its own <p>. Without this the <img> is
 * dropped by convertInlineChildren (an <img> has no children to walk) and
 * then the now-empty paragraph is dropped as well — which is exactly how
 * docx imports silently lost every illustration.
 */
function collectDescendantImages(el: CheerioElement): TiptapBlockNode[] {
  const out: TiptapBlockNode[] = [];
  const queue = [...(el.children ?? [])];
  while (queue.length > 0) {
    const child = queue.shift();
    if (!child) continue;
    if (child.name?.toLowerCase() === "img") {
      const block = imageBlock(child);
      if (block) out.push(block);
      continue;
    }
    if (child.children?.length) queue.unshift(...child.children);
  }
  return out;
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

  if (tag === "img") {
    const block = imageBlock(el);
    if (block) blocks.push(block);
    return blocks;
  }

  if (tag === "p" || tag === "div") {
    const content = convertInlineChildren(el);
    if (inlineNodesToText(content)) {
      blocks.push({ type: "paragraph", content });
    }
    // A caption and its picture both survive: the text becomes the paragraph
    // above, the picture becomes its own block after it.
    blocks.push(...collectDescendantImages(el));
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
 * Preserves: paragraphs, headings (h1-h3), bold, italic, lists, blockquotes,
 * and images whose src passes safeImageSrc.
 * Use this instead of plainTextToTiptapDoc when the source has HTML structure.
 *
 * Image srcs come out exactly as the source wrote them, `data:` URIs included.
 * Callers that persist the result must run it through
 * uploadImportedChapterImages() first — a `data:` URI left in chapter.content
 * inlines the whole picture into the column on every save and read.
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
