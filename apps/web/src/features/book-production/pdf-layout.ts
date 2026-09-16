import "server-only";
import PDFDocument from "pdfkit";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ProductionSettings } from "./model";
import { printableText, type PrintBlock, type PrintRun } from "./pdf-content";
import { PdfValidationError } from "./pdf-error";

export const mm = (value: number) => value * 72 / 25.4;
export type PdfDoc = InstanceType<typeof PDFDocument>;
type Segment = PrintRun & { width: number };
export type PrintLine = { segments: Segment[]; width: number; last: boolean };
export type TextPlacement = { line: PrintLine; x: number; y: number; size: number; width: number; align?: PrintBlock["align"] };
export type InteriorPage = { placements: TextPlacement[]; numbered: boolean };

const fontBytes = new Map<string, Buffer>();
function fontPath(name: string): string {
  const relative = `src/features/book-production/pdf-fonts/${name}.ttf`;
  const candidate = path.join(process.cwd(), relative);
  return existsSync(candidate) ? candidate : path.join(process.cwd(), "apps/web", relative);
}
function fontData(name: string): Buffer {
  const cached = fontBytes.get(name); if (cached) return cached;
  const data = readFileSync(fontPath(name)); fontBytes.set(name, data); return data;
}
export function fontName(family: ProductionSettings["font"], run: Pick<PrintRun, "bold" | "italic"> = {}): string {
  const style = run.bold && run.italic ? "BoldItalic" : run.bold ? "Bold" : run.italic ? "Italic" : "Regular";
  return `Liberation${family === "serif" ? "Serif" : "Sans"}-${style}`;
}
export function createPdf(settings: ProductionSettings): PdfDoc {
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: false, compress: true, pdfVersion: "1.7", font: fontPath(fontName(settings.font)), info: { Title: settings.title, Author: settings.author, Creator: "Verkli book production", Subject: "Paperback proof; printer review required" } });
  for (const bold of [false, true]) for (const italic of [false, true]) {
    const name = fontName(settings.font, { bold, italic }); doc.registerFont(name, fontData(name));
  }
  return doc;
}

export function writePdf(doc: PdfDoc, draw: () => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let bytes = 0;
    doc.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) { doc.destroy(new PdfValidationError("Generated PDF exceeds the 64 MiB output limit. Reduce artwork or manuscript size.")); return; }
      chunks.push(chunk);
    });
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
    try { draw(); doc.end(); } catch (error) { doc.destroy(); reject(error); }
  });
}

export function wrapText(doc: PdfDoc, family: ProductionSettings["font"], runs: PrintRun[], size: number, width: number): PrintLine[] {
  if (width < size * 2) throw new PdfValidationError("The margins and indentation leave too little room for text.");
  const lines: PrintLine[] = []; let segments: Segment[] = []; let occupied = 0;
  const flush = (last: boolean) => {
    while (segments.length && /^\s+$/.test(segments[segments.length - 1].text)) occupied -= segments.pop()!.width;
    lines.push({ segments, width: occupied, last }); segments = []; occupied = 0;
  };
  for (const run of runs) {
    doc.font(fontName(family, run)).fontSize(size);
    for (const token of printableText(run.text).match(/\n|[^\S\n]+|[^\s]+/gu) ?? []) {
      if (token === "\n") { flush(true); continue; }
      const text = /^\s+$/.test(token) ? " " : token;
      if (text === " " && !segments.length) continue;
      const tokenWidth = doc.widthOfString(text);
      if (tokenWidth > width + 0.01) throw new PdfValidationError(`A word or unbroken text fragment is too long to fit: "${text.slice(0, 45)}". Add a space, reduce margins, increase trim width or use smaller type.`);
      if (occupied + tokenWidth > width && segments.length) { flush(false); if (text === " ") continue; }
      segments.push({ ...run, text, width: tokenWidth }); occupied += tokenWidth;
    }
  }
  if (segments.length || !lines.length) flush(true);
  else lines[lines.length - 1].last = true;
  return lines;
}

