import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily, FontSize, LineHeight, Link, TextAlign } from "./safeTypography";

const schema = getSchema([
  StarterKit.configure({ link: false }),
  Link,
  TextStyle,
  FontFamily,
  FontSize,
  LineHeight,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
]);

function renderedStyle(attribute: string, value: unknown): unknown {
  if (attribute === "textAlign") {
    const node = schema.node("paragraph", { [attribute]: value });
    return schema.nodes.paragraph.spec.toDOM!(node);
  }
  const mark = schema.mark("textStyle", { [attribute]: value });
  return schema.marks.textStyle.spec.toDOM!(mark, true);
}

describe("untrusted chapter typography", () => {
  it("keeps links usable without letting chapter classes activate app layout utilities", () => {
    const mark = schema.mark("link", {
      href: "https://example.com/book",
      class: "fixed inset-0 z-[9999] bg-white",
    });
    const rendered = JSON.stringify(schema.marks.link.spec.toDOM!(mark, true));
    expect(rendered).toContain("https://example.com/book");
    expect(rendered).not.toContain("fixed");
    expect(rendered).toContain("noopener");
  });

  it.each(["textAlign", "fontFamily", "fontSize", "lineHeight"])(
    "does not render extra CSS declarations from %s",
    (attribute) => {
      const output = renderedStyle(attribute, "left; position: fixed; inset: 0; z-index: 2147483647");
      expect(JSON.stringify(output)).not.toContain("position");
    },
  );

  it.each([
    ["textAlign", "justify", "text-align: justify"],
    ["fontFamily", "'Times New Roman', serif", "font-family: 'Times New Roman', serif"],
    ["fontSize", "18px", "font-size: 18px"],
    ["lineHeight", "1.75", "line-height: 1.75"],
    ["lineHeight", "150%", "line-height: 150%"],
  ])("preserves supported %s formatting", (attribute, value, expected) => {
    expect(JSON.stringify(renderedStyle(attribute, value))).toContain(expected);
  });

  it.each(["url(https://example.invalid/x)", "var(--injected)", "serif/*", "serif\\3b position:fixed", {}, 123])(
    "rejects unsupported font family values: %j",
    (value) => {
      expect(JSON.stringify(renderedStyle("fontFamily", value))).not.toContain("font-family");
    },
  );
});
