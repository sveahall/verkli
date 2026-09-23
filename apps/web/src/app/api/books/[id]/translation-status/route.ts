import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { normalizeJobStatus, isJobActiveStatus } from "@/lib/job-status";
import { apiError, isValidUuid, E_BOOK_NOT_FOUND, E_DATABASE_ERROR, E_INVALID_BOOK_ID } from "@/lib/api-errors";

function toTranslationProgress(status: string): number {
  const normalized = normalizeJobStatus(status);
  if (normalized === "completed") return 100;
  if (normalized === "running") return 50;
  return 0;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  const url = new URL(request.url);
  const languageFilter = url.searchParams.get("language")?.trim() || null;
  const versionIdFilter = url.searchParams.get("versionId")?.trim() || null;

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[books.translation-status] failed to load book", {
      bookId,
      userId: user.id,
      message: bookError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  let query = supabase
    .from("book_versions")
    .select("id, language_code, status, created_at, updated_at")
    .eq("book_id", bookId)
    .in("status", ["translating", "done", "failed"])
    .order("updated_at", { ascending: false })
    .limit(20);

  if (languageFilter) {
    query = query.eq("language_code", languageFilter);
  }
  if (versionIdFilter) {
    query = query.eq("id", versionIdFilter);
  }

  const { data: rows, error: versionsError } = await query;

  if (versionsError) {
    console.error("[books.translation-status] failed to load version status", {
      bookId,
      userId: user.id,
      message: versionsError.message,
      languageFilter,
      versionIdFilter,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const jobs = (rows ?? []).map((row) => {
    const status = normalizeJobStatus(row.status);
    return {
      id: row.id,
      language: row.language_code ?? null,
      rawStatus: row.status,
      status,
      progress: toTranslationProgress(row.status),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const latest = jobs[0] ?? null;
  const active = jobs.some((job) => isJobActiveStatus(job.status));

  return NextResponse.json({
    bookId,
    status: latest?.status ?? "idle",
    progress: latest?.progress ?? 0,
    active,
    jobs,
  });
}