export function drawLine(doc: PdfDoc, family: ProductionSettings["font"], placement: TextPlacement): void {
  const { line, y, size, width, align } = placement;
  let x = placement.x + (align === "right" ? width - line.width : align === "center" ? (width - line.width) / 2 : 0);
  const spaces = line.segments.filter((segment) => segment.text === " ").length;
  const justify = align === "justify" && !line.last && spaces ? (width - line.width) / spaces : 0;
  for (const segment of line.segments) {
    doc.font(fontName(family, segment)).fontSize(size).text(segment.text, x, y, { lineBreak: false });
    x += segment.width + (segment.text === " " ? justify : 0);
  }
}

export class BookLayout {
  readonly pages: InteriorPage[] = [];
  private y = 0;
  readonly width: number;
  readonly height: number;
  private readonly top: number;
  private readonly bottom: number;

  constructor(private readonly doc: PdfDoc, private readonly settings: ProductionSettings) {
    this.width = mm(settings.trimWidthMm); this.height = mm(settings.trimHeightMm);
    this.top = mm(settings.topMarginMm); this.bottom = this.height - mm(settings.bottomMarginMm);
  }
  private newPage(numbered = true): void {
    if (this.pages.length >= 1000) throw new PdfValidationError("The interior exceeds the 1,000 page print limit. Split the edition or adjust the layout.");
    this.pages.push({ placements: [], numbered }); this.y = this.top;
  }
  startPart(recto: boolean, numbered = true): number {
    if (recto && (this.pages.length + 1) % 2 === 0) this.newPage(false);
    this.newPage(numbered); return this.pages.length;
  }
  finish(): void { if (this.pages.length % 2) this.newPage(false); }
  space(points: number): void { this.y = Math.min(this.bottom, this.y + points); }
  private left(): number { return mm(this.pages.length % 2 ? this.settings.gutterMm : this.settings.outerMarginMm); }
  textWidth(indent = 0): number { return this.width - mm(this.settings.gutterMm + this.settings.outerMarginMm) - indent * 14; }
  add(block: PrintBlock, size = block.level ? this.settings.fontSizePt * (block.level === 1 ? 1.8 : block.level === 2 ? 1.45 : 1.2) : this.settings.fontSizePt): void {
    const indent = block.indent ?? 0; const width = this.textWidth(indent);
    const runs = block.level ? block.runs.map((run) => ({ ...run, bold: true })) : block.runs;
    const lines = wrapText(this.doc, this.settings.font, runs, size, width);
    this.doc.font(fontName(this.settings.font, { bold: Boolean(block.level) })).fontSize(size);
    const lineHeight = Math.max(size * this.settings.leading, this.doc.currentLineHeight(true));
    const gap = block.level ? size * 0.65 : size * 0.6;
    if (lineHeight > this.bottom - this.top) throw new PdfValidationError("Text does not fit the page height. Reduce type size or margins.");
    if (block.level && this.y > this.top && this.y + Math.min(lines.length, 3) * lineHeight + this.settings.fontSizePt * this.settings.leading * 2 > this.bottom) this.newPage();
    for (let index = 0; index < lines.length; index++) {
      const remaining = lines.length - index;
      const capacity = Math.floor((this.bottom - this.y + 0.001) / lineHeight);
      if (capacity < 1 || (capacity === 1 && remaining > 1)) this.newPage();
      this.pages[this.pages.length - 1].placements.push({ line: lines[index], x: this.left() + indent * 14, y: this.y, size, width, align: block.align });
      this.y += lineHeight;
    }
    this.y += gap;
  }
  tocEntry(title: string, page: number): void {
    const size = this.settings.fontSizePt; const width = this.textWidth();
    const numberWidth = size * 3.5;
    const lines = wrapText(this.doc, this.settings.font, [{ text: title }], size, width - numberWidth);
    const lineHeight = size * this.settings.leading;
    if (this.y + lines.length * lineHeight > this.bottom) this.newPage();
    for (const [index, line] of lines.entries()) {
      if (this.y + lineHeight > this.bottom) this.newPage();
      this.pages[this.pages.length - 1].placements.push({ line, x: this.left(), y: this.y, size, width: width - numberWidth });
      if (index === 0) {
        const number = wrapText(this.doc, this.settings.font, [{ text: String(page) }], size, numberWidth)[0];
        this.pages[this.pages.length - 1].placements.push({ line: number, x: this.left() + width - numberWidth, y: this.y, size, width: numberWidth, align: "right" });
      }
      this.y += lineHeight;
    }
    this.y += size * 0.6;
  }
}
