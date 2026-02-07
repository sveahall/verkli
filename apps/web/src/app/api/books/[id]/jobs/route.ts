import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { isAudiobookEnabled } from "@/lib/flags";
import { sanitizeJobError } from "@/lib/sanitize-job-error";

type JobKind = "import" | "translation" | "audiobook";

/** Map ai_jobs.kind values to normalized kind */
function normalizeKind(raw: string): JobKind | null {
  switch (raw) {
    case "import":
    case "import_extraction":
      return "import";
    case "translation":
      return "translation";
    case "audiobook":
    case "audiobook_generation":
      return "audiobook";
    default:
      return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  const audiobookEnabled = isAudiobookEnabled();

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  // Verify book ownership
  const { data: book } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // Query ai_jobs: prefer book_id column (post-migration), fallback to user_id + filter by input.bookId
  const preferredSelect =
    "id, kind, status, book_id, book_version_id, language, progress, input, output, error, created_at, started_at, finished_at";
  type AiJobRow = {
    id: string;
    kind: string;
    status: string;
    input: unknown;
    output: unknown;
    error: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    book_id?: string | null;
    book_version_id?: string | null;
    language?: string | null;
    progress?: number;
  };
  let rows: AiJobRow[] | null = null;

  const preferred = await supabase
    .from("ai_jobs")
    .select(preferredSelect)
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (preferred.error) {
    // Fallback: table may lack book_id (migration not run) — fetch by user and filter in code
    const fallback = await supabase
      .from("ai_jobs")
      .select("id, kind, status, input, output, error, created_at, started_at, finished_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (fallback.error) {
      return NextResponse.json(
        { error: "Kunde inte hämta uppgifter. Försök igen senare." },
        { status: 500 }
      );
    }
    const inputFiltered = (fallback.data ?? []).filter((r) => {
      const input = r.input as Record<string, unknown> | null;
      return input?.bookId === bookId;
    });
    rows = inputFiltered as AiJobRow[];
  } else {
    rows = preferred.data as AiJobRow[] | null;
  }

  let legacyMatches: AiJobRow[] = [];
  if (!preferred.error) {
    // Legacy rows where book_id is null but input has bookId (pre-backfill)
    const { data: legacyRows } = await supabase
      .from("ai_jobs")
      .select(preferredSelect)
      .eq("user_id", user.id)
      .is("book_id", null)
      .order("created_at", { ascending: false })
      .limit(20);
    legacyMatches = (legacyRows ?? []).filter((r) => {
      const input = r.input as Record<string, unknown> | null;
      return input?.bookId === bookId;
    }) as AiJobRow[];
  }

  // Merge and deduplicate
  const allRows = [...(rows ?? []), ...legacyMatches];
  const seen = new Set<string>();
  const deduped = allRows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Normalize to contract format
  const jobs = deduped
    .map((r) => {
      const kind = normalizeKind(r.kind);
      if (!kind) return null;
      if (!audiobookEnabled && kind === "audiobook") return null;

      const input = (r.input as Record<string, unknown>) ?? {};
      const output = (r.output as Record<string, unknown>) ?? {};

      // Build kind-specific meta
      let meta: Record<string, unknown> = {};
      switch (kind) {
        case "import":
          meta = { fileName: input.fileName ?? input.file_name ?? null };
          break;
        case "translation":
          meta = {
            sourceVersionId: input.sourceVersionId ?? null,
            sourceLanguage: input.sourceLanguage ?? null,
          };
          break;
        case "audiobook":
          meta = {
            voiceId: input.voiceId ?? null,
            totalChapters: output.totalChapters ?? null,
            completedChapters: output.completedChapters ?? null,
            currentChapterTitle: output.currentChapterTitle ?? null,
            audioUrl: output.audioUrl ?? null,
            manifestUrl: output.manifestUrl ?? null,
            durationSeconds: output.durationSeconds ?? null,
          };
          break;
      }

      // Resolve progress: prefer column, fall back to output JSON for audiobook
      let progress = r.progress ?? 0;
      if (
        kind === "audiobook" &&
        progress === 0 &&
        typeof output.totalChapters === "number" &&
        output.totalChapters > 0
      ) {
        progress = Math.round(
          (((output.completedChapters as number) ?? 0) /
            (output.totalChapters as number)) *
            100
        );
      }

      return {
        id: r.id,
        kind,
        status: r.status,
        language: r.language ?? (input.language as string) ?? null,
        bookVersionId:
          r.book_version_id ??
          (input.bookVersionId as string) ??
          (input.targetVersionId as string) ??
          null,
        progress,
        meta,
        error: sanitizeJobError(r.error),
        attempts: 1,
        maxAttempts: 2,
        createdAt: r.created_at,
        startedAt: r.started_at ?? null,
        finishedAt: r.finished_at ?? null,
      };
    })
    .filter(Boolean);

  const activeCount = jobs.filter(
    (j) => j!.status === "pending" || j!.status === "processing"
  ).length;

  // Summary: latest status per kind (first match wins, sorted by created_at DESC)
  const summary: Record<string, string> = {};
  for (const j of jobs) {
    if (j && !summary[j.kind]) {
      summary[j.kind] = j.status;
    }
  }

  return NextResponse.json({
    bookId,
    jobs,
    activeCount,
    summary,
  });
}
