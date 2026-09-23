import "server-only";
import * as cheerio from "cheerio";
import latinCoverage from "./pdf-fonts/latin-coverage.json";
import { PdfValidationError } from "./pdf-error";

export type PrintRun = { text: string; bold?: boolean; italic?: boolean };
export type PrintBlock = { runs: PrintRun[]; level?: number; indent?: number; align?: "left" | "center" | "right" | "justify" };
const supportedGlyphs = new Set(latinCoverage);
const fail = (message: string): never => { throw new PdfValidationError(message); };

// Generated from the intersection of all eight bundled fonts' cmap tables.
// Restrict to Latin scripts until bidirectional shaping and script-specific layout exist.
export function printableText(value: string, label = "Text"): string {
  const text = value.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  for (const character of text) {
    const point = character.codePointAt(0)!;
    if (character !== "\n" && !supportedGlyphs.has(point)) fail(`${label} contains unsupported character U+${point.toString(16).toUpperCase().padStart(4, "0")}. This print edition supports Latin text, including Swedish. Replace the character or use a typesetter that supports its script.`);
  }
  return text;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Unsupported manuscript node. Expected a TipTap object.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) fail(`Unsupported manuscript property "${unknown}". Remove this formatting before export.`);
}
function alignment(value: unknown): PrintBlock["align"] {
  if (value === undefined || value === null) return "left";
  if (value === "left" || value === "center" || value === "right" || value === "justify") return value;
  return fail("Unsupported paragraph alignment.");
}

function tiptapBlocks(input: unknown): PrintBlock[] {
  let count = 0;
  const inspect = (value: unknown, depth: number) => {
    if (++count > 30_000 || depth > 20) fail("Manuscript nesting or node count exceeds the print limit.");
    const node = record(value);
    keys(node, ["type", "content", "attrs", "marks", "text"]);
    return node;
  };
  function children(node: Record<string, unknown>): unknown[] {
    if (node.content === undefined) return [];
    if (!Array.isArray(node.content)) fail("Unsupported manuscript content array.");
    return node.content as unknown[];
  }
  function inline(value: unknown, depth: number): PrintRun[] {
    const node = inspect(value, depth);
    if (node.type === "hardBreak") { keys(node, ["type"]); return [{ text: "\n" }]; }
    if (node.type !== "text" || typeof node.text !== "string") fail(`Unsupported inline node "${String(node.type)}". Supported: text and line breaks.`);
    keys(node, ["type", "text", "marks"]);
    const run: PrintRun = { text: printableText(node.text as string, "Manuscript") };
    if (node.marks !== undefined && !Array.isArray(node.marks)) fail("Unsupported text marks.");
    for (const value of (node.marks ?? []) as unknown[]) {
      const mark = record(value); keys(mark, ["type"]);
      if (mark.type === "bold") run.bold = true;
      else if (mark.type === "italic") run.italic = true;
      else fail(`Unsupported text mark "${String(mark.type)}". This export preserves bold and italic; remove other character formatting first.`);
    }
    return [run];
  }
  function walk(value: unknown, depth = 0, indent = 0): PrintBlock[] {
    const node = inspect(value, depth);
    keys(node, ["type", "content", "attrs"]);
    const attrs = node.attrs === undefined ? {} : record(node.attrs);
    if (node.type === "paragraph" || node.type === "heading") {
      keys(attrs, node.type === "heading" ? ["level", "textAlign"] : ["textAlign"]);
      const level = node.type === "heading" ? Number(attrs.level) : undefined;
      if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 6)) fail("Unsupported heading level.");
      return [{ runs: children(node).flatMap((child) => inline(child, depth + 1)), level, indent, align: alignment(attrs.textAlign) }];
    }
    if (node.type === "doc" || node.type === "blockquote" || node.type === "listItem") {
      keys(attrs, []);
      return children(node).flatMap((child) => walk(child, depth + 1, indent + (node.type === "blockquote" ? 1 : 0)));
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      keys(attrs, node.type === "orderedList" ? ["start", "type"] : []);
      if (attrs.type !== undefined && attrs.type !== null && attrs.type !== "1") fail("Unsupported ordered-list numbering style.");
      const start = Number(attrs.start ?? 1);
      if (!Number.isInteger(start) || start < 1 || start > 9999) fail("Unsupported list start number.");
      return children(node).flatMap((item, index) => {
        if (record(item).type !== "listItem") fail("Unsupported list item.");
        const blocks = walk(item, depth + 1, indent + 1);
        if (blocks[0]) blocks[0].runs.unshift({ text: node.type === "orderedList" ? `${start + index}. ` : "• " });
        return blocks;
      });
    }
    return fail(`Unsupported manuscript node "${String(node.type)}". Images, tables, code and embedded content require a separate typesetting workflow.`);
  }
  if (record(input).type !== "doc") fail("Unsupported manuscript object: expected a TipTap document.");
  return walk(input);
}

