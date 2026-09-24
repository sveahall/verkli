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
  E_IMPORT_OVERWRITE_UNAVAILABLE,
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

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("book_imports")
    .select("id, author_id, status, file_path, file_storage, mode, book_id, book_version_id, result")
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

  if (row.mode === "overwrite_draft") {
    console.warn("[import retry] draft replacement blocked", { importId: id });
    return apiError(E_IMPORT_OVERWRITE_UNAVAILABLE, 409);
  }

  // A failed legacy import may already have content. Do not erase its failure
  // state and make it look like fresh work when no recovery receipt exists.
  const result = row.result;
  const recovery = result && typeof result === "object" && !Array.isArray(result) ? result.recovery : null;
  if (!row.book_id || !row.book_version_id || !recovery || typeof recovery !== "object"
    || Array.isArray(recovery) || recovery.versionId !== row.book_version_id
    || typeof recovery.sourceHash !== "string" || !/^[a-f0-9]{64}$/i.test(recovery.sourceHash)) {
    console.warn("[import retry] recovery checkpoint unavailable", { importId: row.id });
    return apiError("IMPORT_RECOVERY_CHECKPOINT_UNAVAILABLE", 409, { reference: row.id });
  }

  const filePath = (row as { file_path?: string }).file_path;
  const fileStorage = (row as { file_storage?: string }).file_storage;
  if (!filePath || !fileStorage) {
    return apiError(E_IMPORT_MISSING_FILE_INFO, 400);
  }

  const { data: admitted, error: updateError } = await supabase
    .from("book_imports")
    .update({
      status: "pending",
      progress: 0,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("author_id", user.id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[imports] retry update failed", { id, message: updateError.message });
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!admitted) return apiError(E_IMPORT_NOT_FAILED, 409);

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
    message: jobId ? "Import re-queued." : "Import reset; start the worker to process it.",
  });
}
