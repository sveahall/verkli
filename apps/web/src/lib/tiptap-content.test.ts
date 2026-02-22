import { describe, expect, it } from "vitest";
import {
  plainTextToTiptapDoc,
  toTiptapContent,
  type TiptapDocument,
} from "./tiptap-content";

function asDoc(value: unknown): TiptapDocument {
  if (!value || typeof value !== "object") {
    throw new Error("Expected tiptap document object");
  }
  return value as TiptapDocument;
}

describe("tiptap-content", () => {
  it("creates heading + paragraphs from plain text import content", () => {
    const doc = plainTextToTiptapDoc(`
Inget kan stoppa oss nu!

Det har ar forsta stycket med tillrackligt manga ord for att klassas som brodtext i en bok.

Det har ar andra stycket med mer innehall som ska bli ett separat stycke.
`);

    expect(doc.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Inget kan stoppa oss nu!" }],
    });
    expect(doc.content[1]?.type).toBe("paragraph");
    expect(doc.content[2]?.type).toBe("paragraph");
  });

  it("parses stored tiptap json without altering structure", () => {
    const raw =
      '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Kapitel 1"}]}]}';

    const content = toTiptapContent(raw);
    const doc = asDoc(content);

    expect(doc.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Kapitel 1" }],
    });
  });

  it("keeps html content untouched for backward compatibility", () => {
    const html = "<h1>Rubrik</h1><p>Brodtext</p>";
    expect(toTiptapContent(html)).toBe(html);
  });

  it("normalizes legacy flattened single-block docs into heading + paragraph", () => {
    const flattened =
      '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Inget kan stoppa oss nu! Johan Stael von Holstein skriver vidare med tillrackligt manga ord for att detta ska vara brodtext och inte bara en rubrikrad i editorn."}]}]}';

    const content = toTiptapContent(flattened);
    const doc = asDoc(content);

    expect(doc.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Inget kan stoppa oss nu!" }],
    });
    expect(doc.content[1]?.type).toBe("paragraph");
  });

  it("treats single newlines as paragraph breaks when lines look complete", () => {
    const doc = plainTextToTiptapDoc(`
Forsta stycket slutar har.
Andra stycket slutar har.
Tredje stycket slutar har.
Fjarde stycket slutar har.
`);

    expect(doc.content).toHaveLength(4);
    expect(doc.content.every((node) => node.type === "paragraph")).toBe(true);
  });

  it("extracts inline heading when a heading and body share the same block", () => {
    const doc = plainTextToTiptapDoc(`
Kapitel 1
Det har ar kapiteltext med tillrackligt manga ord for att tolkas som brodtext och inte en rubrik.
`);

    expect(doc.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Kapitel 1" }],
    });
    expect(doc.content[1]?.type).toBe("paragraph");
  });
});
