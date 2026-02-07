import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;

  // SECURITY: Require author role for book deletion
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    return NextResponse.json({ ok: false, error: bookError.message }, { status: 500 });
  }

  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Book not found" }, { status: 404 });
  }

  // Use admin client for cleanup of tables without CASCADE or with RLS restrictions
  const admin = createAdminClient();
  const warnings: string[] = [];

  // 1. Collect chapter IDs before book deletion cascades them
  const { data: chapters } = await admin
    .from("chapters")
    .select("id")
    .eq("book_id", id);

  const chapterIds = (chapters ?? []).map((c: { id: string }) => c.id);

  // 2. Delete chapter_audio_cache (no FK to books; chapters will cascade away)
  if (chapterIds.length > 0) {
    const { error: cacheError } = await admin
      .from("chapter_audio_cache")
      .delete()
      .in("chapter_id", chapterIds);

    if (cacheError) {
      console.error("[delete-book] bookId=%s step=chapter_audio_cache error=%s", id, cacheError.message);
      warnings.push("chapter_audio_cache_cleanup_failed");
    }
  }

  // 3. Delete ai_jobs referencing this book.
  //    Rows with book_id set will also cascade when the book is deleted,
  //    but we delete explicitly to capture errors. Legacy rows (book_id IS NULL)
  //    need manual cleanup via input JSONB.
  const { error: jobsByColError } = await admin
    .from("ai_jobs")
    .delete()
    .eq("book_id", id);

  if (jobsByColError) {
    console.error("[delete-book] bookId=%s step=ai_jobs(book_id) error=%s", id, jobsByColError.message);
    warnings.push("ai_jobs_cleanup_failed");
  }

  // Legacy rows where book_id wasn't backfilled
  const { data: legacyJobs } = await admin
    .from("ai_jobs")
    .select("id, input")
    .eq("user_id", user.id)
    .is("book_id", null);

  const legacyJobIds = (legacyJobs ?? [])
    .filter((j: { id: string; input: unknown }) => {
      const input = j.input as Record<string, unknown> | null;
      return input?.bookId === id;
    })
    .map((j: { id: string }) => j.id);

  if (legacyJobIds.length > 0) {
    const { error: legacyError } = await admin
      .from("ai_jobs")
      .delete()
      .in("id", legacyJobIds);

    if (legacyError) {
      console.error("[delete-book] bookId=%s step=ai_jobs(legacy) error=%s", id, legacyError.message);
      warnings.push("ai_jobs_legacy_cleanup_failed");
    }
  }

  // 4. Delete book_imports (ON DELETE SET NULL would leave orphan rows)
  const { error: importsError } = await admin
    .from("book_imports")
    .delete()
    .eq("book_id", id);

  if (importsError) {
    console.error("[delete-book] bookId=%s step=book_imports error=%s", id, importsError.message);
    warnings.push("book_imports_cleanup_failed");
  }

  // 5. Delete the book — cascades: chapters, book_versions, audiobook_assets,
  //    marketing_campaigns, translations
  const { error: deleteError } = await admin
    .from("books")
    .delete()
    .eq("id", id)
    .eq("author_id", user.id);

  if (deleteError) {
    console.error("[delete-book] bookId=%s step=books error=%s", id, deleteError.message);
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json(warnings.length > 0 ? { ok: true, warnings } : { ok: true });
}
