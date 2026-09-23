import "server-only";
import sharp from "sharp";
import { getCoverGeometry, type ProductionSettings } from "./model";
import { printableText } from "./pdf-content";
import { PdfValidationError } from "./pdf-error";
import { createPdf, drawLine, fontName, mm, wrapText, writePdf, type PdfDoc } from "./pdf-layout";
import { PRINT_REVIEW_NOTE, validatePrintSettings } from "./pdf-interior";
import type { CoverPdfResult, PrintArtworkMap } from "./pdf";

type CoverImage = { side: "front" | "back"; buffer: Buffer; width: number; height: number };
async function coverImages(settings: ProductionSettings, artwork: PrintArtworkMap): Promise<CoverImage[]> {
  const result: CoverImage[] = []; let pixels = 0;
  for (const side of ["front", "back"] as const) {
    const asset = artwork[side];
    if (!asset) {
      if (settings.cover[side === "front" ? "frontPath" : "backPath"]) throw new PdfValidationError(`The ${side} artwork could not be loaded. Upload it again before export.`);
      continue;
    }
    if (!Buffer.isBuffer(asset.buffer) || asset.buffer.length > 20 * 1024 * 1024) throw new PdfValidationError(`The ${side} image exceeds the 20 MiB artwork limit.`);
    try {
      const image = sharp(asset.buffer, { limitInputPixels: 50_000_000, failOn: "warning" });
      const metadata = await image.metadata();
      if (!["png", "jpeg"].includes(metadata.format ?? "") || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) throw new PdfValidationError(`The ${side} artwork must be a single PNG or JPEG image.`);
      if (metadata.width !== asset.width || metadata.height !== asset.height) throw new PdfValidationError(`The ${side} artwork dimensions do not match its saved metadata. Upload the original again.`);
      pixels += metadata.width * metadata.height;
      if (pixels > 50_000_000) throw new PdfValidationError("Combined cover artwork exceeds the 50 megapixel print-processing limit. Reduce pixel dimensions while retaining at least 300 dpi.");
      const swapped = metadata.orientation !== undefined && metadata.orientation >= 5;
      const width = swapped ? metadata.height : metadata.width;
      const height = swapped ? metadata.width : metadata.height;
      const dpi = Math.min(width / ((settings.trimWidthMm + settings.bleedMm) / 25.4), height / ((settings.trimHeightMm + settings.bleedMm * 2) / 25.4));
      if (dpi < 300) throw new PdfValidationError(`The ${side} artwork is ${Math.floor(dpi)} dpi after filling the cover and bleed. Supply at least 300 dpi (${Math.ceil((settings.trimWidthMm + settings.bleedMm) / 25.4 * 300)} × ${Math.ceil((settings.trimHeightMm + settings.bleedMm * 2) / 25.4 * 300)} pixels before additional cropping).`);
      // Decode fully before PDFKit receives the file; normalize orientation without resampling.
      const buffer = await image.rotate().png().toBuffer();
      result.push({ side, buffer, width, height });
    } catch (error) {
      if (error instanceof PdfValidationError) throw error;
      throw new PdfValidationError(`The ${side} artwork could not be decoded safely. Upload an intact PNG or JPEG below 50 megapixels.`);
    }
  }
  return result;
}

function fittedText(doc: PdfDoc, settings: ProductionSettings, text: string, box: { x: number; y: number; width: number; height: number }, options: { label: string; size: number; minimum: number; align?: "left" | "center"; bold?: boolean; italic?: boolean }) {
  const value = printableText(text, options.label);
  if (!value.trim()) return;
  let size = options.size;
  while (size >= options.minimum) {
    let lines;
    try { lines = wrapText(doc, settings.font, [{ text: value, bold: options.bold, italic: options.italic }], size, box.width); }
    catch (error) { if (error instanceof PdfValidationError && /too long to fit/.test(error.message)) { size -= 0.5; continue; } throw error; }
    doc.font(fontName(settings.font, options)).fontSize(size);
    const height = Math.max(size * 1.35, doc.currentLineHeight(true));
    if (lines.length * height <= box.height) {
      lines.forEach((line, index) => drawLine(doc, settings.font, { line, x: box.x, y: box.y + index * height, width: box.width, size, align: options.align }));
      return;
    }
    size -= 0.5;
  }
  throw new PdfValidationError(`${options.label} is too long to fit safely on the cover. Shorten it or change the cover design; no text has been clipped.`);
}

