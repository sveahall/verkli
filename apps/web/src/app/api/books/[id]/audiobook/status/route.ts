import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";

const AI_JOB_KIND = "audiobook_generation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isAudiobookEnabled()) {
    return NextResponse.json({ error: "Audiobook feature is disabled" }, { status: 403 });
  }

  const { id: bookId } = await params;

  // SECURITY: Require author role
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  // Verify book ownership
  const { data: book } = await supabase
    .from("books")
    .select("id, author_id, audiobook_status")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // Get latest job for this book (via ai_jobs.input.bookId)
  // Fast query: get most recent job by kind + user, then filter by bookId
  const { data: jobs } = await supabase
    .from("ai_jobs")
    .select("id, status, input, output, error, created_at, started_at, finished_at")
    .eq("kind", AI_JOB_KIND)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Find job for this book
  const job = jobs?.find((j) => {
    const input = j.input as Record<string, unknown> | null;
    return input?.bookId === bookId;
  });

  // Get latest asset
  const { data: asset } = await supabase
    .from("audiobook_assets")
    .select("id, audio_url, duration_seconds, status, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Extract progress from job output
  const output = (job?.output as Record<string, unknown>) ?? {};

  return NextResponse.json({
    bookStatus: book.audiobook_status,
    job: job
      ? {
          id: job.id,
          status: job.status,
          totalChapters: output.totalChapters ?? 0,
          completedChapters: output.completedChapters ?? 0,
          currentChapterId: output.currentChapterId ?? null,
          currentChapterTitle: output.currentChapterTitle ?? null,
          audioUrl: output.audioUrl ?? null,
          manifestUrl: output.manifestUrl ?? null,
          durationSeconds: output.durationSeconds ?? null,
          error: job.error ?? output.errorDetails ?? null,
          createdAt: job.created_at,
          startedAt: job.started_at,
          finishedAt: job.finished_at,
        }
      : null,
    asset: asset
      ? {
          id: asset.id,
          audioUrl: asset.audio_url,
          durationSeconds: asset.duration_seconds,
          status: asset.status,
          createdAt: asset.created_at,
        }
      : null,
  });
}
