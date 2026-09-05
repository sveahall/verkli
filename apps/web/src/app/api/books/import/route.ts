import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { enqueueExtractJob } from "@/lib/import-queue";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { enforceRightsAttestation, linkRightsAttestation } from "@/lib/imports/attestation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookAsOwner } from "@/lib/books/service";
import {
  getImportFile,
  parseImportMode,
  startScopedBookImport,
  validateImportFile,
} from "@/lib/imports/scoped-import";
import { storeImportFile } from "@/lib/import-storage";
import {
  apiError,
  isValidUuid,
  E_INVALID_MULTIPART_BODY,
  E_MISSING_FILE,
  E_INVALID_IMPORT_MODE,
  E_IMPORT_RECORD_CREATION_FAILED,
  E_IMPORT_FILE_STORAGE_FAILED,
  E_VALIDATION_FAILED,
  E_INVALID_BOOK_ID,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_QUEUE_UNAVAILABLE,
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

  const bookId = readOptionalString(formData.get("bookId"));
  if (bookId && !isValidUuid(bookId)) {
    return apiError(E_INVALID_BOOK_ID, 400);
  }

  const supabase = await createClient();
  if (bookId) {
    // Verify ownership before the service-role attestation writes a durable row.
    const owned = await getBookAsOwner(supabase, bookId, user.id, "id, author_id");
    if (!owned.ok) {
      if (owned.error === "database_error") {
        return apiError(E_DATABASE_ERROR, 500);
      }
      return apiError(E_BOOK_NOT_FOUND, 404);
    }
  }

  // File validation and optional ownership checks precede the first write.
  // The legacy worker-created-book path still records a null book ID.
  const attestation = await enforceRightsAttestation({
    request,
    formData,
    userId: user.id,
    bookId,
    file,
  });
  if (!attestation.ok) return attestation.response;

  // Backward-compatible path for BookEditor:
  // if a bookId is provided, run scoped import to that book.
  if (bookId) {
    const targetVersionId =
      readOptionalString(formData.get("bookVersionId")) ??
      readOptionalString(formData.get("targetVersionId"));

    const scoped = await startScopedBookImport({
      supabase,
      userId: user.id,
      bookId,
      file,
      mode,
      targetVersionId,
    });

    if (!scoped.ok) {
      return apiError(
        scoped.errorKey,
        scoped.status,
        scoped.detail ? { detail: scoped.detail } : undefined
      );
    }

    await linkRightsAttestation(createAdminClient(), attestation.attestationId, {
      bookImportId: scoped.importId,
      bookId,
    });

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
  const admin = createAdminClient();
  const { data: importRow, error: insertError } = await admin
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
    .single()
    .then((result) => result, () => ({ data: null, error: { message: "Import record creation request failed" } }));

  if (insertError || !importRow?.id) {
    console.error("[book-import.legacy] insert failed", {
      userId: user.id,
      message: insertError?.message,
    });
    return apiError(E_IMPORT_RECORD_CREATION_FAILED, 500);
  }

  // Links the attestation to the import row. On this path the book is created
  // by the worker later, and it sets book_imports.book_id — so the import row is
  // the join that eventually reaches the book. Without it the primary
  // create-a-book flow leaves every attestation attached to nothing but a user
  // id and a filename.
  await linkRightsAttestation(createAdminClient(), attestation.attestationId, {
    bookImportId: importRow.id,
  });

  const failImport = async (message: string) => {
    try {
      const { error } = await admin.from("book_imports")
        .update({ status: "failed", error_message: message })
        .eq("id", importRow.id)
        .eq("author_id", user.id)
        .eq("status", "pending");
      if (error) console.error("[book-import.legacy] failure update failed", { importId: importRow.id, userId: user.id, message: error.message });
    } catch {
      console.error("[book-import.legacy] failure update failed", { importId: importRow.id, userId: user.id, category: "database_unavailable" });
    }
  };

  const store = await storeImportFile(user.id, importRow.id, file.name, buffer);
  if (!store.ok) {
    await failImport(store.error);
    return apiError(E_IMPORT_FILE_STORAGE_FAILED, 500);
  }

  const { data: sourceRow, error: updatePathError } = await admin
    .from("book_imports")
    .update({
      file_path: store.filePath,
      file_storage: store.fileStorage,
      status: "pending",
      error_message: null,
    })
    .eq("id", importRow.id)
    .eq("author_id", user.id)
    .eq("file_path", "")
    .select("id")
    .maybeSingle()
    .then((result) => result, () => ({ data: null, error: { message: "Import source update request failed" } }));

  if (updatePathError || !sourceRow) {
    console.error("[book-import.legacy] source update failed", { userId: user.id, importId: importRow.id, message: updatePathError?.message });
    await failImport("Import source could not be recorded");
    return apiError(E_IMPORT_RECORD_CREATION_FAILED, 500);
  }

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
    console.error("[book-import.legacy] queue unavailable", { userId: user.id, importId: importRow.id });
    await failImport(E_QUEUE_UNAVAILABLE);
    return apiError(E_QUEUE_UNAVAILABLE, 503);
  }

  return NextResponse.json({
    id: importRow.id,
    jobId,
    status: "pending",
    progress: 0,
    mode,
    message: "Import queued",
  });
}
