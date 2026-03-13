import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";
import { normalizeJobStatus } from "@/lib/job-status";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { enqueueAudiobookJob } from "@/lib/audiobook-queue";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import {
  apiError,
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_BOOK_NOT_FOUND,
  E_BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE,
  E_DATABASE_ERROR,
  E_INVALID_REQUEST_BODY,
  E_JOB_CREATION_FAILED,
  E_NO_CHAPTERS_FOR_VERSION,
  E_QUEUE_UNAVAILABLE,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isCancelStale, forceFailCancelledJob } from "@/lib/audiobook-stale-cancel";

const audiobookLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });
const AI_JOB_KIND = "audiobook_generation";

// Narrator metadata persisted with jobs/cache keys.
const DEFAULT_VOICE_ID = "Ryan";
const DEFAULT_NARRATOR_MODEL = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";

type ActiveJobRow = {
  id: string;
  status: string;
  output: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
  updated_at: string;
};

function parseOptionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  return deduped;
}

async function findActiveAudiobookJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bookId: string
): Promise<ActiveJobRow | null> {
  // Preferred lookup via dedicated identity columns.
  const { data: byBookId, error: byBookIdError } = await supabase
    .from("ai_jobs")
    .select("id, status, output, input, updated_at")
    .eq("kind", AI_JOB_KIND)
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byBookIdError) {
    console.warn("[audiobook generate] failed active-job lookup by book_id:", byBookIdError.message);
  }
  if (byBookId) {
    return {
      id: byBookId.id,
      status: byBookId.status,
      output: (byBookId.output as Record<string, unknown> | null) ?? null,
      input: (byBookId.input as Record<string, unknown> | null) ?? null,
      updated_at: byBookId.updated_at,
    };
  }

  // Legacy fallback for rows created before `book_id` was populated.
  const { data: legacyRows, error: legacyError } = await supabase
    .from("ai_jobs")
    .select("id, status, output, input, updated_at")
    .eq("kind", AI_JOB_KIND)
    .eq("user_id", userId)
    .is("book_id", null)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (legacyError) {
    console.warn("[audiobook generate] failed legacy active-job lookup:", legacyError.message);
    return null;
  }

  const legacy = (legacyRows ?? []).find((row) => {
    const input = row.input as Record<string, unknown> | null;
    return input?.bookId === bookId;
  });

  if (!legacy) return null;
  return {
    id: legacy.id,
    status: legacy.status,
    output: (legacy.output as Record<string, unknown> | null) ?? null,
    input: (legacy.input as Record<string, unknown> | null) ?? null,
    updated_at: legacy.updated_at,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isAudiobookEnabled()) {
    return apiError(E_AUDIOBOOK_FEATURE_DISABLED, 503);
  }

  const { id: bookId } = await params;
  const url = new URL(request.url);
  const langParam = url.searchParams.get("lang");
  const queryChapterId = parseOptionalId(url.searchParams.get("chapterId"));

  const rawBody = await request
    .json()
    .catch(() => null) as Record<string, unknown> | null;

  if (rawBody !== null && (typeof rawBody !== "object" || Array.isArray(rawBody))) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const body = (rawBody ?? {}) as Record<string, unknown>;
  const requestedScope = typeof body.scope === "string" ? body.scope.trim().toLowerCase() : null;
  if (
    requestedScope &&
    requestedScope !== "book" &&
    requestedScope !== "chapter" &&
    requestedScope !== "chapters" &&
    requestedScope !== "current"
  ) {
    return apiError(E_INVALID_REQUEST_BODY, 400, {
      detail: "scope must be one of: book, chapter, chapters, current",
    });
  }

  const bodyChapterId = parseOptionalId(body.chapterId);
  let requestedChapterIds = parseOptionalIdArray(body.chapterIds);
  if (requestedChapterIds.length === 0) {
    const fallbackSingle = bodyChapterId ?? queryChapterId;
    if (fallbackSingle) requestedChapterIds = [fallbackSingle];
  }

  if (requestedScope === "book") {
    requestedChapterIds = [];
  } else if ((requestedScope === "chapter" || requestedScope === "current") && requestedChapterIds.length > 1) {
    requestedChapterIds = [requestedChapterIds[0]];
  }

  // SECURITY: Require author role
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const rl = await audiobookLimiter.check(user.id);
  if (!rl.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: rl.retryAfterSeconds });

  // Allow bypassing Pro check if a valid paid Stripe session is provided
  const stripeSessionId =
    body !== null && typeof body.stripeSessionId === "string" && body.stripeSessionId.trim()
      ? body.stripeSessionId.trim()
      : null;

  let paidViaStripe = false;
  if (stripeSessionId) {
    try {
      const session = await getStripeCheckoutSession(stripeSessionId);
      const meta = (session.metadata ?? {}) as Record<string, string>;
      if (
        session.payment_status === "paid" &&
        meta.payment_kind === "audiobook" &&
        meta.user_id === user.id &&
        meta.book_id === bookId
      ) {
        paidViaStripe = true;
      }
    } catch (error) {
      console.warn("[audiobook generate] stripe session verification failed", {
        stripeSessionId,
        userId: user.id,
        bookId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!paidViaStripe) {
    const proGate = await requireProBillingForApi(user.id);
    if (!proGate.ok) return proGate.response;
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // Fetch book with versions
  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, author_id, language, original_language")
    .eq("id", bookId)
    .maybeSingle();

  if (bookFetchError) {
    console.error("[audiobook generate] book fetch failed:", bookFetchError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Resolve book_version_id
  const targetLanguage = langParam ?? book.original_language ?? book.language ?? "sv";

  const { data: version, error: versionError } = await supabase
    .from("book_versions")
    .select("id, language_code")
    .eq("book_id", bookId)
    .eq("language_code", targetLanguage)
    .maybeSingle();

  if (versionError) {
    console.error("[audiobook generate] version fetch failed:", versionError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!version) {
    return apiError(E_BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE, 400, { detail: targetLanguage });
  }

  let requestedChapterTitle: string | null = null;
  if (requestedChapterIds.length > 0) {
    const { data: chapters, error: chapterError } = await supabase
      .from("chapters")
      .select("id, title")
      .eq("book_version_id", version.id)
      .in("id", requestedChapterIds);

    if (chapterError) {
      console.error("[audiobook generate] chapter lookup failed:", chapterError.message);
      return apiError(E_DATABASE_ERROR, 500);
    }
    const byId = new Map((chapters ?? []).map((chapter) => [chapter.id, chapter]));
    const orderedRequested = requestedChapterIds
      .map((chapterId) => byId.get(chapterId))
      .filter((chapter): chapter is { id: string; title: string | null } => Boolean(chapter));

    if (orderedRequested.length !== requestedChapterIds.length) {
      const missingIds = requestedChapterIds.filter((chapterId) => !byId.has(chapterId));
      return apiError(E_NO_CHAPTERS_FOR_VERSION, 400, {
        detail: `chapterId(s) not found for selected version: ${missingIds.join(", ")}`,
      });
    }

    requestedChapterIds = orderedRequested.map((chapter) => chapter.id);
    requestedChapterTitle = requestedChapterIds.length === 1 ? (orderedRequested[0]?.title ?? null) : null;
  }

  const resolvedScope =
    requestedChapterIds.length === 0 ? "book" : requestedChapterIds.length === 1 ? "chapter" : "chapters";
  const chapterId = requestedChapterIds.length === 1 ? requestedChapterIds[0] : null;
  const chapterIds = requestedChapterIds.length > 0 ? requestedChapterIds : null;

  // Check for existing queued/running job for this specific book.
  const existingJob = await findActiveAudiobookJob(supabase, user.id, bookId);
  if (existingJob) {
    const existingOutput = existingJob.output ?? {};
    if (existingOutput.controlState === "cancel_requested") {
      if (isCancelStale(existingOutput, existingJob.updated_at)) {
        // Worker is dead — force-fail and fall through to create a new job.
        await forceFailCancelledJob(existingJob.id, existingOutput);
      } else {
        // Cancel is recent — tell the client to wait.
        return NextResponse.json(
          {
            ok: true,
            jobId: existingJob.id,
            status: normalizeJobStatus(existingJob.status),
            message: "Job is being cancelled, please wait",
            totalChapters: existingOutput.totalChapters ?? 0,
            completedChapters: existingOutput.completedChapters ?? 0,
          },
          { status: 202 }
        );
      }
    } else {
      return NextResponse.json(
        {
          ok: true,
          jobId: existingJob.id,
          status: normalizeJobStatus(existingJob.status),
          message: "Job already in progress",
          totalChapters: existingOutput.totalChapters ?? 0,
          completedChapters: existingOutput.completedChapters ?? 0,
        },
        { status: 202 }
      );
    }
  }

  const chapterCount = chapterIds
    ? chapterIds.length
    : await (async () => {
        const { count, error } = await supabase
          .from("chapters")
          .select("id", { count: "exact", head: true })
          .eq("book_version_id", version.id);
        if (error) {
          console.error("[audiobook generate] chapter count failed:", error.message);
          return null;
        }
        return count ?? 0;
      })();

  if (!chapterCount || chapterCount === 0) {
    return apiError(E_NO_CHAPTERS_FOR_VERSION, 400);
  }

  // Get TTS config from env
  const voiceId = process.env.QWEN_TTS_VOICE_ID ?? process.env.TTS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const modelPath = process.env.AI_NARRATOR_MODEL ?? process.env.QWEN_TTS_MODEL ?? DEFAULT_NARRATOR_MODEL;

  // Create ai_jobs record
  const { data: job, error: jobError } = await admin
    .from("ai_jobs")
    .insert({
      user_id: user.id,
      kind: AI_JOB_KIND,
      book_id: bookId,
      book_version_id: version.id,
      language: version.language_code,
      progress: 0,
      status: "pending",
      input: {
        bookId,
        bookVersionId: version.id,
        language: version.language_code,
        voiceId,
        modelPath,
        scope: resolvedScope,
        chapterId,
        chapterIds,
      },
      output: {
        totalChapters: chapterCount,
        completedChapters: 0,
        currentChapterId: chapterId,
        currentChapterTitle: requestedChapterTitle,
        audioPath: null,
        audioBucket: null,
        manifestPath: null,
        manifestBucket: null,
        scope: resolvedScope,
        chapterId,
        chapterIds,
        pauseRequested: false,
        cancelRequested: false,
        controlState: "queued",
        errorMessage: null,
      },
    })
    .select("id")
    .single();

  if (jobError || !job) {
    if (jobError?.code === "23505") {
      const activeJob = await findActiveAudiobookJob(supabase, user.id, bookId);
      if (activeJob) {
        return NextResponse.json(
          {
            ok: true,
            jobId: activeJob.id,
            status: normalizeJobStatus(activeJob.status),
            message: "Job already in progress",
            totalChapters: activeJob.output?.totalChapters ?? 0,
            completedChapters: activeJob.output?.completedChapters ?? 0,
          },
          { status: 202 }
        );
      }
    }
    console.error("[audiobook generate] failed to create job:", jobError?.message);
    return apiError(E_JOB_CREATION_FAILED, 500);
  }

  // Enqueue BullMQ job
  let queuedId: string | null = null;
  try {
    queuedId = await enqueueAudiobookJob({
      jobId: job.id,
      bookId,
      bookVersionId: version.id,
      userId: user.id,
      language: version.language_code,
      voiceId,
      modelPath,
      chapterId,
      chapterIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[audiobook generate] queue enqueue failed:", msg, "jobId:", job.id, "bookId:", bookId);
  }

  if (!queuedId) {
    // Redis unavailable - mark job as failed
    await admin
      .from("ai_jobs")
      .update({
        status: "failed",
        error: "Queue unavailable",
        progress: 0,
        output: {
          totalChapters: chapterCount,
          completedChapters: 0,
          currentChapterId: chapterId,
          currentChapterTitle: requestedChapterTitle,
          audioPath: null,
          audioBucket: null,
          manifestPath: null,
          manifestBucket: null,
          scope: resolvedScope,
          chapterId,
          chapterIds,
          pauseRequested: false,
          cancelRequested: false,
          controlState: "failed",
          errorMessage: "Queue unavailable",
        },
      })
      .eq("id", job.id);

    return apiError(E_QUEUE_UNAVAILABLE, 503);
  }

  console.info(
    "[audiobook generate] job created:",
    job.id,
    "bookId:",
    bookId,
    "chapters:",
    chapterCount,
    "scope:",
    resolvedScope,
    chapterId ? `chapterId: ${chapterId}` : ""
  );

  return NextResponse.json(
    {
      ok: true,
      jobId: job.id,
      status: "pending",
      totalChapters: chapterCount,
      completedChapters: 0,
    },
    { status: 202 }
  );
}
