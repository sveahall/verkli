import { reviewedTranslationActivationReady, isTranslationCommitReceipt, REVIEWED_TRANSLATION_PROTOCOL } from "@/lib/translation-commit";
import { translationQualityReservationKey } from "@/lib/translation-quality-budget";
import { createHash, randomUUID } from "node:crypto";
import { isTranslationsEnabled } from "@/lib/flags";
import type { UsageReceipt } from "@/lib/ai/translation-quality/types";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPlainText, resolveTranslationSourceContext } from "@/lib/book-translation";
import { isSupportedLanguage } from "@/lib/languages";
import { translateWithQuality } from "@/lib/ai/translation-quality/anthropic";
import { getTranslationQueue } from "@/lib/translation-queue";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { hashTranslationSource, hashTranslationTarget, TRANSLATION_QUALITY_JOB_KIND, type TranslationQualityRecord } from "@/lib/translation-quality-report";
import type { Json } from "@/lib/supabase/types";
import { checkBudget, releaseBudget, BudgetExceededError } from "@/lib/workers/budget";
import { estimateTranslationQualitySample } from "@/lib/translation-quality-budget";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";
import { isBrowserOriginAllowed } from "@/lib/request-url";

export const maxDuration = 180;
const limiter = createPerUserRateLimiter({ name: "translation-quality", maxPerMinute: 2, windowMs: 60_000 });
const bodySchema = z.object({
  targetLanguage: z.string().refine(isSupportedLanguage),
  sourceVersionId: z.string().uuid(),
  authorGuidance: z.string().max(2000).optional(),
}).strict();
type Context = { params: Promise<{ id: string }> };
const failure = (error: string, status: number) => NextResponse.json({ error }, { status });

async function authorize(context: Context) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return { response };
  // Account master AI switch. Server-side, so turning AI off is a real
  // setting and not just a hidden button.
  const aiOff = await aiDisabledResponse(user.id);
  if (aiOff) return { response: aiOff };
  const { id: bookId } = await context.params;
  if (!z.string().uuid().safeParse(bookId).success) return { response: failure("Invalid book ID.", 400) };
  const supabase = await createClient();
  const { data: book, error } = await supabase.from("books")
    .select("id, author_id, original_language, language").eq("id", bookId).is("deleted_at", null).maybeSingle();
  if (error) {
    console.error("[translation quality] book lookup failed", { bookId, code: error.code });
    return { response: failure("Could not load this book. Try again.", 503) };
  }
  if (!book || book.author_id !== user.id) return { response: failure("Book not found.", 404) };
  return { user, book, bookId, supabase };
}

