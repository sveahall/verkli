import { z } from "zod";
import {
  MAX_BOOK_TITLE_LENGTH,
  MAX_BOOK_DESCRIPTION_LENGTH,
  MAX_CHAPTER_LENGTH,
} from "../constants/index.js";

// ─────────────────────────────────────────────────────────────
// Book Schemas
// ─────────────────────────────────────────────────────────────

export const createBookSchema = z.object({
  title: z.string().min(1).max(MAX_BOOK_TITLE_LENGTH),
  description: z.string().max(MAX_BOOK_DESCRIPTION_LENGTH).optional(),
  coverImage: z.string().url().optional(),
});

export const updateBookSchema = createBookSchema.partial();

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

// ─────────────────────────────────────────────────────────────
// Chapter Schemas
// ─────────────────────────────────────────────────────────────

export const createChapterSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(MAX_CHAPTER_LENGTH),
  order: z.number().int().positive(),
});

export const updateChapterSchema = createChapterSchema.partial();

export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;

// ─────────────────────────────────────────────────────────────
// Review Schemas
// ─────────────────────────────────────────────────────────────

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  content: z.string().max(5000).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
