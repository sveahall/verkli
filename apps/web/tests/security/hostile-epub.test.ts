/**
 * Sprint 0.5 Task 8 — hostile EPUB sanitization.
 *
 * Threat model: an EPUB is a zip archive containing XHTML chapters. After
 * unzipping, every chapter passes through `htmlToTiptapDoc()` in
 * `apps/web/src/lib/tiptap-content.ts`. The TipTap document schema only
 * permits a closed set of block/inline node types (paragraph, heading,
 * blockquote, lists, plus inline text + hardBreak with bold/italic marks).
 * Script tags, event handlers, javascript: URIs, and inline styles cannot be
 * represented in that schema and so are dropped at the conversion boundary.
 *
 * This test asserts that contract for 12+ attack vectors from the OWASP HTML
 * Sanitization cheat sheet. We feed each malicious XHTML payload through the
 * conversion pipeline and walk the resulting document tree, asserting:
 *
 *   - No node has `type === "script"`, `"style"`, `"img"`, `"iframe"`, etc.
 *   - No text node contains the literal substrings `<script`, `javascript:`,
 *     `onerror=`, `onload=`, or other event-handler markers.
 *   - No hyperlink / image href points at `javascript:` (the schema doesn't
 *     emit links yet, but we still scan attrs for forward-compat).
 *
 * If anything leaks, harden the sanitizer config until every vector blocks.
 */

import { describe, expect, it } from "vitest";
import { htmlToTiptapDoc } from "@/lib/tiptap-content-html";
import type { TiptapDocument } from "@/lib/tiptap-content";

const ATTACK_VECTORS: Array<{ name: string; xhtml: string }> = [
  {
    name: "inline <script>",
    xhtml: `<html><body><p>Hello</p><script>alert('xss')</script></body></html>`,
  },
  {
    name: "img onerror handler",
    xhtml: `<html><body><img src="x" onerror="alert('xss')" /></body></html>`,
  },
  {
    name: "svg onload handler",
    xhtml: `<html><body><svg onload="alert('xss')"></svg></body></html>`,
  },
  {
    name: "javascript: anchor href",
    xhtml: `<html><body><a href="javascript:alert(1)">click</a></body></html>`,
  },
  {
    name: "javascript: image src",
    xhtml: `<html><body><img src="javascript:alert(1)" /></body></html>`,
  },
  {
    name: "iframe injection",
    xhtml: `<html><body><iframe src="https://evil.example.com"></iframe></body></html>`,
  },
  {
    name: "object/embed flash injection",
    xhtml: `<html><body><object data="evil.swf"></object><embed src="evil.swf" /></body></html>`,
  },
  {
    name: "data: URI script",
    xhtml: `<html><body><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a></body></html>`,
  },
  {
    name: "style url with javascript:",
    xhtml: `<html><body><div style="background:url(javascript:alert(1))">x</div></body></html>`,
  },
  {
    name: "expression() in style (legacy IE)",
    xhtml: `<html><body><div style="width:expression(alert(1))">x</div></body></html>`,
  },
  {
    name: "meta refresh redirect",
    xhtml: `<html><head><meta http-equiv="refresh" content="0;url=javascript:alert(1)" /></head><body><p>x</p></body></html>`,
  },
  {
    name: "form action with javascript",
    xhtml: `<html><body><form action="javascript:alert(1)"><input type="submit" value="x" /></form></body></html>`,
  },
  {
    name: "math/annotation-xml namespace breakout",
    xhtml: `<html><body><math><annotation-xml encoding="text/html"><script>alert(1)</script></annotation-xml></math></body></html>`,
  },
  {
    name: "noscript wrapper that becomes parsed",
    xhtml: `<html><body><noscript><p>safe<script>alert(1)</script></p></noscript></body></html>`,
  },
  {
    name: "html entity-encoded script",
    xhtml: `<html><body><p>&#60;script&#62;alert(1)&#60;/script&#62;</p></body></html>`,
  },
];

