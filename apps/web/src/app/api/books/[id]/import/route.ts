import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { enforceRightsAttestation, linkRightsAttestation } from "@/lib/imports/attestation";
import { getBookAsOwner } from "@/lib/books/service";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getImportFile,
  parseImportMode,
  startScopedBookImport,
  validateImportFile,
} from "@/lib/imports/scoped-import";
import {
  apiError,
  isValidUuid,
  E_INVALID_BOOK_ID,
  E_INVALID_MULTIPART_BODY,
  E_MISSING_FILE,
  E_INVALID_IMPORT_MODE,
  E_VALIDATION_FAILED,
  E_BOOK_NOT_FOUND,
} from "@/lib/api-errors";

function readOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();

  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

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

  const supabase = await createClient();

  // Ownership FIRST, before anything durable is written. startScopedBookImport
  // checks this too, but it runs after the attestation — so without this an
  // authenticated author could POST any book UUID and leave an immutable
  // attestation against a book they do not own. The import would 404 and the
  // legal record would persist.
  const owned = await getBookAsOwner(supabase, bookId, user.id, "id, author_id");
  if (!owned.ok) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Same gate as /api/books/import. This route has no UI caller, which is
  // exactly why it must be gated: leaving it open is one curl away from making
  // the whole attestation decorative.
  const attestation = await enforceRightsAttestation({
    request,
    formData,
    userId: user.id,
    bookId,
    file,
  });
  if (!attestation.ok) return attestation.response;

  const targetVersionId =
    readOptionalString(formData.get("bookVersionId")) ??
    readOptionalString(formData.get("targetVersionId"));

  const result = await startScopedBookImport({
    supabase,
    userId: user.id,
    bookId,
    file,
    mode,
    targetVersionId,
  });

  if (result.ok) {
    await linkRightsAttestation(createAdminClient(), attestation.attestationId, {
      bookImportId: result.importId,
      bookId,
    });
  }

  if (!result.ok) {
    return apiError(
      result.errorKey,
      result.status,
      result.detail ? { detail: result.detail } : undefined
    );
  }

  return NextResponse.json({
    id: result.importId,
    jobId: result.jobId,
    status: "pending",
    progress: 0,
    mode: result.mode,
    targetVersionId: result.targetVersionId,
    message: result.message,
  });
}
