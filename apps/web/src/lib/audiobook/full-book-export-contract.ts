import { z } from "zod";
import { exportFormatSchema, exportMetadataSchema } from "./export-contract";

export const FULL_BOOK_EXPORT_SOURCE_LIMITS = { chapters: 500, sourceBytes: 128 * 1024 * 1024, totalSourceBytes: 2 * 1024 ** 3, timingBytes: 2 * 1024 * 1024, deadlineMs: 60 * 60 * 1000 } as const;
export const fullBookExportRequestSchema = z.object({ editionId: z.string().uuid(), format: exportFormatSchema, snapshotId: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.string().uuid() }).strict();
export type FullBookExportRequest = z.infer<typeof fullBookExportRequestSchema>;
export const fullBookExportJobSchema = z.object({
  id: z.string().uuid(), editionId: z.string().uuid(), format: exportFormatSchema, requestId: z.string().uuid(), snapshotId: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]),
  phase: z.string().max(200), progress: z.number().int().min(0).max(100),
  message: z.string().max(1000).nullable(), createdAt: z.string().datetime(),
  durationSeconds: z.number().positive().nullable(), byteLength: z.number().int().positive().nullable(),
}).strict();
export type FullBookExportJob = z.infer<typeof fullBookExportJobSchema>;
export const fullBookExportPreviewSchema = z.object({
  editionId: z.string().uuid(), snapshotId: z.string().regex(/^[a-f0-9]{64}$/).nullable(), metadata: exportMetadataSchema.nullable(), sourceError: z.string().max(1000).nullable(),
  chapterCount: z.number().int().nonnegative().max(FULL_BOOK_EXPORT_SOURCE_LIMITS.chapters),
  maxOutputBytes: z.number().int().positive().max(4 * 1024 ** 3),
  maxPartBytes: z.number().int().positive().max(64 * 1024 ** 2).nullable().default(null),
  jobs: z.array(fullBookExportJobSchema).max(10),
}).strict();
export type FullBookExportPreview = z.infer<typeof fullBookExportPreviewSchema>;