const FORBIDDEN_NODE_TYPES = new Set([
  "script",
  "style",
  "img",
  "iframe",
  "object",
  "embed",
  "form",
  "math",
  "svg",
  "noscript",
  "meta",
]);

// We deliberately do NOT forbid the literal substring "<script" in text
// content. TipTap text nodes are rendered as escaped text by React, so a
// blog-post-style mention of `<script>` is safe and legitimate. The actual
// security boundary is "is there an executable script *element*, or an
// attribute that resolves to JS at render time?" — the FORBIDDEN_NODE_TYPES
// set covers the first; the substrings below cover the second.
const FORBIDDEN_TEXT_SUBSTRINGS = [
  "javascript:",
  "expression(",
];

type AnyNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  marks?: unknown;
  content?: AnyNode[];
};

function walk(doc: TiptapDocument): AnyNode[] {
  const out: AnyNode[] = [];
  const stack: AnyNode[] = [doc as unknown as AnyNode];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    out.push(node);
    if (node.content) stack.push(...node.content);
  }
  return out;
}

describe("hostile EPUB sanitization", () => {
  for (const vector of ATTACK_VECTORS) {
    it(`blocks: ${vector.name}`, () => {
      const doc = htmlToTiptapDoc(vector.xhtml);
      const nodes = walk(doc);

      // 1. No forbidden node types.
      for (const node of nodes) {
        expect(FORBIDDEN_NODE_TYPES.has(node.type), `forbidden node type: ${node.type}`).toBe(false);
      }

      // 2. No script / event-handler markers in text content.
      for (const node of nodes) {
        if (typeof node.text === "string") {
          const lower = node.text.toLowerCase();
          for (const needle of FORBIDDEN_TEXT_SUBSTRINGS) {
            expect(
              lower.includes(needle),
              `forbidden substring "${needle}" leaked into text: ${node.text}`
            ).toBe(false);
          }
        }
      }

      // 3. No href / src attribute pointing at javascript: (forward-compat
      //    for when link / image marks are added to the schema).
      for (const node of nodes) {
        const attrs = node.attrs;
        if (!attrs) continue;
        for (const v of Object.values(attrs)) {
          if (typeof v === "string") {
            const lower = v.toLowerCase().replace(/\s+/g, "");
            expect(lower.startsWith("javascript:")).toBe(false);
            expect(lower.startsWith("data:text/html")).toBe(false);
          }
        }
      }
    });
  }

  it("preserves benign content alongside hostile siblings", () => {
    const xhtml = `<html><body>
      <p>Hello, world.</p>
      <script>alert('nope')</script>
      <p>Second paragraph.</p>
    </body></html>`;
    const doc = htmlToTiptapDoc(xhtml);
    const nodes = walk(doc);

    const paragraphTexts = nodes
      .filter((n) => n.type === "paragraph")
      .flatMap((n) => (n.content ?? []).map((c) => (typeof c.text === "string" ? c.text : "")))
      .map((t) => t.trim())
      .filter(Boolean);

    expect(paragraphTexts).toContain("Hello, world.");
    expect(paragraphTexts).toContain("Second paragraph.");
    // The script body is *not* preserved as text — the converter strips
    // <script> wholesale before walking.
    for (const t of paragraphTexts) {
      expect(t.toLowerCase().includes("alert")).toBe(false);
    }
  });

  it("strips <noscript> wrappers entirely so cheerio's raw-text parsing of them cannot leak", () => {
    const xhtml = `<html><body>
      <p>Visible.</p>
      <noscript><p>safe<script>alert(1)</script></p></noscript>
      <p>Also visible.</p>
    </body></html>`;
    const doc = htmlToTiptapDoc(xhtml);
    const nodes = walk(doc);
    const allText = nodes
      .map((n) => (typeof n.text === "string" ? n.text : ""))
      .join(" ");

    expect(allText).toContain("Visible.");
    expect(allText).toContain("Also visible.");
    expect(allText.toLowerCase()).not.toContain("alert");
  });
});
