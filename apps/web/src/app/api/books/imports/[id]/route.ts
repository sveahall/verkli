import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";

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
    .select("id, book_id, book_version_id, file_name, status, progress, error_message, created_at, updated_at")
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    book_id: row.book_id ?? null,
    book_version_id: row.book_version_id ?? null,
    file_name: row.file_name,
    status: row.status,
    progress: row.progress,
    error: row.error_message ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}
