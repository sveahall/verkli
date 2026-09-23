import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { savedTranslationText } from "@/lib/saved-translation-text";
import { hashTranslationSource, hashTranslationTarget } from "@/lib/translation-quality-report";
import { isSupportedLanguage } from "@/lib/languages";

const scopeSchema = z.object({ bookId: z.string().uuid(), sourceVersionId: z.string().uuid(), targetLanguage: z.string().refine(isSupportedLanguage) });
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// Reading an edition never invokes translation, billing, or source repair.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  const { id: bookId } = await context.params;
  const url = new URL(request.url);
  const parsed = scopeSchema.safeParse({ bookId, sourceVersionId: url.searchParams.get("sourceVersionId"), targetLanguage: url.searchParams.get("targetLanguage") });
  if (!parsed.success) return respond({ error: "Choose a valid book, source edition and translation language." }, 400);
  const { sourceVersionId, targetLanguage } = parsed.data;
  try {
    const supabase = await createClient();
    const { data: book, error: bookError } = await supabase.from("books").select("author_id").eq("id", bookId).is("deleted_at", null).maybeSingle();
    if (bookError) throw new Error("book_read_failed");
    if (!book || book.author_id !== user.id) return respond({ error: "Book not found." }, 404);
    const { data: source, error: sourceError } = await supabase.from("book_versions").select("id, language_code, status").eq("book_id", bookId).eq("id", sourceVersionId).maybeSingle();
    if (sourceError) throw new Error("source_read_failed");
    if (!source) return respond({ error: "Source edition not found. Select the original manuscript again." }, 404);
    if (source.language_code === targetLanguage) return respond({ error: "Choose a language different from the source edition." }, 400);
    // A duplicate language is ambiguous: maybeSingle fails instead of guessing an edition.
    const { data: target, error: targetError } = await supabase.from("book_versions").select("id, language_code, status").eq("book_id", bookId).eq("language_code", targetLanguage).maybeSingle();
    if (targetError) throw new Error("target_read_failed");
    if (!target) return respond({ source: { ...source, chapters: [] }, target: null });
    const readChapters = (versionId: string) => supabase.from("chapters").select("id, title, content, order")
      .eq("book_id", bookId).eq("book_version_id", versionId).is("deleted_at", null).order("order", { ascending: true }).limit(1000);
    const [original, translated] = await Promise.all([readChapters(source.id), readChapters(target.id)]);
    if (original.error || translated.error) throw new Error("chapter_read_failed");
    // Never present a silently truncated full book (PostgREST's usual row cap is 1000).
    if ((original.data?.length ?? 0) >= 1000 || (translated.data?.length ?? 0) >= 1000) return respond({ error: "This book is too large for the comparison view. Open its chapters in Write." }, 422);
    const chapters = (rows: NonNullable<typeof original.data>) => rows.map((row) => ({ id: row.id, title: row.title, order: row.order, text: savedTranslationText(row.content) }));
    const sourceRows = original.data ?? [];
    const targetRows = translated.data ?? [];
    const fingerprints = {
      source: hashTranslationSource(sourceRows), target: hashTranslationTarget(targetRows),
      chapters: sourceRows.flatMap((chapter) => {
        const matches = chapter.order === null ? [] : targetRows.filter((row) => row.order === chapter.order);
        if (matches.length !== 1 || sourceRows.filter((row) => row.order === chapter.order).length !== 1) return [];
        return [{ sourceChapterId: chapter.id, source: hashTranslationSource([chapter]), target: hashTranslationTarget(matches) }];
      }),
    };
    return respond({ source: { ...source, chapters: chapters(sourceRows) }, target: { ...target, chapters: chapters(targetRows) }, fingerprints });
  } catch (error) {
    console.error("[saved translation] read failed", { bookId, errorType: error instanceof Error ? error.name : "UnknownError" });
    return respond({ error: "Could not load the saved translation. Your manuscript has not changed. Try again." }, 503);
  }
}
