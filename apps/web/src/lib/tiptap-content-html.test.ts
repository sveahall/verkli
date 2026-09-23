/**
 * Images in the HTML → TipTap conversion.
 *
 * Regression origin: a .docx import of a 41,923-word manuscript landed in the
 * database with 12 pictures missing and no warning anywhere. mammoth wraps
 * each picture in its own <p>, the <img> was dropped by the inline walker
 * because it has no children, and the paragraph was then dropped too for
 * being empty. Nothing in the pipeline counted images, so the loss was silent.
 */
import { describe, expect, it } from "vitest";
import { htmlToTiptapDoc } from "@/lib/tiptap-content-html";
import type { TiptapBlockNode, TiptapDocument } from "@/lib/tiptap-content";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

function imagesIn(doc: TiptapDocument): Extract<TiptapBlockNode, { type: "image" }>[] {
  const out: Extract<TiptapBlockNode, { type: "image" }>[] = [];
  const walk = (blocks: TiptapBlockNode[]) => {
    for (const block of blocks) {
      if (block.type === "image") out.push(block);
      else if (block.type === "blockquote") walk(block.content);
      else if (block.type === "bulletList" || block.type === "orderedList") {
        for (const item of block.content) walk(item.content);
      }
    }
  };
  walk(doc.content);
  return out;
}

describe("htmlToTiptapDoc images", () => {
  it("keeps a picture that mammoth wrapped in its own paragraph", () => {
    const doc = htmlToTiptapDoc(`<html><body><p><img src="${PNG}" /></p></body></html>`);
    const images = imagesIn(doc);

    expect(images).toHaveLength(1);
    expect(images[0].attrs.src).toBe(PNG);
  });

  it("keeps a bare top-level img", () => {
    const doc = htmlToTiptapDoc(`<html><body><img src="${PNG}" alt="Omslag" /></body></html>`);
    const images = imagesIn(doc);

    expect(images).toHaveLength(1);
    expect(images[0].attrs.alt).toBe("Omslag");
  });

  it("keeps both the caption text and the picture from one paragraph", () => {
    const doc = htmlToTiptapDoc(
      `<html><body><p>Bild 1: hamnen<img src="${PNG}" /></p></body></html>`
    );

    expect(doc.content.map((b) => b.type)).toEqual(["paragraph", "image"]);
  });

  it("carries alt and title through, and normalises whitespace in them", () => {
    const doc = htmlToTiptapDoc(
      `<html><body><img src="${PNG}" alt="  en   bild " title="Foto:  Svea " /></body></html>`
    );

    expect(imagesIn(doc)[0].attrs).toEqual({ src: PNG, alt: "en bild", title: "Foto: Svea" });
  });

  it("uses null rather than an empty string for a missing alt", () => {
    const doc = htmlToTiptapDoc(`<html><body><img src="${PNG}" /></body></html>`);

    expect(imagesIn(doc)[0].attrs.alt).toBeNull();
    expect(imagesIn(doc)[0].attrs.title).toBeNull();
  });

  it("finds a picture nested inside a blockquote", () => {
    const doc = htmlToTiptapDoc(
      `<html><body><blockquote><p>citat</p><p><img src="${PNG}" /></p></blockquote></body></html>`
    );

    expect(imagesIn(doc)).toHaveLength(1);
  });

  it("keeps a remote https image", () => {
    const doc = htmlToTiptapDoc(
      `<html><body><img src="https://cdn.example.com/a.png" /></body></html>`
    );

    expect(imagesIn(doc)[0].attrs.src).toBe("https://cdn.example.com/a.png");
  });

  it("does not disturb a document with no pictures", () => {
    const doc = htmlToTiptapDoc(
      `<html><body><p>Ett stycke.</p><p><strong>Fet</strong> text.</p></body></html>`
    );

    expect(imagesIn(doc)).toHaveLength(0);
    expect(doc.content.map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
  });

  describe("rejects a src it cannot vouch for", () => {
    // A rejected src drops the node entirely rather than emitting an image
    // with an unusable or hostile address.
    const rejected: Array<[string, string]> = [
      ["javascript:", "javascript:alert(1)"],
      ["javascript: split by a tab", "java\tscript:alert(1)"],
      ["javascript: split by a newline", "java\nscript:alert(1)"],
      ["data:text/html", "data:text/html;base64,PHNjcmlwdD4="],
      ["data:image/svg+xml, which can carry script", "data:image/svg+xml;base64,PHN2Zz4="],
      ["vbscript:", "vbscript:msgbox(1)"],
      ["a relative path the epub zip no longer backs", "images/fig1.png"],
      ["a protocol-relative host", "//evil.example.com/a.png"],
      ["an empty src", ""],
    ];

    for (const [name, src] of rejected) {
      it(name, () => {
        const doc = htmlToTiptapDoc(
          `<html><body><p><img src="${src}" /></p></body></html>`
        );
        expect(imagesIn(doc)).toHaveLength(0);
      });
    }
  });
});
