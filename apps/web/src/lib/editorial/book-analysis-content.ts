import { z } from "zod";
import { splitReviewText } from "./content";

const chapterSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().max(500),
  order: z.number().int().min(0),
  text: z.string(),
});
export type BookAnalysisChapter = z.infer<typeof chapterSchema>;
export type BookAnalysisPart = { chapterId: string; chapterTitle: string; chapterOrder: number; partIndex: number; text: string };

/** Every source character is included. Limits are explicit failures, never excerpts. */
export function splitBookAnalysis(chapters: BookAnalysisChapter[]): BookAnalysisPart[] {
  const parsed = z.array(chapterSchema).min(1, "The book must contain chapter text.").max(100, "Whole-book analysis supports at most 100 chapters and 100 parts.").parse(chapters);
  if (new Set(parsed.map((chapter) => chapter.id)).size !== parsed.length) throw new Error("Whole-book analysis requires unique chapter identities.");
  if (parsed.reduce((total, chapter) => total + chapter.text.length, 0) > 600000) throw new Error("Whole-book analysis supports at most 600,000 characters. No text has been analysed.");
  const parts = parsed.flatMap((chapter) => splitReviewText(chapter.text).map((text, partIndex) => ({
    chapterId: chapter.id, chapterTitle: chapter.title, chapterOrder: chapter.order, partIndex, text,
  })));
  if (!parts.some((part) => part.text.trim())) throw new Error("The book must contain chapter text before whole-book analysis can start.");
  if (parts.length > 100) throw new Error("Whole-book analysis supports at most 100 parts. No text has been analysed.");
  return parts;
}