type HtmlNode = { type: string; name?: string; data?: string; attribs?: Record<string, string>; children?: HtmlNode[] };
function htmlBlocks(html: string): PrintBlock[] {
  const $ = cheerio.load(html, {}, false);
  const allowed = new Set(["p", "div", "span", "strong", "b", "em", "i", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "br"]);
  let count = 0;
  function validate(node: HtmlNode, depth = 0) {
    if (++count > 30_000 || depth > 20) fail("Manuscript HTML exceeds the print nesting or node limit.");
    if (node.type === "text" || node.type === "comment") return;
    if (!allowed.has(node.name ?? "")) fail(`Unsupported manuscript HTML <${node.name ?? node.type}>. Remove this element before export.`);
    for (const [key, value] of Object.entries(node.attribs ?? {})) {
      if (key === "start" && node.name === "ol" && /^\d{1,4}$/.test(value) && Number(value) > 0) continue;
      if (key === "style" && /^(p|div|h[1-6])$/.test(node.name ?? "") && /^\s*text-align\s*:\s*(left|center|right|justify)\s*;?\s*$/i.test(value)) continue;
      fail(`Unsupported HTML attribute "${key}" on <${node.name}>. This print export does not silently discard styling.`);
    }
    for (const child of node.children ?? []) validate(child, depth + 1);
  }
  const nodes = $.root().contents().toArray() as unknown as HtmlNode[];
  nodes.forEach((node) => validate(node));
  function inline(node: HtmlNode, marks: Omit<PrintRun, "text"> = {}): PrintRun[] {
    if (node.type === "comment") return [];
    if (node.type === "text") return [{ text: printableText((node.data ?? "").replace(/[\t\r\n ]+/g, " "), "Manuscript"), ...marks }];
    if (node.name === "br") return [{ text: "\n", ...marks }];
    if (!["span", "strong", "b", "em", "i"].includes(node.name ?? "")) fail(`Unsupported block <${node.name}> inside a text paragraph.`);
    return (node.children ?? []).flatMap((child) => inline(child, { bold: marks.bold || ["b", "strong"].includes(node.name ?? ""), italic: marks.italic || ["i", "em"].includes(node.name ?? "") }));
  }
  function walk(children: HtmlNode[], indent = 0): PrintBlock[] {
    const blocks: PrintBlock[] = []; let pending: PrintRun[] = [];
    const flush = () => { if (pending.some((run) => run.text.trim())) blocks.push({ runs: pending, indent }); pending = []; };
    for (const node of children) {
      if (node.type === "comment") continue;
      const tag = node.name ?? "";
      if (node.type === "text" || ["span", "strong", "b", "em", "i", "br"].includes(tag)) { pending.push(...inline(node)); continue; }
      flush();
      if (["ul", "ol"].includes(tag)) {
        let number = Number(node.attribs?.start ?? 1);
        for (const item of node.children ?? []) {
          if (item.type === "text" && !item.data?.trim() || item.type === "comment") continue;
          if (item.name !== "li") fail("Unsupported element inside a list.");
          const items = walk(item.children ?? [], indent + 1);
          if (items[0]) items[0].runs.unshift({ text: tag === "ol" ? `${number}. ` : "• " });
          blocks.push(...items); number++;
        }
      } else if (tag === "blockquote" || tag === "div" || tag === "li") {
        const nested = walk(node.children ?? [], indent + (tag === "blockquote" ? 1 : 0));
        if (node.attribs?.style) nested.forEach((block) => { block.align = alignment(node.attribs!.style.match(/:\s*(\w+)/)?.[1]); });
        blocks.push(...nested);
      } else {
        blocks.push({ runs: (node.children ?? []).flatMap((child) => inline(child)), indent, level: /^h[1-6]$/.test(tag) ? Number(tag[1]) : undefined, align: alignment(node.attribs?.style?.match(/:\s*(\w+)/)?.[1]) });
      }
    }
    flush(); return blocks;
  }
  return walk(nodes);
}

export function parsePrintContent(input: unknown): PrintBlock[] {
  if (input === null || input === undefined || input === "") return [];
  if (typeof input === "object") return tiptapBlocks(input);
  if (typeof input !== "string") return fail("Unsupported manuscript content type.");
  if (input.length > 1_000_000) return fail("Manuscript exceeds the 1,000,000 character print limit.");
  const trimmed = input.trim();
  if (trimmed.startsWith("{")) {
    let json: unknown;
    try { json = JSON.parse(trimmed); } catch { return fail("Unsupported or malformed stored manuscript JSON."); }
    return tiptapBlocks(json);
  }
  if (/<\/?[a-z][^>]*>/i.test(input)) return htmlBlocks(input);
  return printableText(input, "Manuscript").split(/\n{2,}/).map((text) => ({ runs: [{ text: text.trim() }] }));
}
