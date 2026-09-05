import { createAdminClient } from "@/lib/supabase/admin";
import { storeImportFile } from "@/lib/import-storage";
import { enqueueExtractJob, type ImportMode } from "@/lib/import-queue";
import type { createClient } from "@/lib/supabase/server";
import {
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_IMPORT_FILE_STORAGE_FAILED,
  E_IMPORT_RECORD_CREATION_FAILED,
  E_INVALID_BOOK_VERSION,
  E_QUEUE_UNAVAILABLE,
} from "@/lib/api-errors";

export const IMPORT_ALLOWED_EXTENSIONS = [".epub", ".docx", ".html", ".htm", ".txt", ".pdf"] as const;
export const IMPORT_MAX_MB = 50;
export const IMPORT_MAX_BYTES = IMPORT_MAX_MB * 1024 * 1024;

export function parseImportMode(input: {
  mode?: FormDataEntryValue | null;
  overwrite?: FormDataEntryValue | null;
}): ImportMode | null {
  const rawMode = typeof input.mode === "string" ? input.mode.trim().toLowerCase() : "";
  if (rawMode === "new_version" || rawMode === "overwrite_draft") {
    return rawMode;
  }

  const rawOverwrite = typeof input.overwrite === "string" ? input.overwrite.trim().toLowerCase() : "";
  if (rawOverwrite === "true" || rawOverwrite === "1") {
    return "overwrite_draft";
  }
  if (rawOverwrite === "false" || rawOverwrite === "0") {
    return "new_version";
  }

  return rawMode === "" ? "new_version" : null;
}

export function getImportFile(formData: FormData): File | null {
  const file = formData.get("file") ?? formData.get("book");
  return file instanceof File ? file : null;
}

export function validateImportFile(file: File): string | null {
  const ext =
    file.name.includes(".") && file.name.split(".").pop()
      ? `.${file.name.split(".").pop()!.toLowerCase()}`
      : "";

  if (!IMPORT_ALLOWED_EXTENSIONS.includes(ext as (typeof IMPORT_ALLOWED_EXTENSIONS)[number])) {
    return `Unsupported format. Allowed: ${IMPORT_ALLOWED_EXTENSIONS.join(", ")}`;
  }

  if (file.size > IMPORT_MAX_BYTES) {
    return `File too large (max ${IMPORT_MAX_MB} MB)`;
  }

  return null;
}

export type ScopedImportResult =
  | {
      ok: true;
      importId: string;
      jobId: string;
      mode: ImportMode;
      targetVersionId: string | null;
      message: string;
    }
  | {
      ok: false;
      status: number;
      errorKey: string;
      detail?: string;
    };

type StartScopedBookImportArgs = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  bookId: string;
  file: File;
  mode: ImportMode;
  targetVersionId: string | null;
};

export async function startScopedBookImport({
  supabase,
  userId,
  bookId,
  file,
  mode,
  targetVersionId,
}: StartScopedBookImportArgs): Promise<ScopedImportResult> {
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  const typedBook = book as { id: string; author_id: string } | null;

  if (bookError) {
    console.error("[book-import] book lookup failed", {
      bookId,
      userId,
      message: bookError.message,
    });
    return { ok: false, status: 500, errorKey: E_DATABASE_ERROR };
  }

  if (!typedBook || typedBook.author_id !== userId) {
    return { ok: false, status: 404, errorKey: E_BOOK_NOT_FOUND };
  }

  if (mode === "overwrite_draft" && targetVersionId) {
    const { data: version, error: versionError } = await supabase
      .from("book_versions")
      .select("id, book_id, published_at")
      .eq("id", targetVersionId)
      .maybeSingle();

    const typedVersion = version as { id: string; book_id: string; published_at: string | null } | null;

    if (versionError) {
      console.error("[book-import] version lookup failed", {
        bookId,
        userId,
        targetVersionId,
        message: versionError.message,
      });
      return { ok: false, status: 500, errorKey: E_DATABASE_ERROR };
    }

    if (!typedVersion || typedVersion.book_id !== bookId) {
      return { ok: false, status: 400, errorKey: E_INVALID_BOOK_VERSION, detail: "Invalid draft version" };
    }

    if (typedVersion.published_at) {
      return {
        ok: false,
        status: 400,
        errorKey: E_INVALID_BOOK_VERSION,
        detail: "Cannot overwrite a published version",
      };
    }
  }

  const admin = createAdminClient();
  const { data: insertRow, error: insertError } = await admin
    .from("book_imports")
    .insert({
      author_id: userId,
      book_id: bookId,
      book_version_id: targetVersionId,
      mode,
      file_name: file.name,
      file_path: "",
      file_storage: "local",
      status: "pending",
      progress: 0,
    })
    .select("id")
    .single()
    .then((result) => result, () => ({ data: null, error: { message: "Import record creation request failed" } }));

  const importRow = insertRow as { id: string } | null;

  if (insertError || !importRow?.id) {
    console.error("[book-import] insert failed", {
      bookId,
      userId,
      message: insertError?.message,
    });
    return { ok: false, status: 500, errorKey: E_IMPORT_RECORD_CREATION_FAILED };
  }

  const failImport = async (message: string) => {
    try {
      const { error } = await admin.from("book_imports")
        .update({ status: "failed", error_message: message })
        .eq("id", importRow.id)
        .eq("author_id", userId)
        .eq("status", "pending");
      if (error) console.error("[book-import] failure update failed", { importId: importRow.id, userId, message: error.message });
    } catch {
      console.error("[book-import] failure update failed", { importId: importRow.id, userId, category: "database_unavailable" });
    }
  };

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeImportFile(userId, importRow.id, file.name, buffer);
  if (!stored.ok) {
    await failImport(stored.error);
    return { ok: false, status: 500, errorKey: E_IMPORT_FILE_STORAGE_FAILED };
  }

  const { data: sourceRow, error: sourceError } = await admin
    .from("book_imports")
    .update({
      file_path: stored.filePath,
      file_storage: stored.fileStorage,
      status: "pending",
      error_message: null,
    })
    .eq("id", importRow.id)
    .eq("author_id", userId)
    .eq("file_path", "")
    .select("id")
    .maybeSingle()
    .then((result) => result, () => ({ data: null, error: { message: "Import source update request failed" } }));

  if (sourceError || !sourceRow) {
    console.error("[book-import] source update failed", { importId: importRow.id, userId, message: sourceError?.message });
    await failImport("Import source could not be recorded");
    return { ok: false, status: 500, errorKey: E_IMPORT_RECORD_CREATION_FAILED };
  }

  let jobId: string | null = null;
  try {
    jobId = await enqueueExtractJob({
      importId: importRow.id,
      filePath: stored.filePath,
      fileStorage: stored.fileStorage,
      authorId: userId,
      bookId,
      mode,
      targetVersionId,
    });
  } catch {
    console.error("[book-import] dispatch unconfirmed", { bookId, userId, importId: importRow.id });
  }
  if (!jobId) {
    console.error("[book-import] queue unavailable", { bookId, userId, importId: importRow.id });
    await failImport(E_QUEUE_UNAVAILABLE);
    return { ok: false, status: 503, errorKey: E_QUEUE_UNAVAILABLE };
  }

  return { ok: true, importId: importRow.id, jobId, mode, targetVersionId, message: "Import queued" };
}
