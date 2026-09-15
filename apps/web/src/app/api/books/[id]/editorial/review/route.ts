import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { reviewText, splitReviewText } from "@/lib/editorial/content";
import { reviewModeSchema } from "@/lib/editorial/review-schema";
import { generateEditorialReview } from "@/lib/editorial/provider";

export const runtime = "nodejs";
export const maxDuration = 60;
const limiter = createPerUserRateLimiter({ maxPerMinute: 20 });
const bodySchema = z.object({
  mode: reviewModeSchema,
  chapterId: z.string().uuid(),
  sourceVersionId: z.string().uuid().optional(),
  part: z.number().int().min(0).max(1000).default(0),
});
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuthorRoleForApi();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid book ID.", 400);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Choose a chapter and a valid review type.", 400);
  const { mode, chapterId, sourceVersionId, part } = parsed.data;
  if (!(await limiter.check(gate.user.id)).allowed) return fail("Too many review requests. Wait a minute and try again.", 429);
  const db = await createClient();
  const { data: book, error: bookError } = await db.from("books").select("id, author_id").eq("id", id).maybeSingle();
  if (bookError) { console.error("[editorial review] book lookup failed", { bookId: id, code: bookError.code }); return fail("Could not load the book. Please try again.", 503); }
  if (!book) return fail("Book not found.", 404);
  if (book.author_id !== gate.user.id) return fail("You can only review your own books.", 403);
  const { data: chapter, error: chapterError } = await db.from("chapters").select("id, title, content, order, book_version_id").eq("book_id", id).eq("id", chapterId).maybeSingle();
  if (chapterError) { console.error("[editorial review] chapter lookup failed", { chapterId, code: chapterError.code }); return fail("Could not load the chapter. Please try again.", 503); }
  if (!chapter) return fail("Chapter not found in this book.", 404);
  const text = reviewText(chapter.content);
  if (!text.trim()) return fail("This chapter has no text to review.", 422);
  let sourceText: string | null = null;
  if (mode === "translation") {
    if (!sourceVersionId || sourceVersionId === chapter.book_version_id) return fail("Choose a different version as the translation source.", 400);
    // Chapter ordering is the existing translation worker's correspondence.
    const { data: source, error } = await db.from("chapters").select("content").eq("book_id", id).eq("book_version_id", sourceVersionId).eq("order", chapter.order).maybeSingle();
    if (error) { console.error("[editorial review] translation source lookup failed", { bookId: id, code: error.code }); return fail("Could not uniquely match the source chapter. Check chapter order in both versions.", 422); }
    sourceText = reviewText(source?.content ?? null);
    if (!sourceText) return fail("No source chapter with text exists at this position. Check chapter order in both versions.", 422);
    if (text.length + sourceText.length > 80000) return fail("This chapter pair is too long for translation review. Split it into smaller chapters in both versions first.", 422);
  }
  const parts = mode === "translation" ? [text] : splitReviewText(text);
  if (parts.length > 1001) return fail("This chapter is too long to review. Split it into smaller chapters first.", 422);
  if (part >= parts.length) return fail("This review part no longer exists. Run a new review.", 409);
  try {
    const report = await generateEditorialReview({ mode, text: parts[part], sourceText, chapterTitle: chapter.title });
    return NextResponse.json({ chapterId, chapterTitle: chapter.title, mode, part, partCount: parts.length, reviewedText: parts[part], sourceText, originalContent: chapter.content, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Do not log provider errors containing manuscript excerpts or credentials.
    console.error("[editorial review] generation failed", { bookId: id, chapterId, mode, errorType: error instanceof Error ? error.name : "unknown" });
    return fail("The AI could not complete a valid review. Your text has not changed. Please try again.", 502);
  }
}
