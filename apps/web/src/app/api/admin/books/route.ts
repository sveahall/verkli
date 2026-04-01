import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import { apiError, E_DATABASE_ERROR, E_INVALID_BOOK_ID, isValidUuid } from "@/lib/api-errors";

export async function GET(request: Request) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const admin = createAdminClient();

  let query = admin
    .from("books")
    .select("id, title, slug, status, author_id, created_at, updated_at, language", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    // Escape LIKE wildcards to prevent filter injection
    const safe = search.replace(/[%_\\]/g, "\\$&");
    query = query.ilike("title", `%${safe}%`);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/books] load failed:", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Fetch author display names
  const authorIds = [...new Set((data ?? []).map((b) => b.author_id as string))];
  const authorMap = new Map<string, string>();

  if (authorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", authorIds);

    for (const p of profiles ?? []) {
      authorMap.set(p.user_id as string, (p.display_name as string) ?? "Unknown");
    }
  }

  const books = (data ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    slug: b.slug,
    status: b.status,
    author_id: b.author_id,
    author_name: authorMap.get(b.author_id as string) ?? "Unknown",
    language: b.language,
    created_at: b.created_at,
    updated_at: b.updated_at,
  }));

  return NextResponse.json({ books, total: count ?? 0, page, limit });
}

export async function DELETE(request: Request) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const bookId = typeof body?.bookId === "string" ? body.bookId.trim() : "";

  if (!bookId) {
    return apiError("INVALID_BOOK_ID", 400);
  }
  if (!isValidUuid(bookId)) {
    return apiError(E_INVALID_BOOK_ID, 400);
  }

  const admin = createAdminClient();

  // Clean up related records before cascade delete
  // 1. chapter_audio_cache (via chapter IDs)
  const { data: chapters, error: chaptersError } = await admin
    .from("chapters")
    .select("id")
    .eq("book_id", bookId);

  if (chaptersError) {
    console.error("[admin/books] chapter lookup failed:", chaptersError.message);
  }

  const chapterIds = (chapters ?? []).map((c) => c.id as string);
  if (chapterIds.length > 0) {
    await admin.from("chapter_audio_cache").delete().in("chapter_id", chapterIds);
  }

  // 2. ai_jobs — delete by book_id column, then legacy rows by input->bookId
  const { error: jobDeleteError } = await admin
    .from("ai_jobs")
    .delete()
    .eq("book_id", bookId);

  if (jobDeleteError) {
    console.error("[admin/books] ai_jobs cleanup by book_id failed:", jobDeleteError.message);
  }

  // Legacy rows where book_id column is null but bookId is in input JSONB
  const { data: legacyJobs } = await admin
    .from("ai_jobs")
    .select("id, input")
    .is("book_id", null)
    .not("input", "is", null)
    .limit(100);

  const legacyJobIds = (legacyJobs ?? [])
    .filter((j) => {
      const input = j.input as Record<string, unknown> | null;
      return input?.bookId === bookId;
    })
    .map((j) => j.id as string);

  if (legacyJobIds.length > 0) {
    await admin.from("ai_jobs").delete().in("id", legacyJobIds);
  }

  // 3. book_imports (SET NULL won't cascade)
  await admin.from("book_imports").delete().eq("book_id", bookId);

  // 4. Delete book (cascades chapters, book_versions, etc.)
  const { error } = await admin.from("books").delete().eq("id", bookId);

  if (error) {
    console.error("[admin/books] delete failed:", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({ ok: true, bookId });
}
