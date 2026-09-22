import { z } from "zod";
export const exportFormatSchema = z.enum(["mp3-128", "mp3-320", "m4b"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;
const metadataValue = z.string().min(1).max(200).regex(/^[^\r\n\0]+$/);
export const exportMetadataSchema = z.object({ title: metadataValue, author: metadataValue, narrator: metadataValue, language: z.string().regex(/^[a-z]{3}$/) }).strict();
export type ExportMetadata = z.infer<typeof exportMetadataSchema>;
export type ExportChapter = { id: string; title: string; filePath: string; sha256: string };
export type MeasuredExportChapter = { id: string; title: string; startSample: number; endSample: number };
export const EXPORT_SAMPLE_RATE = 48000;
export function exportProfile(format: ExportFormat) {
  return format === "m4b" ? { extension: "m4b", contentType: "audio/mp4", codec: "aac", bitrate: 128000 } : { extension: "mp3", contentType: "audio/mpeg", codec: "mp3", bitrate: format === "mp3-320" ? 320000 : 128000 };
}
export function encodeExportMetadata(metadata: ExportMetadata, chapters: MeasuredExportChapter[]): string {
  const parsed = exportMetadataSchema.parse(metadata);
  const escape = (value: string) => value.replace(/[\\=;#]/g, (char) => `\\${char}`);
  return [";FFMETADATA1", ...Object.entries({ ...parsed, album: parsed.title, artist: parsed.narrator }).map(([key, value]) => `${key}=${escape(value)}`), ...chapters.flatMap((chapter) => ["[CHAPTER]", `TIMEBASE=1/${EXPORT_SAMPLE_RATE}`, `START=${chapter.startSample}`, `END=${chapter.endSample}`, `title=${escape(metadataValue.parse(chapter.title))}`]), ""].join("\n");
}
