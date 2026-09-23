import { z } from "zod";
import { bookAnalysisNotesSchema, bookAnalysisReportSchema } from "./book-analysis-schema";

export const analysisManifestSchema = z.object({
  protocol: z.literal("whole-book-v1"), versionId: z.string().uuid(), fingerprint: z.string().min(1),
  partCount: z.number().int().min(1).max(100), emptyChapters: z.number().int().min(0),
  chapters: z.array(z.object({ id: z.string().uuid(), title: z.string(), order: z.number() })).max(1000),
});
export const analysisRunSchema = z.object({
  completedParts: z.number().int().min(0).max(100),
  notes: z.array(bookAnalysisNotesSchema.element).max(1000),
  receipts: z.array(z.object({ step: z.number().int().min(0), reservedUnits: z.number().int().positive(),
    usage: z.object({ model: z.string(), inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative(), cacheCreationInputTokens: z.number().nonnegative(), cacheReadInputTokens: z.number().nonnegative() }).nullable(),
  })).max(101),
  report: bookAnalysisReportSchema.nullable(),
});
export type AnalysisRun = z.infer<typeof analysisRunSchema>;
export type AnalysisManifest = z.infer<typeof analysisManifestSchema>;
export type BookAnalysisResult = {
  jobId: string; status: "pending" | "processing" | "completed" | "failed";
  createdAt: string; completedParts: number; totalParts: number; emptyChapters: number;
  chapters: AnalysisManifest["chapters"]; report: AnalysisRun["report"]; error: string | null; stale: boolean;
};
