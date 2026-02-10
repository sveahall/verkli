import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { normalizeJobStatus } from "@/lib/job-status";
import { sanitizeJobError } from "@/lib/sanitize-job-error";
import { enqueueExtractJob } from "@/lib/import-queue";
import type { ImportMode } from "@/lib/import-queue";
import {
  apiError,
  E_DATABASE_ERROR,
  E_IMPORT_NOT_FOUND,
  E_IMPORT_NOT_FAILED,
  E_IMPORT_MISSING_FILE_INFO,
} from "@/lib/api-errors";

function normalizeImportMode(value: unknown): ImportMode {
  return value === "overwrite_draft" ? "overwrite_draft" : "new_version";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;

  // SECURITY: Require author role for viewing import details
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("book_imports")
    .select("id, book_id, book_version_id, file_name, mode, status, progress, result, error_message, created_at, updated_at")
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[imports] get failed", { id, message: error.message });
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!row) {
    return apiError(E_IMPORT_NOT_FOUND, 404);
  }

  return NextResponse.json({
    id: row.id,
    book_id: row.book_id ?? null,
    book_version_id: row.book_version_id ?? null,
    file_name: row.file_name,
    mode: normalizeImportMode(row.mode),
    status: normalizeJobStatus(row.status),
    progress: row.progress,
    result: row.result && typeof row.result === "object" ? row.result : null,
    error: sanitizeJobError(row.error_message),
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("book_imports")
    .select("id, author_id, status, file_path, file_storage, mode, book_id, book_version_id")
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[imports] retry lookup failed", { id, message: error.message });
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!row) {
    return apiError(E_IMPORT_NOT_FOUND, 404);
  }

  if (row.status !== "failed") {
    return apiError(E_IMPORT_NOT_FAILED, 400);
  }

  const filePath = (row as { file_path?: string }).file_path;
  const fileStorage = (row as { file_storage?: string }).file_storage;
  if (!filePath || !fileStorage) {
    return apiError(E_IMPORT_MISSING_FILE_INFO, 400);
  }

  const { error: updateError } = await supabase
    .from("book_imports")
    .update({
      status: "pending",
      progress: 0,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("author_id", user.id);

  if (updateError) {
    console.error("[imports] retry update failed", { id, message: updateError.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  let jobId: string | null = null;
  try {
    jobId = await enqueueExtractJob({
      importId: id,
      filePath,
      fileStorage: fileStorage as "local" | "supabase",
      authorId: user.id,
      bookId: row.book_id ?? undefined,
      mode: normalizeImportMode(row.mode),
      targetVersionId: row.book_version_id ?? null,
    });
  } catch (err) {
    console.warn("[import retry] enqueue failed:", err);
  }

  return NextResponse.json({
    ok: true,
    id,
    message: jobId ? "Importen är åter i kö." : "Importen är återställd; starta workern för att köra den.",
  });
}
