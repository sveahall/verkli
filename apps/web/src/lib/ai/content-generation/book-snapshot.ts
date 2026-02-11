import { createAdminClient } from "@/lib/supabase/admin";
import type { BookSnapshot } from "./schemas";

/**
 * Build a frozen snapshot of book data for content generation grounding.
 * Uses admin client to bypass RLS — caller must verify ownership beforehand.
 */
export async function buildBookSnapshot(
  bookId: string
): Promise<BookSnapshot | null> {
  const admin = createAdminClient();

  // Fetch book
  const { data: book, error: bookErr } = await admin
    .from("books" as never)
    .select("title, description, language, cover_image_url")
    .eq("id", bookId)
    .single();

  if (bookErr || !book) return null;

  const b = book as Record<string, unknown>;

  // Fetch chapter count + first chapter excerpt
  const { data: chapters } = await admin
    .from("chapters" as never)
    .select("content")
    .eq("book_id", bookId)
    .order("sort_order", { ascending: true })
    .limit(1);

  const chapterRows = (chapters ?? []) as Record<string, unknown>[];
  const firstContent = chapterRows[0]?.content;
  const excerpt =
    typeof firstContent === "string"
      ? firstContent.slice(0, 2000)
      : null;

  // Count total chapters
  const { count } = await admin
    .from("chapters" as never)
    .select("id", { count: "exact", head: true })
    .eq("book_id", bookId);

  return {
    title: String(b.title ?? ""),
    description: b.description ? String(b.description) : null,
    language: String(b.language ?? "sv"),
    coverImageUrl: b.cover_image_url ? String(b.cover_image_url) : null,
    chapterExcerpt: excerpt,
    chapterCount: count ?? 0,
  };
}
