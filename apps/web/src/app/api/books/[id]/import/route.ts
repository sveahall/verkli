import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  getImportFile,
  parseImportMode,
  startScopedBookImport,
  validateImportFile,
} from "@/lib/imports/scoped-import";
import {
  apiError,
  E_INVALID_MULTIPART_BODY,
  E_MISSING_FILE,
  E_INVALID_IMPORT_MODE,
  E_VALIDATION_FAILED,
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

  const targetVersionId =
    readOptionalString(formData.get("bookVersionId")) ??
    readOptionalString(formData.get("targetVersionId"));

  const supabase = await createClient();
  const result = await startScopedBookImport({
    supabase,
    userId: user.id,
    bookId,
    file,
    mode,
    targetVersionId,
  });

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
