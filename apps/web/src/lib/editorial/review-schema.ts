import { z } from "zod";
export const reviewModeSchema = z.enum(["proofread", "analysis", "translation"]);
export type ReviewMode = z.infer<typeof reviewModeSchema>;
export const editorialReportSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  findings: z.array(z.object({
    category: z.enum(["spelling", "grammar", "style", "plot", "characters", "pacing", "translation", "consistency"]),
    severity: z.enum(["suggestion", "important"]),
    explanation: z.string().trim().min(1).max(1500),
    quote: z.string().max(1000),
  })).max(25),
  corrections: z.array(z.object({
    original: z.string().min(1).max(1000),
    replacement: z.string().max(1500),
    reason: z.string().trim().min(1).max(1000),
  })).max(25),
});
export type EditorialReport = z.infer<typeof editorialReportSchema>;
export type ReviewResult = {
  chapterId: string;
  chapterTitle: string;
  mode: ReviewMode;
  part: number;
  partCount: number;
  reviewedText: string;
  sourceText: string | null;
  originalContent: string | null;
  report: EditorialReport;
};
