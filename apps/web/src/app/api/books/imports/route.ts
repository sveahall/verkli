import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";

export async function GET(request: Request) {
  assertPublicEnv();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)), 100);

  const { data: rows, error } = await supabase
    .from("book_imports")
    .select("id, book_id, book_version_id, file_name, status, progress, error_message, created_at")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    imports: (rows ?? []).map((r) => ({
      id: r.id,
      book_id: r.book_id ?? null,
      book_version_id: r.book_version_id ?? null,
      file_name: r.file_name,
      status: r.status,
      progress: r.progress,
      error: r.error_message ?? null,
      created_at: r.created_at,
    })),
  });
}
