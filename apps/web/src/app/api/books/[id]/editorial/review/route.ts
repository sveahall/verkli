import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { reviewText, splitReviewText } from "@/lib/editorial/content";
import { reviewModeSchema } from "@/lib/editorial/review-schema";
import { generateEditorialReview, estimateEditorialUnits, EDITORIAL_MODEL, type EditorialUsage } from "@/lib/editorial/provider";
import { isAiChatEnabled } from "@/lib/flags";
import { checkBudget, releaseBudget, BudgetExceededError } from "@/lib/workers/budget";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";

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
  // Account master AI switch. Server-side, so turning AI off is a real
  // setting and not just a hidden button.
  const aiOff = await aiDisabledResponse(gate.user.id);
  if (aiOff) return aiOff;
  if (!isAiChatEnabled()) return fail("Editorial AI review is currently turned off. Your manuscript has not changed.", 503);
  const configuredBudget = Number(process.env.EDITORIAL_DAILY_BUDGET);
  if (!Number.isSafeInteger(configuredBudget) || configuredBudget <= 0) return fail("Editorial review is unavailable until its daily AI allowance is configured. Please contact support.", 503);
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return fail("Editorial AI is not configured. Please contact support.", 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("Request origin is not allowed.", 403);
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
  const input = { mode, text: parts[part], sourceText, chapterTitle: chapter.title };
  const reservedUnits = estimateEditorialUnits(input);
  const jobId = randomUUID();
  let reserved = false;
  let modelStarted = false;
  let usage: EditorialUsage | null = null;
  let admin: ReturnType<typeof createAdminClient> | null = null;
  const receipt = () => ({ model: EDITORIAL_MODEL, reservedUnits, usage, modelStarted });
  try {
    await checkBudget({ userId: gate.user.id, pipeline: "editorial", units: reservedUnits, jobId });
    reserved = true;
    admin = createAdminClient();
    const { error: insertError } = await admin.from("ai_jobs").insert({ id: jobId, user_id: gate.user.id,
      book_id: id, book_version_id: chapter.book_version_id, kind: "editorial_review", status: "processing",
      started_at: new Date().toISOString(), input: { mode, chapterId, part, model: EDITORIAL_MODEL, reservedUnits } });
    if (insertError) throw new Error("EditorialLedgerUnavailable");
    modelStarted = true;
    const report = await generateEditorialReview(input, async (value) => {
      usage = value;
      // Persist even refused, truncated and invalid responses: tokens were used.
      const { data, error } = await admin!.from("ai_jobs").update({ output: receipt() as unknown as Json })
        .eq("id", jobId).eq("user_id", gate.user.id).select("id").maybeSingle();
      if (error || !data) throw new Error("EditorialUsageReceiptUnavailable");
    });
    const { data, error: saveError } = await admin.from("ai_jobs").update({ status: "completed", progress: 100,
      finished_at: new Date().toISOString(), output: { ...receipt(), report } as unknown as Json })
      .eq("id", jobId).eq("user_id", gate.user.id).select("id").maybeSingle();
    if (saveError || !data) throw new Error("EditorialReportStorageUnavailable");
    return NextResponse.json({ jobId, chapterId, chapterTitle: chapter.title, mode, part, partCount: parts.length, reviewedText: parts[part], sourceText, originalContent: chapter.content, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BudgetExceededError) return fail("This review exceeds your remaining daily AI allowance. Try again after the daily reset.", 429);
    if (reserved && !modelStarted) await releaseBudget({ pipeline: "editorial", jobId });
    // A failed call can still be billed. Keep its reservation; absent usage is
    // explicitly unknown, never reported as zero or automatically refunded.
    if (admin && modelStarted) {
      try {
        const { error: writeError } = await admin.from("ai_jobs").update({ status: "failed", finished_at: new Date().toISOString(),
          error: "Review did not complete. Your manuscript was not changed.", output: receipt() as unknown as Json })
          .eq("id", jobId).eq("user_id", gate.user.id).select("id").maybeSingle();
        if (writeError) console.error("[editorial review] failure receipt unavailable", { jobId, code: writeError.code });
      } catch { console.error("[editorial review] failure receipt unavailable", { jobId }); }
    }
    console.error("[editorial review] generation failed", { bookId: id, chapterId, mode, jobId, modelStarted, errorType: error instanceof Error ? error.name : "unknown" });
    return fail(modelStarted ? "The AI could not complete a valid review. Your text has not changed. Please try again." : "Review limits or usage storage are temporarily unavailable. No model work was started. Please try again.", modelStarted ? 502 : 503);
  }
}
