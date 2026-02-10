import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { normalizeJobStatus } from "@/lib/job-status";
import { sanitizeJobError } from "@/lib/sanitize-job-error";
import { apiError, E_DATABASE_ERROR } from "@/lib/api-errors";

export async function GET(request: Request) {
  assertPublicEnv();

  // SECURITY: Require author role for viewing imports
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)), 100);

  const { data: rows, error } = await supabase
    .from("book_imports")
    .select("id, book_id, book_version_id, file_name, mode, status, progress, result, error_message, created_at")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[imports] list failed", { message: error.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({
    imports: (rows ?? []).map((r) => ({
      id: r.id,
      book_id: r.book_id ?? null,
      book_version_id: r.book_version_id ?? null,
      file_name: r.file_name,
      mode: r.mode ?? "new_version",
      status: normalizeJobStatus(r.status),
      progress: r.progress,
      result: r.result && typeof r.result === "object" ? r.result : null,
      error: sanitizeJobError(r.error_message),
      created_at: r.created_at,
    })),
  });
}
