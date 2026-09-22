import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isAiCriticEnabled } from "@/lib/flags";
import {
  BudgetExceededError,
  JobCostExceededError,
  checkBudget,
  releaseBudget,
  validateJobCost,
} from "@/lib/workers/budget";
import { reviewText, splitReviewText } from "@/lib/editorial/content";
import { reviewModeSchema } from "@/lib/editorial/review-schema";
import { generateEditorialReview } from "@/lib/editorial/provider";

export const runtime = "nodejs";
export const maxDuration = 60;
const limiter = createPerUserRateLimiter({ name: "editorial-review", maxPerMinute: 20 });
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

  // A per-minute rate limiter caps requests, not cost. Each request here is an
  // Anthropic generation plus, when the critic is on, a full OpenAI
  // re-send — so 20/min was a throughput ceiling on top of an unbounded unit
  // price. Every other expensive AI surface on the platform reserves against
  // lib/workers/budget before spending; this one did not.
  const proGate = await requireProBillingForApi(gate.user.id);
  if (!proGate.ok) return proGate.response;

  const jobId = randomUUID();
  // The critic re-sends the full text to a second provider, so an enabled
  // critic genuinely costs twice the characters.
  const budgetUnits = parts[part].length * (isAiCriticEnabled() ? 2 : 1);
  try {
    validateJobCost({ userId: gate.user.id, pipeline: "editorial", jobSize: budgetUnits, jobId });
    await checkBudget({ userId: gate.user.id, pipeline: "editorial", units: budgetUnits, jobId });
  } catch (error) {
    // Build the message from the error type, never from `err.message`: that
    // string embeds the user id and the Redis budget key.
    if (error instanceof JobCostExceededError) {
      return fail("This review part is too large. Split the chapter into smaller chapters first.", 413);
    }
    if (error instanceof BudgetExceededError) {
      return fail("Daily AI review limit reached. Try again tomorrow.", 429);
    }
    throw error;
  }

  try {
    const report = await generateEditorialReview({ mode, text: parts[part], sourceText, chapterTitle: chapter.title, meter: { userId: gate.user.id, pipeline: "editorial", bookId: id } });
    return NextResponse.json({ chapterId, chapterTitle: chapter.title, mode, part, partCount: parts.length, reviewedText: parts[part], sourceText, originalContent: chapter.content, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // The generation produced nothing usable, so the reservation is owed back.
    // `releaseBudget` is marker-guarded and idempotent, and a failed refund must
    // never mask the error already being reported.
    await releaseBudget({ pipeline: "editorial", jobId }).catch((refundError) => {
      console.warn("[editorial review] budget refund failed", {
        errorType: refundError instanceof Error ? refundError.name : "unknown",
      });
    });
    // Do not log provider errors containing manuscript excerpts or credentials.
    console.error("[editorial review] generation failed", { bookId: id, chapterId, mode, errorType: error instanceof Error ? error.name : "unknown" });
    return fail("The AI could not complete a valid review. Your text has not changed. Please try again.", 502);
  }
}
