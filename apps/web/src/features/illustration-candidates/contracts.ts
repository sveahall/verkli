import { z } from "zod";
const uuid = z.string().uuid().transform((value) => value.toLowerCase());
export const scopeKeySchema = z.object({ bookId: uuid, editionId: uuid, chapterId: uuid }).strict();
export type CandidateScopeKey = z.infer<typeof scopeKeySchema>;
export const styleSchema = z.object({ name: z.string().trim().min(1).max(120), medium: z.string().trim().min(1).max(120), palette: z.string().trim().min(1).max(300) }).strict();
export const intentSchema = z.object({ requestId: uuid, expectedChapterVersion: z.number().int().min(0).max(2_147_483_646), alt: z.string().trim().min(1).max(500), placement: z.enum(["icon", "half-page", "full-page"]), styleSnapshot: styleSchema }).strict();
export type CandidateIntent = z.infer<typeof intentSchema>;
export const candidateSchema = z.object({ id: uuid, version: z.number().int().positive(), createdAt: z.string().datetime({ offset: true }), alt: z.string(), placement: intentSchema.shape.placement, styleSnapshot: styleSchema, width: z.number().int().positive(), height: z.number().int().positive(), sourceChapterVersion: z.number().int().nonnegative(), imageUrl: z.string() }).strict();
export type SavedCandidate = z.infer<typeof candidateSchema>;
export const snapshotSchema = z.object({ scope: scopeKeySchema.extend({ chapterVersion: z.number().int().nonnegative(), chapterTitle: z.string() }), candidates: z.array(candidateSchema).max(25) }).strict();
export type CandidateSnapshot = z.infer<typeof snapshotSchema>;
export type CandidateAdapter = { contextId: string; list(signal?: AbortSignal): Promise<CandidateSnapshot>; save(intent: CandidateIntent, file: File, signal?: AbortSignal): Promise<SavedCandidate> };
export function candidateBaseUrl(scope: CandidateScopeKey): string {
  return `/api/books/${scope.bookId}/editions/${scope.editionId}/chapters/${scope.chapterId}/illustrations`;
}
