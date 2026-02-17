import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { getBillingStateForUser } from "@/lib/billing/server";
import { isAudiobookEnabled } from "@/lib/flags";
import { isJobActiveStatus, normalizeJobStatus } from "@/lib/job-status";
import { resolveSanitizedJobError, sanitizeJobError } from "@/lib/sanitize-job-error";
import { apiError, E_BOOK_NOT_FOUND, E_JOB_FETCH_FAILED } from "@/lib/api-errors";

type JobKind = "import" | "translation" | "audiobook";

/** Map ai_jobs.kind values to normalized kind */
function normalizeKind(raw: string): JobKind | null {
  switch (raw) {
    case "import":
    case "import_extraction":
      return "import";
    case "audiobook":
    case "audiobook_generation":
      return "audiobook";
    default:
      return null;
  }
}

function toTranslationProgress(status: string): number {
  const normalized = normalizeJobStatus(status);
  if (normalized === "completed") return 100;
  if (normalized === "running") return 50;
  return 0;
}

const TRANSLATION_FAILED_MESSAGE = "Översättningen misslyckades. Försök igen.";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  const audiobookEnabled = isAudiobookEnabled();

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const billing = await getBillingStateForUser(user.id, "author");
  const translationVisibleForUser = billing.ok ? billing.state.isProActive : true;

  const supabase = await createClient();

  // Verify book ownership
  const { data: book } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Import jobs from book_imports (for this book)
  type ImportRow = {
    id: string;
    status: string;
    progress: number;
    error_message: string | null;
    created_at: string;
    updated_at: string;
    file_name: string | null;
    book_version_id: string | null;
    result: Record<string, unknown> | null;
  };
  const { data: importRows } = await supabase
    .from("book_imports")
    .select("id, status, progress, error_message, created_at, updated_at, file_name, book_version_id, result")
    .eq("book_id", bookId)
    .eq("author_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const importJobs = (importRows ?? []).map((r: ImportRow) => {
    const status = normalizeJobStatus(r.status);
    const result = (r.result ?? {}) as Record<string, unknown>;
    const chapterCount =
      typeof result.chaptersCreated === "number"
        ? result.chaptersCreated
        : typeof result.insertedCount === "number"
          ? result.insertedCount
          : typeof result.chapterCount === "number"
            ? result.chapterCount
            : null;
    const warningList = Array.isArray(result.warnings)
      ? result.warnings.filter((value): value is string => typeof value === "string")
      : [];

    return {
      id: r.id,
      kind: "import" as const,
      status,
      language: null as string | null,
      bookVersionId: r.book_version_id,
      progress: r.progress ?? 0,
      meta: {
        fileName: r.file_name ?? null,
        chaptersCreated: chapterCount,
        chapterCount,
        dedupSkipped: typeof result.dedupSkipped === "number" ? result.dedupSkipped : null,
        frontMatterCount: typeof result.frontMatterCount === "number" ? result.frontMatterCount : null,
        titleSet: result.titleSet === true,
        bookTitle: typeof result.bookTitle === "string" ? result.bookTitle : null,
        languageCode: typeof result.languageCode === "string" ? result.languageCode : null,
        detectedLanguage:
          typeof result.detectedLanguage === "string" ? result.detectedLanguage : null,
        warnings: warningList,
      },
      error: sanitizeJobError(r.error_message),
      createdAt: r.created_at,
      startedAt: status === "running" ? r.updated_at : null,
      finishedAt: status === "completed" || status === "failed" ? r.updated_at : null,
    };
  });

  // Translation jobs from book_versions (source-of-truth for translation lifecycle).
  type TranslationVersionRow = {
    id: string;
    language_code: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  };
  let translationRows: TranslationVersionRow[] | null = [];
  if (translationVisibleForUser) {
    const { data } = await supabase
      .from("book_versions")
      .select("id, language_code, status, created_at, updated_at")
      .eq("book_id", bookId)
      .in("status", ["translating", "done", "failed"])
      .order("updated_at", { ascending: false })
      .limit(20);
    translationRows = (data ?? []) as TranslationVersionRow[];
  }

  const translationJobs = (translationRows ?? []).map((row: TranslationVersionRow) => {
    const status = normalizeJobStatus(row.status);
    return {
      id: row.id,
      kind: "translation" as const,
      status,
      language: row.language_code ?? null,
      bookVersionId: row.id,
      progress: toTranslationProgress(row.status),
      meta: {
        languageCode: row.language_code ?? null,
        bookVersionId: row.id,
      },
      error: status === "failed" ? TRANSLATION_FAILED_MESSAGE : null,
      createdAt: row.updated_at ?? row.created_at,
      startedAt: status === "running" ? row.updated_at : null,
      finishedAt: status === "completed" || status === "failed" ? row.updated_at : null,
    };
  });

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
      console.error("[books.jobs] fallback query failed", { bookId, message: fallback.error.message });
      return apiError(E_JOB_FETCH_FAILED, 500);
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

  // Merge and deduplicate ai_jobs rows
  const allRows = [...(rows ?? []), ...legacyMatches];
  const seen = new Set<string>();
  const deduped = allRows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Normalize ai_jobs to contract format
  const aiJobsNormalized = deduped
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
        normalizeJobStatus(r.status) === "running" &&
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
        status: normalizeJobStatus(r.status),
        language: r.language ?? (input.language as string) ?? null,
        bookVersionId:
          r.book_version_id ??
          (input.bookVersionId as string) ??
          (input.targetVersionId as string) ??
          null,
        progress,
        meta,
        error: resolveSanitizedJobError(
          r.error,
          typeof output.errorDetails === "string" ? output.errorDetails : null
        ),
        attempts: 1,
        maxAttempts: 2,
        createdAt: r.created_at,
        startedAt: r.started_at ?? null,
        finishedAt: r.finished_at ?? null,
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      kind: JobKind;
      status: string;
      language: string | null;
      bookVersionId: string | null;
      progress: number;
      meta: Record<string, unknown>;
      error: string | null;
      createdAt: string | null;
      startedAt: string | null;
      finishedAt: string | null;
    }>;

  // Merge import jobs with ai_jobs, sort by createdAt desc
  const jobs = [...importJobs, ...translationJobs, ...aiJobsNormalized].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  const activeCount = jobs.filter((j) => isJobActiveStatus(j.status)).length;

  // Summary: latest status per kind (first match wins, sorted by created_at DESC)
  const summary: Record<string, string> = {};
  for (const j of jobs) {
    if (!summary[j.kind]) {
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
