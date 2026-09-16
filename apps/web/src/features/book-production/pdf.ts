import "server-only";

export type PrintChapter = { id: string; title: string; content: unknown; order: number };
export type PrintArtwork = { buffer: Buffer; width: number; height: number };
export type PrintArtworkMap = Partial<Record<"front" | "back", PrintArtwork>>;
export type PrintContentsEntry = { id: string; title: string; page: number };
export type InteriorPdfResult = { buffer: Buffer; pageCount: number; warnings: string[]; contents: PrintContentsEntry[] };
export type CoverPdfResult = { buffer: Buffer; pageCount: 1; warnings: string[] };

export { buildInteriorPdf } from "./pdf-interior";
export { buildCoverPdf } from "./pdf-cover";
export { PdfValidationError } from "./pdf-error";
