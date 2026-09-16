import "server-only";
import { productionSettingsSchema, type ProductionSettings } from "./model";
import { parsePrintContent, printableText, type PrintBlock } from "./pdf-content";
import { BookLayout, createPdf, drawLine, fontName, mm, writePdf, type PdfDoc } from "./pdf-layout";
import { PdfValidationError } from "./pdf-error";
import type { InteriorPdfResult, PrintChapter, PrintContentsEntry } from "./pdf";

type Part = { id: string; title: string; kind: string; recto: boolean; blocks: PrintBlock[] };
const plain = (text: string): PrintBlock[] => printableText(text).split(/\n{2,}/).map((value) => ({ runs: [{ text: value }] }));
export const PRINT_REVIEW_NOTE = "This is a paperback proof PDF, not certified PDF/X. Confirm the printer's paper, colour profile, binding, final spine and file requirements, then inspect a physical proof before a print run.";

export function validatePrintSettings(settings: ProductionSettings): ProductionSettings {
  const parsed = productionSettingsSchema.safeParse(settings);
  if (!parsed.success) throw new PdfValidationError(`Invalid edition settings: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

function partsFor(settings: ProductionSettings, chapters: PrintChapter[]): Part[] {
  if (!Array.isArray(chapters) || !chapters.length) throw new PdfValidationError("Add manuscript chapters before generating an interior.");
  if (chapters.length > 500) throw new PdfValidationError("The manuscript exceeds the 500 chapter print limit.");
  let characters = 0;
  const ids = new Set(settings.sections.map((section) => section.id));
  const manuscript = chapters.map((chapter) => {
    if (!chapter || typeof chapter.id !== "string" || !chapter.id || ids.has(chapter.id) || typeof chapter.title !== "string" || chapter.title.length > 180 || !Number.isFinite(chapter.order)) throw new PdfValidationError("Invalid manuscript chapter metadata or duplicate chapter ID.");
    ids.add(chapter.id);
    let serialized: string;
    try { serialized = typeof chapter.content === "string" ? chapter.content : JSON.stringify(chapter.content ?? ""); }
    catch { throw new PdfValidationError(`Chapter "${chapter.title}" contains unsupported or circular content.`); }
    characters += serialized.length;
    if (characters > 1_000_000 || Buffer.byteLength(serialized, "utf8") > 4 * 1024 * 1024) throw new PdfValidationError("The manuscript exceeds the 1,000,000 character / 4 MiB print limit. Split the edition into volumes.");
    const blocks = parsePrintContent(chapter.content);
    if (!blocks.some((block) => block.runs.some((run) => run.text.trim()))) throw new PdfValidationError(`Chapter "${chapter.title || "Untitled chapter"}" is empty. Add text or remove the empty chapter before export.`);
    return { id: chapter.id, title: printableText(chapter.title || "Untitled chapter", "Chapter title"), kind: "chapter", recto: settings.chaptersStartRecto, blocks, order: chapter.order };
  }).sort((a, b) => a.order - b.order);
  const sections = settings.sections.filter((section) => section.enabled).map((section) => ({ id: section.id, title: printableText(section.title, "Book part heading"), kind: section.kind, recto: section.startRecto, blocks: plain(section.body), placement: section.placement }));
  return [...sections.filter((section) => section.placement === "before"), ...manuscript, ...sections.filter((section) => section.placement === "after")];
}

function paginate(doc: PdfDoc, settings: ProductionSettings, parts: Part[], previous: PrintContentsEntry[]): { layout: BookLayout; contents: PrintContentsEntry[] } {
  const layout = new BookLayout(doc, settings); const contents: PrintContentsEntry[] = [];
  const listed = parts.filter((part) => !["title", "copyright", "contents"].includes(part.kind));
  for (const part of parts) {
    const page = layout.startPart(part.recto, !["title", "copyright"].includes(part.kind));
    if (listed.includes(part)) contents.push({ id: part.id, title: part.title, page });
    if (part.kind === "title") {
      layout.space(mm(settings.trimHeightMm) * 0.12);
      if (settings.author) layout.add({ runs: [{ text: printableText(settings.author) }], align: "center" }, 13);
      layout.space(24);
      layout.add({ runs: [{ text: printableText(settings.title || "Untitled book") }], align: "center" }, 28);
      if (settings.subtitle) layout.add({ runs: [{ text: printableText(settings.subtitle), italic: true }], align: "center" }, 14);
      if (settings.publisher) { layout.space(30); layout.add({ runs: [{ text: printableText(settings.publisher) }], align: "center" }, 11); }
    } else if (part.kind === "copyright") {
      for (const block of plain([settings.rightsText, [settings.publisher, settings.edition, settings.publicationYear].filter(Boolean).join(" · "), settings.isbn ? `ISBN ${settings.isbn}` : ""].filter(Boolean).join("\n\n"))) layout.add(block, 10);
    } else if (part.kind === "contents") {
      layout.add({ runs: [{ text: part.title || "Contents" }], level: 1 });
      for (const entry of listed) layout.tocEntry(entry.title, previous.find((value) => value.id === entry.id)?.page ?? 1);
    } else {
      if (part.title) layout.add({ runs: [{ text: part.title }], level: 1 });
      for (const block of part.blocks) layout.add(block);
    }
  }
  layout.finish(); return { layout, contents };
}

export async function buildInteriorPdf(settingsInput: ProductionSettings, chapters: PrintChapter[]): Promise<InteriorPdfResult> {
  const settings = validatePrintSettings(settingsInput);
  const parts = partsFor(settings, chapters);
  const doc = createPdf(settings);
  let result: ReturnType<typeof paginate>;
  try {
    result = paginate(doc, settings, parts, []);
    let stable = false;
    for (let pass = 0; pass < 5; pass++) {
      const next = paginate(doc, settings, parts, result.contents);
      stable = JSON.stringify(next.contents) === JSON.stringify(result.contents);
      result = next; if (stable) break;
    }
    if (!stable) throw new PdfValidationError("Contents pagination did not converge. Shorten the contents headings or adjust the layout and try again.");
  } catch (error) { doc.destroy(); throw error; }
  const buffer = await writePdf(doc, () => {
    for (const [index, page] of result.layout.pages.entries()) {
      doc.addPage({ size: [mm(settings.trimWidthMm), mm(settings.trimHeightMm)], margin: 0 });
      for (const placement of page.placements) drawLine(doc, settings.font, placement);
      if (page.numbered && page.placements.length) {
        const number = String(index + 1); doc.font(fontName(settings.font)).fontSize(9);
        const x = (mm(settings.trimWidthMm) - doc.widthOfString(number)) / 2;
        doc.text(number, x, mm(settings.trimHeightMm) - mm(settings.bottomMarginMm) / 2 - 5, { lineBreak: false });
      }
    }
  });
  return { buffer, pageCount: result.layout.pages.length, contents: result.contents, warnings: [PRINT_REVIEW_NOTE, "Page references use physical PDF page numbers, including front matter and intentional blank pages. The interior has an even page count for paperback printing.", "Fonts are embedded. Text uses the selected edition typeface; there is no automatic hyphenation."] };
}
