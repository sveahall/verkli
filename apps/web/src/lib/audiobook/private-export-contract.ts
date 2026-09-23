import { createHash } from "node:crypto";
import { z } from "zod";
import { exportFormatSchema } from "./export-contract";
export class PrivateExportError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = "PrivateExportError"; }
}
export const PRIVATE_EXPORT_LIMITS = { chapters: 20, sourceBytes: 20 * 1024 * 1024, totalSourceBytes: 80 * 1024 * 1024, timingBytes: 2 * 1024 * 1024, deadlineMs: 120000 } as const;
const uuid = z.string().uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/), label = z.string().min(1).max(200).regex(/^[^\r\n\0]+$/);
const snapshotSchema = z.object({
  ownerId: uuid,
  book: z.object({ id: uuid, authorId: uuid, title: label, deletedAt: z.string().nullable(), demoRunId: z.string().nullable() }).strict(),
  edition: z.object({ id: uuid, bookId: uuid, language: z.string().min(2).max(8), demoRunId: z.string().nullable() }).strict(),
  authorName: label,
  asset: z.object({ id: uuid, bookId: uuid, language: z.string(), status: z.string(), isSmoke: z.boolean(), demoRunId: z.string().nullable() }).strict(),
  chapterCount: z.number().int().positive().max(PRIVATE_EXPORT_LIMITS.chapters),
  chapters: z.array(z.object({ id: uuid, bookId: uuid, editionId: uuid, order: z.number().int().nonnegative(), title: label, text: z.string().min(1).max(100000), cache: z.object({ id: uuid, chapterId: uuid, editionId: uuid, contentHash: hash, voiceId: z.string().min(1).max(200), modelId: z.string().min(1).max(200), language: z.string(), path: z.string(), bytes: z.number().int().positive().max(PRIVATE_EXPORT_LIMITS.sourceBytes) }).strict() }).strict()).min(1).max(PRIVATE_EXPORT_LIMITS.chapters),
}).strict();
export type PrivateExportSnapshot = z.infer<typeof snapshotSchema>;
export const privateExportRequestSchema = z.object({ editionId: uuid, format: exportFormatSchema, snapshotId: hash }).strict();
export type PrivateExportRequest = z.infer<typeof privateExportRequestSchema>;
export const privateExportEditionSchema = uuid;
const iso3: Record<string, string> = { en: "eng", es: "spa", fr: "fra", de: "deu", it: "ita", pt: "por", sv: "swe", ru: "rus", zh: "zho", ja: "jpn", ko: "kor", ar: "ara" };
export function privateContentHash(text: string, chapterId: string, editionId: string) { return createHash("sha256").update(`${text.trim().replace(/\s+/g, " ")}|${chapterId}|${editionId}`).digest("hex"); }
export function validatePrivateSnapshot(value: unknown, ownerId: string, bookId: string, editionId: string): PrivateExportSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  const fail = () => { throw new PrivateExportError(422, "SOURCE_UNVERIFIED", "This edition does not have a complete, verifiable set of existing audio chapters within the export limits. No audio was generated."); };
  if (!parsed.success) return fail();
  const source = parsed.data;
  if (source.ownerId !== ownerId || source.book.authorId !== ownerId || source.book.id !== bookId || source.edition.id !== editionId || source.edition.bookId !== bookId) throw new PrivateExportError(404, "EDITION_NOT_FOUND", "This edition is not available in your account.");
  if (source.book.deletedAt || source.book.demoRunId || source.edition.demoRunId || source.asset.demoRunId || source.asset.isSmoke || source.asset.status !== "generated" || source.asset.bookId !== bookId || source.asset.language !== source.edition.language) return fail();
  if (!Object.hasOwn(iso3, source.edition.language)) throw new PrivateExportError(422, "AUDIO_LANGUAGE_UNAVAILABLE", "Audio export is not available for this edition language.");
  if (source.chapterCount !== source.chapters.length || new Set(source.chapters.map((chapter) => chapter.id)).size !== source.chapterCount || new Set(source.chapters.map((chapter) => chapter.cache.id)).size !== source.chapterCount) return fail();
  let previous = -1, bytes = 0;
  const voices = new Set<string>();
  for (const chapter of source.chapters) {
    const cache = chapter.cache;
    if (chapter.bookId !== bookId || chapter.editionId !== editionId || cache.chapterId !== chapter.id || cache.editionId !== editionId || cache.language !== source.edition.language || chapter.order <= previous || !chapter.text.trim()) return fail();
    if (cache.contentHash !== privateContentHash(chapter.text, chapter.id, editionId) || !new RegExp(`^cache/${bookId}/${chapter.id}-[a-f0-9]{16}\\.(wav|mp3)$`).test(cache.path)) return fail();
    previous = chapter.order; bytes += cache.bytes; voices.add(JSON.stringify([cache.voiceId, cache.modelId]));
  }
  if (voices.size !== 1 || bytes > PRIVATE_EXPORT_LIMITS.totalSourceBytes) return fail();
  return source;
}
export function privateSnapshotId(source: PrivateExportSnapshot) { return createHash("sha256").update(JSON.stringify(snapshotSchema.parse(source))).digest("hex"); }
export function privateExportMetadata(source: PrivateExportSnapshot) { return { title: source.book.title, author: source.authorName, narrator: "AI narration", language: iso3[source.edition.language] }; }
export function privateExportPreview(source: PrivateExportSnapshot) {
  return { snapshotId: privateSnapshotId(source), editionId: source.edition.id, metadata: privateExportMetadata(source), chapters: source.chapters.map(({ id, title }) => ({ id, title })), limits: PRIVATE_EXPORT_LIMITS };
}
