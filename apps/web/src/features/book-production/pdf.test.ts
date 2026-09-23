import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import { createProductionSection, createProductionSettings } from "./model";
import { buildCoverPdf, buildInteriorPdf } from "./pdf";

const chapter = (content = "<p>Åsa äger en ö. The end.</p>") => ({ id: "chapter-one", title: "The crossing", content, order: 1 });
async function textOf(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try { return await parser.getText(); } finally { await parser.destroy(); }
}

describe("book production PDF", () => {
  it("creates an actual paginated Swedish interior with embedded fonts and accurate contents", async () => {
    const settings = createProductionSettings({ title: "Skärgården", author: "Åsa Öberg" });
    const foreword = { ...createProductionSection("foreword"), body: "Förord med egna ord.", title: "Förord" };
    settings.sections.push(foreword);
    const longText = Array.from({ length: 100 }, (_, index) => `<p>Paragraph ${index}: Åsa äger en ö. ${"The harbour was quiet and the ferry waited. ".repeat(15)}</p>`).join("");
    const result = await buildInteriorPdf(settings, [chapter(longText), { ...chapter("<p>A final thought.</p>"), id: "last", title: "Last chapter", order: 2 }]);
    const extracted = await textOf(result.buffer);
    expect(result.pageCount).toBeGreaterThan(10);
    expect(extracted.total).toBe(result.pageCount);
    expect(extracted.text).toContain("Skärgården");
    expect(extracted.text).toContain("Paragraph 99");
    expect(extracted.text).toContain("A final thought.");
    for (const entry of result.contents) {
      expect(extracted.pages[entry.page - 1].text).toContain(entry.title);
      expect(entry.page % 2).toBe(1);
      const toc = extracted.pages.find((page) => page.text.includes("Contents"));
      expect(toc?.text).toMatch(new RegExp(`${entry.title}\\s+${entry.page}(?:\\s|$)`));
    }
    expect(result.buffer.toString("latin1")).toContain("/FontFile2");
    expect(result.warnings.join(" ")).toMatch(/PDF\/X/);
  // Exports and re-parses a full book; the full suite can hold this past a minute.
  }, 180_000);

  it("uses requested trim geometry, keeps excluded parts out, and sorts manuscript order", async () => {
    const settings = createProductionSettings({ title: "Book", author: "Author" });
    settings.trimWidthMm = 127; settings.trimHeightMm = 203.2; settings.font = "sans";
    settings.sections = [{ ...createProductionSection("afterword"), enabled: false, body: "DO NOT PRINT" }];
    const result = await buildInteriorPdf(settings, [{ ...chapter("Second"), id: "two", title: "Second chapter", order: 2 }, chapter("First")]);
    const text = await textOf(result.buffer);
    expect(text.text).not.toContain("DO NOT PRINT");
    expect(result.contents.map((entry) => entry.id)).toEqual(["chapter-one", "two"]);
    const mediaBox = result.buffer.toString("latin1").match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(Number(mediaBox?.[1])).toBeCloseTo(360, 4);
    expect(Number(mediaBox?.[2])).toBeCloseTo(576, 4);
  });

  it("preserves supported headings, emphasis, lists, quotations, and line breaks", async () => {
    const settings = createProductionSettings(); settings.sections = [];
    const result = await buildInteriorPdf(settings, [chapter('<h2>A heading</h2><p>Plain <strong>bold</strong> <em>italic</em> <strong><em>both</em></strong><br>New line</p><ul><li>Apples</li><li>Pears</li></ul><ol start="3"><li>Third</li><li>Fourth</li></ol><blockquote><p>A quotation</p></blockquote>')]);
    const text = await textOf(result.buffer);
    for (const expected of ["A heading", "bold", "italic", "both", "New line", "Apples", "Pears", "3. Third", "4. Fourth", "A quotation"]) expect(text.text).toContain(expected);
    for (const font of ["LiberationSerif", "LiberationSerif-Bold", "LiberationSerif-Italic", "LiberationSerif-BoldItalic"]) expect(result.buffer.toString("latin1")).toContain(font);
  });

  it.each(["<p>Before<img src='x'>After</p>", "<table><tr><td>Cell</td></tr></table>", "<p><u>Underlined</u></p>", "<p style='color:red'>Coloured</p>", "<script>alert(1)</script>"])("rejects unsupported manuscript formatting without silently deleting it: %s", async (content) => {
    await expect(buildInteriorPdf(createProductionSettings(), [chapter(content)])).rejects.toThrow(/unsupported/i);
  });

  it("rejects unsupported scripts and excessive input with an actionable error", async () => {
    await expect(buildInteriorPdf(createProductionSettings(), [chapter("中文")])).rejects.toThrow(/unsupported.*U\+4E2D/i);
    await expect(buildInteriorPdf(createProductionSettings(), [chapter("x".repeat(1_000_001))])).rejects.toThrow(/limit|too large/i);
    await expect(buildInteriorPdf(createProductionSettings(), [])).rejects.toThrow(/manuscript|chapter/i);
  });

  it("reads real TipTap objects and stored JSON without dropping unsupported nodes or marks", async () => {
    const settings = createProductionSettings(); settings.sections = [];
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Swedish ö and bold", marks: [{ type: "bold" }] }] }] };
    for (const content of [doc, JSON.stringify(doc)]) {
      const result = await buildInteriorPdf(settings, [{ ...chapter(), content }]);
      expect((await textOf(result.buffer)).text).toContain("Swedish ö and bold");
    }
    for (const content of [{ type: "doc", content: [{ type: "image", attrs: { src: "secret" } }] }, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] }] }]) {
      await expect(buildInteriorPdf(settings, [{ ...chapter(), content }])).rejects.toThrow(/unsupported/i);
    }
  });

  it("generates an exact one-page wrap with separate artwork and no internal bleed", async () => {
    const settings = createProductionSettings({ title: "The crossing", author: "Åsa" }); settings.spineWidthMm = 12;
    settings.cover.backText = "A voyage over a quiet sea.";
    settings.cover.spineText = "The crossing · Åsa";
    const buffer = await sharp({ create: { width: 2400, height: 3400, channels: 3, background: "#b6d6de" } }).png().toBuffer();
    const result = await buildCoverPdf(settings, { front: { buffer, width: 2400, height: 3400 }, back: { buffer, width: 2400, height: 3400 } });
    const text = await textOf(result.buffer);
    expect(text.total).toBe(1);
    expect(text.text).toContain("A voyage over a quiet sea.");
    expect(text.text).toContain("The crossing · Åsa");
    const mediaBox = result.buffer.toString("latin1").match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(Number(mediaBox?.[1])).toBeCloseTo(314 * 72 / 25.4, 4);
    expect(Number(mediaBox?.[2])).toBeCloseTo(216 * 72 / 25.4, 4);
    expect(result.warnings.join(" ")).toMatch(/barcode|colour|color/i);
  });

  it("blocks missing spine, low resolution, mismatched metadata, and overflowing cover copy", async () => {
    const settings = createProductionSettings({ title: "Book" });
    await expect(buildCoverPdf(settings, {})).rejects.toThrow(/spine/i);
    settings.spineWidthMm = 12;
    const buffer = await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } }).png().toBuffer();
    await expect(buildCoverPdf(settings, { front: { buffer, width: 100, height: 100 } })).rejects.toThrow(/300.*dpi|dpi.*300/i);
    await expect(buildCoverPdf(settings, { front: { buffer, width: 3000, height: 4000 } })).rejects.toThrow(/dimensions|metadata/i);
    settings.cover.backText = "A lot of back cover copy. ".repeat(300);
    await expect(buildCoverPdf(settings, {})).rejects.toThrow(/back.*(fit|overflow|long)/i);
  });

  it("honours an intentionally blank spine even when the book has a title", async () => {
    const settings = createProductionSettings({ title: "A slim volume" }); settings.spineWidthMm = 1;
    settings.cover.spineText = "";
    expect((await buildCoverPdf(settings, {})).pageCount).toBe(1);
  });

  it("accepts original EXIF-rotated JPEG bytes and preflights the displayed orientation", async () => {
    const settings = createProductionSettings({ title: "An oriented cover" }); settings.spineWidthMm = 12;
    const buffer = await sharp({ create: { width: 3400, height: 2400, channels: 3, background: "#afbdcc" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await buildCoverPdf(settings, { front: { buffer, width: 3400, height: 2400 } });
    expect((await textOf(result.buffer)).total).toBe(1);
    const parser = new PDFParse({ data: result.buffer });
    try {
      const images = await parser.getImage({ imageBuffer: false, imageDataUrl: false });
      expect(images.pages[0].images[0]).toMatchObject({ width: 2400, height: 3400 });
    } finally { await parser.destroy(); }
  });

  it("keeps contents references accurate when the contents itself spans several pages", async () => {
    const settings = createProductionSettings({ title: "Many short chapters" });
    settings.chaptersStartRecto = false;
    const chapters = Array.from({ length: 60 }, (_, index) => ({ id: `c-${index}`, title: `Chapter ${String(index + 1).padStart(2, "0")}`, order: index, content: `<p>Unique body ${index + 1}.</p>` }));
    const result = await buildInteriorPdf(settings, chapters);
    const extracted = await textOf(result.buffer);
    expect(result.contents[0].page).toBeGreaterThan(4);
    const contentsText = extracted.pages.slice(2, result.contents[0].page - 1).map((page) => page.text).join("\n");
    result.contents.forEach((entry, index) => {
      expect(contentsText).toMatch(new RegExp(`${entry.title}\\s+${entry.page}(?:\\s|$)`));
      expect(extracted.pages[entry.page - 1].text).toContain(`Unique body ${index + 1}.`);
    });
    expect(result.pageCount % 2).toBe(0);
  });

  it("rejects excessive nesting, chapter counts, and unbreakable overflow", async () => {
    const settings = createProductionSettings(); settings.sections = [];
    let node: unknown = { type: "paragraph", content: [{ type: "text", text: "Deep" }] };
    for (let depth = 0; depth < 25; depth++) node = { type: "blockquote", content: [node] };
    await expect(buildInteriorPdf(settings, [{ ...chapter(), content: { type: "doc", content: [node] } }])).rejects.toThrow(/nesting|limit/i);
    await expect(buildInteriorPdf(settings, Array.from({ length: 501 }, (_, index) => ({ ...chapter(), id: String(index) })))).rejects.toThrow(/500 chapter/i);
    await expect(buildInteriorPdf(settings, [chapter("x".repeat(1000))])).rejects.toThrow(/too long to fit/i);
  });

  it("returns readable validation errors for malformed chapter metadata and multi-line spine text", async () => {
    await expect(buildInteriorPdf(createProductionSettings(), [null, chapter()] as never)).rejects.toThrow(/invalid manuscript chapter/i);
    const settings = createProductionSettings(); settings.spineWidthMm = 12; settings.cover.spineText = "Two\nlines";
    await expect(buildCoverPdf(settings, {})).rejects.toThrow(/spine.*single line/i);
  });
});
