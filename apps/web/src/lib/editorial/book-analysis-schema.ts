import { z } from "zod";

export const BOOK_ANALYSIS_CATEGORIES = ["plot", "timeline", "perspective", "characters"] as const;
const categorySchema = z.enum(BOOK_ANALYSIS_CATEGORIES);
export type AnalysisCategory = z.infer<typeof categorySchema>;
const citationSchema = z.object({
  chapterId: z.string().min(1).max(160),
  // Do not trim quotations: they must match the source exactly, including spaces.
  quote: z.string().min(1).max(400).refine((quote) => Boolean(quote.trim()), "A quotation must contain text."),
}).strict();
export type AnalysisCitation = z.infer<typeof citationSchema>;
export const bookAnalysisNoteSchema = z.object({
  category: categorySchema,
  observation: z.string().trim().min(1).max(1000),
  evidence: z.array(citationSchema).min(1).max(3),
}).strict();
export type AnalysisNote = z.infer<typeof bookAnalysisNoteSchema>;
export const bookAnalysisNotesSchema = z.array(bookAnalysisNoteSchema).max(10);
export const bookAnalysisReportSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  areas: z.array(z.object({ category: categorySchema, summary: z.string().trim().min(1).max(1500) }).strict()).length(4)
    .refine((areas) => new Set(areas.map((area) => area.category)).size === 4, "All four analysis categories must appear exactly once."),
  findings: z.array(z.object({
    category: categorySchema,
    severity: z.enum(["suggestion", "important"]),
    title: z.string().trim().min(1).max(200),
    explanation: z.string().trim().min(1).max(1500),
    evidence: z.array(citationSchema).min(2).max(6)
      .refine((evidence) => new Set(evidence.map((citation) => citation.chapterId)).size >= 2, "Each finding requires evidence from two distinct chapters."),
  }).strict()).max(20),
}).strict();
export type BookAnalysisReport = z.infer<typeof bookAnalysisReportSchema>;