export async function buildCoverPdf(settingsInput: ProductionSettings, artwork: PrintArtworkMap): Promise<CoverPdfResult> {
  const settings = validatePrintSettings(settingsInput); const geometry = getCoverGeometry(settings);
  if (geometry.widthMm === null || geometry.frontXMm === null || settings.spineWidthMm === null) throw new PdfValidationError("Enter the printer's final spine measurement before generating the full cover.");
  const images = await coverImages(settings, artwork);
  const doc = createPdf(settings);
  const bleed = mm(settings.bleedMm); const width = mm(settings.trimWidthMm); const height = mm(settings.trimHeightMm);
  const totalWidth = mm(geometry.widthMm); const totalHeight = mm(geometry.heightMm); const frontX = mm(geometry.frontXMm);
  const safe = mm(8); const warnings = [PRINT_REVIEW_NOTE, "Cover artwork uses RGB colour. No printer-specific ICC profile or PDF/X output intent has been applied."];
  if (images.length < 2) warnings.push("One or both cover panels use the selected solid background instead of uploaded artwork.");
  if (settings.cover.reserveBarcode) warnings.push("The barcode area is blank; no ISBN barcode is generated. Arrange barcode placement with the printer.");
  const buffer = await writePdf(doc, () => {
    doc.addPage({ size: [totalWidth, totalHeight], margin: 0 });
    // Physical boxes: outer bleed surrounds the entire spread; no bleed is inserted at the spine folds.
    const pageDictionary = doc.page.dictionary.data as Record<string, unknown>;
    pageDictionary.TrimBox = [bleed, bleed, totalWidth - bleed, totalHeight - bleed];
    pageDictionary.BleedBox = [0, 0, totalWidth, totalHeight];
    doc.rect(0, 0, totalWidth, totalHeight).fill(settings.cover.background);
    for (const image of images) {
      const x = image.side === "back" ? 0 : frontX; const panelWidth = width + bleed;
      doc.save().rect(x, 0, panelWidth, totalHeight).clip();
      doc.image(image.buffer, x, 0, { cover: [panelWidth, totalHeight], align: "center", valign: "center" });
      doc.restore();
    }
    doc.fillColor(settings.cover.textColor);
    const backTextBottom = settings.cover.reserveBarcode ? height - mm(40) : height - safe;
    fittedText(doc, settings, settings.cover.backText, { x: bleed + safe, y: bleed + safe, width: width - safe * 2, height: backTextBottom - safe }, { label: "Back-cover copy", size: 12, minimum: 10 });
    if (settings.cover.printTitle) {
      fittedText(doc, settings, settings.author, { x: frontX + safe, y: bleed + height * 0.1, width: width - safe * 2, height: height * 0.1 }, { label: "Front-cover author", size: 14, minimum: 10, align: "center" });
      fittedText(doc, settings, settings.title, { x: frontX + safe, y: bleed + height * 0.28, width: width - safe * 2, height: height * 0.35 }, { label: "Front-cover title", size: 32, minimum: 18, align: "center" });
      fittedText(doc, settings, settings.subtitle, { x: frontX + safe, y: bleed + height * 0.67, width: width - safe * 2, height: height * 0.18 }, { label: "Front-cover subtitle", size: 14, minimum: 10, italic: true, align: "center" });
    }
    const spineText = printableText(settings.cover.spineText, "Spine text");
    if (spineText.includes("\n")) throw new PdfValidationError("Spine text must use a single line. Remove the line break before export.");
    if (spineText.trim()) {
      const safeSpineWidth = mm(settings.spineWidthMm!) - mm(3);
      if (safeSpineWidth < 8) throw new PdfValidationError("The spine is too narrow for readable text with 1.5 mm safety on each side. Clear the spine text or use the printer's wider final spine.");
      const size = Math.min(11, safeSpineWidth / 1.15);
      doc.font(fontName(settings.font)).fontSize(size);
      if (doc.widthOfString(spineText) > height - safe * 2) throw new PdfValidationError("Spine text is too long to fit safely. Shorten it before export.");
      doc.save().translate(bleed + width + mm(settings.spineWidthMm!) / 2 + size / 2, bleed + safe).rotate(90);
      doc.text(spineText, 0, 0, { lineBreak: false }); doc.restore();
    }
    if (settings.cover.reserveBarcode) doc.rect(bleed + width - safe - mm(50), bleed + height - safe - mm(30), mm(50), mm(30)).fill("#FFFFFF");
  });
  return { buffer, pageCount: 1, warnings };
}
