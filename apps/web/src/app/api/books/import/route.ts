import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { enqueueExtractJob } from "@/lib/import-queue";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  getImportFile,
  parseImportMode,
  startScopedBookImport,
  validateImportFile,
} from "@/lib/imports/scoped-import";
import { storeImportFile } from "@/lib/import-storage";
import {
  apiError,
  E_INVALID_MULTIPART_BODY,
  E_MISSING_FILE,
  E_INVALID_IMPORT_MODE,
  E_IMPORT_RECORD_CREATION_FAILED,
  E_IMPORT_FILE_STORAGE_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

function readOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  assertPublicEnv();

  // SECURITY: Require author role for book import
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError(E_INVALID_MULTIPART_BODY, 400);
  }

  const file = getImportFile(formData);
  if (!file) {
    return apiError(E_MISSING_FILE, 400);
  }

  const fileError = validateImportFile(file);
  if (fileError) {
    return apiError(E_VALIDATION_FAILED, 400, { detail: fileError });
  }

  const mode = parseImportMode({
    mode: formData.get("mode"),
    overwrite: formData.get("overwrite"),
  });

  if (!mode) {
    return apiError(E_INVALID_IMPORT_MODE, 400);
  }

  // Backward-compatible path for BookEditor:
  // if a bookId is provided, run scoped import to that book.
  const bookId = readOptionalString(formData.get("bookId"));
  if (bookId) {
    const targetVersionId =
      readOptionalString(formData.get("bookVersionId")) ??
      readOptionalString(formData.get("targetVersionId"));

    const supabase = await createClient();
    const scoped = await startScopedBookImport({
      supabase,
      userId: user.id,
      bookId,
      file,
      mode,
      targetVersionId,
    });

    if (!scoped.ok) {
      return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    }

    return NextResponse.json({
      id: scoped.importId,
      jobId: scoped.jobId,
      status: "pending",
      progress: 0,
      mode: scoped.mode,
      targetVersionId: scoped.targetVersionId,
      message: scoped.message,
    });
  }

  // Legacy import flow (no explicit bookId): create import record and let worker create a new book.
  const buffer = Buffer.from(await file.arrayBuffer());
  const supabase = await createClient();
  const { data: importRow, error: insertError } = await supabase
    .from("book_imports")
    .insert({
      author_id: user.id,
      file_name: file.name,
      file_path: "", // set after store
      file_storage: "local",
      mode,
      status: "pending",
      progress: 0,
    })
    .select("id")
    .single();

  if (insertError || !importRow?.id) {
    console.error("[book-import.legacy] insert failed", {
      userId: user.id,
      message: insertError?.message,
    });
    return apiError(E_IMPORT_RECORD_CREATION_FAILED, 500);
  }

  const store = await storeImportFile(user.id, importRow.id, file.name, buffer);
  if (!store.ok) {
    await supabase
      .from("book_imports")
      .update({ status: "failed", error_message: store.error })
      .eq("id", importRow.id);
    return apiError(E_IMPORT_FILE_STORAGE_FAILED, 500);
  }

  await supabase
    .from("book_imports")
    .update({
      file_path: store.filePath,
      file_storage: store.fileStorage,
      status: "pending",
      error_message: null,
    })
    .eq("id", importRow.id);

  let jobId: string | null = null;
  try {
    jobId = await enqueueExtractJob({
      importId: importRow.id,
      filePath: store.filePath,
      fileStorage: store.fileStorage,
      authorId: user.id,
      mode,
      targetVersionId: null,
    });
  } catch (err) {
    console.warn("[book-import.legacy] enqueue failed", {
      userId: user.id,
      importId: importRow.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (!jobId) {
    console.warn("[book-import.legacy] REDIS_URL not set or Redis unreachable", {
      userId: user.id,
      importId: importRow.id,
    });
  }

  return NextResponse.json({
    id: importRow.id,
    jobId,
    status: "pending",
    progress: 0,
    mode,
    message: jobId
      ? "Import queued"
      : "Import created; start Redis and run the worker to process (see server log).",
  });
}