export async function POST(request: Request, context: Context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  if (!isTranslationsEnabled() || !reviewedTranslationActivationReady()) return failure("Translation is currently turned off. Your manuscript has not changed.", 503);
  const { user, book, bookId, supabase } = auth;
  if (!isBrowserOriginAllowed(request)) return failure("Request origin is not allowed.", 403);
  // Bound the body before JSON parsing; the UI sends only IDs and short guidance.
  const raw = await request.text();
  if (raw.length > 10_000) return failure("Review request is too large.", 400);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return failure("Invalid review request.", 400); }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return failure("Choose a source version, supported language and at most 2,000 characters of guidance.", 400);
  const limit = await limiter.check(`translation-quality:${user.id}`);
  if (!limit.allowed) return NextResponse.json({ error: "Please wait before reviewing another sample." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) } });

  // ai_jobs inserts are service-role only; authorization above is mandatory.
  const admin = createAdminClient();
  let jobId: string | null = null;
  let budgetReserved = false;
  let modelStarted = false;
  const usageReceipts: UsageReceipt[] = [];
  let receiptWrite = Promise.resolve();
  try {
    const { targetLanguage, authorGuidance, sourceVersionId } = parsed.data;
    const source = await resolveTranslationSourceContext({ supabase, bookId, book, requestedSourceVersionId: sourceVersionId });
    if (!source.sourceVersionId || source.sourceVersionId !== sourceVersionId || !source.sourceLanguage) return failure("The source version is unavailable. Select the original manuscript.", 422);
    if (source.sourceLanguage === targetLanguage) return failure("Choose a language different from the original.", 400);
    const { data: chapters, error } = await supabase.from("chapters").select("id, title, content")
      .eq("book_id", bookId).eq("book_version_id", source.sourceVersionId).is("deleted_at", null).order("order", { ascending: true }).limit(3);
    if (error) throw new Error("source_read_failed");
    const chapter = chapters?.find((item) => extractPlainText(item.content).trim());
    if (!chapter) return failure("Add manuscript text before requesting a review.", 422);
    // Preserve paragraph boundaries and use the current edited content, not stale import source_text.
    const text = extractPlainText(chapter.content);
    const cut = text.length > 4000 ? Math.max(text.lastIndexOf("\n", 4000), text.lastIndexOf(" ", 4000)) : text.length;
    const originalText = text.slice(0, cut > 0 ? cut : 4000);
    jobId = randomUUID();
    await checkBudget({ userId: user.id, pipeline: "translation", jobId: `quality-sample:${jobId}`, units: estimateTranslationQualitySample([originalText], authorGuidance).estimatedCostUnits });
    budgetReserved = true;
    const sourceHash = createHash("sha256").update(originalText).digest("hex");
    const { error: insertError } = await admin.from("ai_jobs").insert({
      id: jobId, user_id: user.id, book_id: bookId, book_version_id: sourceVersionId,
      kind: TRANSLATION_QUALITY_JOB_KIND, language: targetLanguage, status: "processing", started_at: new Date().toISOString(),
      input: { scope: "sample", sourceVersionId, sourceHash, authorGuidance: authorGuidance ?? "" },
    });
    if (insertError) throw new Error("report_create_failed");
    modelStarted = true;
    const result = await translateWithQuality({ texts: [originalText], sourceLanguage: source.sourceLanguage, targetLanguage, authorGuidance, signal: request.signal,
      onUsage: async (receipt) => {
        usageReceipts.push(receipt);
        // Parallel reviewers must not overwrite each other's usage receipts.
        receiptWrite = receiptWrite.then(async () => {
          const { data, error } = await admin.from("ai_jobs").update({ output: { usageReceipts } as unknown as Json }).eq("id", jobId!).eq("user_id", user.id).eq("book_id", bookId).eq("kind", TRANSLATION_QUALITY_JOB_KIND).eq("status", "processing").select("id").maybeSingle();
          if (error || !data) throw new Error("usage_receipt_save_failed");
        });
        await receiptWrite;
      },
    });
    const output: TranslationQualityRecord = {
      formatVersion: 1, scope: "sample", usageReceipts, sourceVersionId, targetVersionId: null, sourceHash,
      status: result.report.status, profile: result.report.profile,
      batches: [{ chapterId: chapter.id, chapterTitle: chapter.title ?? "Untitled chapter", batchIndex: 0, sourceHash, targetHash: createHash("sha256").update(JSON.stringify(result.translations)).digest("hex"), segmentOffset: 0, report: result.report }],
      checkedAt: new Date().toISOString(), error: null,
    };
    const { error: saveError } = await admin.from("ai_jobs").update({
      status: "completed", progress: 100, finished_at: output.checkedAt, output: output as unknown as Json,
    }).eq("id", jobId).eq("user_id", user.id).eq("book_id", bookId).eq("kind", TRANSLATION_QUALITY_JOB_KIND).eq("status", "processing");
    if (saveError) throw new Error("report_save_failed");
    return NextResponse.json({ id: jobId, originalText, translatedText: result.translations[0], report: result.report });
  } catch (error) {
    await receiptWrite.catch(() => {});
    if (error instanceof BudgetExceededError) {
      return failure("This sample exceeds the remaining daily AI allowance. Try again after the daily reset.", 429);
    }
    // Refund only failures before model work. A failed review may already have
    // consumed translation/reviewer tokens and must not enable unlimited retries.
    if (budgetReserved && !modelStarted) await releaseBudget({ pipeline: "translation", jobId: `quality-sample:${jobId}` });
    // Provider exceptions may contain manuscript excerpts. Log only safe classifications.
    console.error("[translation quality] sample review failed", { bookId, jobId, errorType: error instanceof Error ? error.name : "UnknownError" });
    if (jobId) {
      try {
        const { error: saveError } = await admin.from("ai_jobs").update({ status: "failed", output: { usageReceipts, modelStarted, status: "failed" } as unknown as Json, error: "The review could not be completed. No quality decision was made.", finished_at: new Date().toISOString() }).eq("id", jobId).eq("user_id", user.id).eq("book_id", bookId).eq("kind", TRANSLATION_QUALITY_JOB_KIND).eq("status", "processing");
        if (saveError) console.error("[translation quality] failed to save failure status", { bookId, jobId, code: saveError.code });
      } catch {
        console.error("[translation quality] failure status storage unavailable", { bookId, jobId });
      }
    }
    return failure("The review could not be completed. No quality decision was made. Try again shortly.", 503);
  }
}

