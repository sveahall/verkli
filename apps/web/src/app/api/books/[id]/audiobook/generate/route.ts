import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { enqueueAudiobookJob } from "@/lib/audiobook-queue";

const AI_JOB_KIND = "audiobook_generation";

// Default TTS config (matches piper.ts defaults)
const DEFAULT_VOICE_ID = "sv_SE-nst-medium";
const DEFAULT_MODEL_PATH = "vendor/tts/voices/sv_SE-nst-medium.onnx";

type ActiveJobRow = {
  id: string;
  status: string;
  output: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
};

async function findActiveAudiobookJob(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  bookId: string
): Promise<ActiveJobRow | null> {
  // Preferred lookup via dedicated identity columns.
  const { data: byBookId, error: byBookIdError } = await supabase
    .from("ai_jobs")
    .select("id, status, output, input")
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
    };
  }

  // Legacy fallback for rows created before `book_id` was populated.
  const { data: legacyRows, error: legacyError } = await supabase
    .from("ai_jobs")
    .select("id, status, output, input")
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
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isAudiobookEnabled()) {
    return NextResponse.json({ error: "Audiobook feature is disabled" }, { status: 403 });
  }

  const { id: bookId } = await params;
  const url = new URL(request.url);
  const langParam = url.searchParams.get("lang");

  // SECURITY: Require author role
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const admin = createAdminClient();

  // Fetch book with versions
  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, author_id, language, original_language")
    .eq("id", bookId)
    .maybeSingle();

  if (bookFetchError) {
    return NextResponse.json({ error: bookFetchError.message }, { status: 500 });
  }
  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ error: "Book not found or access denied" }, { status: 404 });
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
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }
  if (!version) {
    return NextResponse.json(
      { error: `No version found for language: ${targetLanguage}` },
      { status: 400 }
    );
  }

  // Check for existing queued/running job for this specific book.
  const existingJob = await findActiveAudiobookJob(supabase, user.id, bookId);
  if (existingJob) {
    return NextResponse.json({
      ok: true,
      jobId: existingJob.id,
      status: existingJob.status,
      message: "Job already in progress",
      totalChapters: existingJob.output?.totalChapters ?? 0,
      completedChapters: existingJob.output?.completedChapters ?? 0,
    });
  }

  // Count chapters for this version
  const { count: chapterCount, error: countError } = await supabase
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("book_version_id", version.id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if (!chapterCount || chapterCount === 0) {
    return NextResponse.json(
      { error: "No chapters found for this book version" },
      { status: 400 }
    );
  }

  // Get TTS config from env
  const voiceId = process.env.TTS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const modelPath = process.env.TTS_MODEL_PATH ?? DEFAULT_MODEL_PATH;

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
      },
      output: {
        totalChapters: chapterCount,
        completedChapters: 0,
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
            status: activeJob.status,
            message: "Job already in progress",
            totalChapters: activeJob.output?.totalChapters ?? 0,
            completedChapters: activeJob.output?.completedChapters ?? 0,
          },
          { status: 202 }
        );
      }
    }
    console.error("[audiobook generate] failed to create job:", jobError?.message);
    return NextResponse.json(
      { error: jobError?.message ?? "Failed to create job" },
      { status: 500 }
    );
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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[audiobook generate] queue enqueue failed:", msg, "jobId:", job.id, "bookId:", bookId);
  }

  if (!queuedId) {
    // Redis unavailable - mark job as failed
    await admin
      .from("ai_jobs")
      .update({ status: "failed", error: "Queue unavailable", progress: 0 })
      .eq("id", job.id);

    return NextResponse.json(
      { error: "Queue unavailable. Ensure REDIS_URL is set and Redis is running." },
      { status: 503 }
    );
  }

  console.log("[audiobook generate] job created:", job.id, "bookId:", bookId, "chapters:", chapterCount);

  return NextResponse.json(
    {
      ok: true,
      jobId: job.id,
      status: "queued",
      totalChapters: chapterCount,
      language: version.language_code,
    },
    { status: 202 }
  );
}
