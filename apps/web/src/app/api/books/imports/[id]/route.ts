import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateImportSource } from "@/lib/import-storage";
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
  E_IMPORT_SOURCE_INVALID,
  E_QUEUE_UNAVAILABLE,
  isValidUuid,
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  if (!isValidUuid(id) || !isValidUuid(user.id)) return apiError(E_IMPORT_SOURCE_INVALID, 400);

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("book_imports")
    .select("id, author_id, status, updated_at, file_name, file_path, file_storage, mode, book_id, book_version_id")
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[import retry] lookup failed", { id, authorId: user.id, message: error.message });
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!row) return apiError(E_IMPORT_NOT_FOUND, 404);
  if (row.status !== "failed") return apiError(E_IMPORT_NOT_FAILED, 409);
  if (!row.file_path || !row.file_storage) return apiError(E_IMPORT_MISSING_FILE_INFO, 400);

  let source: ReturnType<typeof validateImportSource>;
  try {
    if (row.id !== id) throw new Error("Import source invalid");
    source = validateImportSource(row, user.id);
  } catch {
    console.error("[import retry] source invalid", { id, authorId: user.id });
    return apiError(E_IMPORT_SOURCE_INVALID, 400);
  }

  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin
    .from("book_imports")
    .update({ status: "pending", progress: 0, error_message: null })
    .eq("id", id)
    .eq("author_id", user.id)
    .eq("status", "failed")
    .eq("updated_at", row.updated_at)
    .select("id, updated_at")
    .maybeSingle()
    .then((result) => result, () => ({ data: null, error: { message: "Import retry claim request failed" } }));

  if (claimError) {
    console.error("[import retry] claim failed", { id, authorId: user.id, message: claimError.message });
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!claimed) return apiError(E_IMPORT_NOT_FAILED, 409);

  let jobId: string | null = null;
  try {
    jobId = await enqueueExtractJob({
      importId: id,
      filePath: source.filePath,
      fileStorage: source.fileStorage,
      authorId: user.id,
      bookId: row.book_id ?? undefined,
      mode: normalizeImportMode(row.mode),
      targetVersionId: row.book_version_id ?? null,
    });
  } catch {
    console.error("[import retry] dispatch unconfirmed", { id, authorId: user.id });
  }
  if (!jobId) {
    // Use the trigger-returned timestamp. A worker or another request may have advanced the row.
    try {
      const { error: rollbackError } = await admin
        .from("book_imports")
        .update({ status: "failed", progress: 0, error_message: E_QUEUE_UNAVAILABLE })
        .eq("id", id)
        .eq("author_id", user.id)
        .eq("status", "pending")
        .eq("updated_at", claimed.updated_at);
      if (rollbackError) console.error("[import retry] rollback failed", { id, authorId: user.id, message: rollbackError.message });
    } catch {
      console.error("[import retry] rollback failed", { id, authorId: user.id, category: "database_unavailable" });
    }
    return apiError(E_QUEUE_UNAVAILABLE, 503);
  }

  return NextResponse.json({ ok: true, id, jobId, message: "Import re-queued." });
}