export async function GET(request: Request, context: Context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  const { supabase, user, bookId } = auth;
  const url = new URL(request.url);
  const queueJobId = url.searchParams.get("queueJobId");
  if (queueJobId) {
    if (queueJobId.length > 200) return failure("Invalid job ID.", 400);
    try {
      const queue = getTranslationQueue();
      const job = await queue?.getJob(queueJobId);
      if (!job || job.data.bookId !== bookId) return failure("Translation job not found.", 404);
      let status: string = await job.getState();
      if (job.data.reviewedRunId && job.data.reviewedQueueProtocol === REVIEWED_TRANSLATION_PROTOCOL) {
        const { data: run, error } = await supabase.from("ai_jobs").select("id, book_version_id, status, output")
          .eq("id", job.data.reviewedRunId).eq("user_id", user.id).eq("book_id", bookId)
          .eq("kind", TRANSLATION_QUALITY_JOB_KIND).eq("input->>protocol", REVIEWED_TRANSLATION_PROTOCOL)
          .eq("input->>sourceVersionId", job.data.sourceVersionId)
          .eq("input->>reservationKey", translationQualityReservationKey(job))
          .eq("input->>targetClaimMarker", `translation-claim:${job.data.reviewedRunId}`).maybeSingle();
        const output = run?.output as (TranslationQualityRecord & { _translationCommit?: { receipt?: unknown } }) | null;
        status = !error && run?.status === "completed" && output?.status === "checks_passed" && run.book_version_id &&
          isTranslationCommitReceipt(output._translationCommit?.receipt, run.id, run.book_version_id) ? "completed"
          : !error && run?.status === "failed" ? "failed" : "pending";
      } else if (status === "completed") status = "unverified";
      return NextResponse.json({ queue: { status, chapterId: job.data.chapterId ?? null } });
    } catch {
      console.error("[translation quality] queue status unavailable", { bookId });
      return failure("Translation status is temporarily unavailable.", 503);
    }
  }
  let query = supabase.from("ai_jobs").select("id, status, created_at, input, output, error")
    .eq("user_id", user.id).eq("book_id", bookId).eq("kind", TRANSLATION_QUALITY_JOB_KIND)
    .order("created_at", { ascending: false }).limit(10);
  const language = url.searchParams.get("targetLanguage");
  const sourceVersionId = url.searchParams.get("sourceVersionId");
  if (language) query = query.eq("language", language);
  if (sourceVersionId) query = query.eq("input->>sourceVersionId", sourceVersionId);
  if (url.searchParams.get("scope") === "book") query = query.in("input->>scope", ["book", "chapter"]);
  const { data, error } = await query;
  if (error) {
    console.error("[translation quality] report lookup failed", { bookId, code: error.code });
    return failure("Could not load saved reviews. Try again.", 503);
  }
  const jobs = await Promise.all((data ?? []).map(async (row) => {
    const output = row.output as unknown as TranslationQualityRecord | null;
    let trusted = false;
    const input = row.input as Record<string, unknown> | null;
    if (input?.protocol === REVIEWED_TRANSLATION_PROTOCOL && typeof input.reservationKey === "string" && input.reservationKey.startsWith("translation-quality:")) {
      try {
        const [id, timestamp] = JSON.parse(input.reservationKey.slice("translation-quality:".length));
        const queueJob = typeof id === "string" ? await getTranslationQueue()?.getJob(id) : null;
        trusted = !!queueJob && queueJob.data.reviewedQueueProtocol === REVIEWED_TRANSLATION_PROTOCOL && queueJob.timestamp === timestamp && queueJob.data.reviewedRunId === row.id && queueJob.data.bookId === bookId && queueJob.data.sourceVersionId === output?.sourceVersionId;
      } catch { /* Legacy or unavailable queue proof never grants a quality badge. */ }
    }
    let stale: boolean | null = null;
    if (output?.formatVersion === 1 && output.scope !== "sample" && output.targetHash && output.targetVersionId) {
      // Bind a historical review to the exact current source AND target. Later
      // author edits are allowed; they invalidate the badge, not the manuscript.
      const [source, target] = await Promise.all([
        supabase.from("chapters").select("id, title, content, order").eq("book_id", bookId).eq("book_version_id", output.sourceVersionId).is("deleted_at", null).order("order", { ascending: true }),
        supabase.from("chapters").select("title, content, order").eq("book_id", bookId).eq("book_version_id", output.targetVersionId).is("deleted_at", null).order("order", { ascending: true }),
      ]);
      if (!source.error && !target.error) {
        const sourceRows = output.scope === "chapter" ? (source.data ?? []).filter((item) => item.id === output.batches[0]?.chapterId) : source.data ?? [];
        const targetRows = output.scope === "chapter" ? (target.data ?? []).filter((item) => item.order === sourceRows[0]?.order) : target.data ?? [];
        stale = hashTranslationSource(sourceRows) !== output.sourceHash || hashTranslationTarget(targetRows) !== output.targetHash;
      }
    }
    return { id: row.id, status: row.status, createdAt: row.created_at, output, error: row.error, stale, trusted };
  }));
  return NextResponse.json({ jobs });
}
