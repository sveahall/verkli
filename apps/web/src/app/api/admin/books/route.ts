import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import { auditMetadataFromRequest, recordAudit } from "@/lib/audit";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_INVALID_REQUEST_BODY,
  isValidUuid,
} from "@/lib/api-errors";

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
    .select("id, title, slug, status, author_id, cover_image, created_at, updated_at, language", { count: "exact" })
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
    cover_image: b.cover_image,
    language: b.language,
    created_at: b.created_at,
    updated_at: b.updated_at,
  }));

  return NextResponse.json({ books, total: count ?? 0, page, limit });
}

export async function DELETE(request: Request) {
  const { user: adminUser, response } = await requireAdminRoleForApi();
  if (response || !adminUser) return response ?? apiError("UNAUTHORIZED", 401);

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

  // Audit trail — best-effort.
  try {
    await admin.from("audit_log").insert({
      entity_type: "book",
      entity_id: bookId,
      action: "delete",
      actor_user_id: adminUser.id,
      actor_role: "admin",
      meta: { chapters_deleted: chapterIds.length },
    });
  } catch (auditError) {
    console.error("[admin/books] audit log insert failed", {
      bookId,
      adminUserId: adminUser.id,
      message:
        auditError instanceof Error ? auditError.message : String(auditError),
    });
  }

  return NextResponse.json({ ok: true, bookId });
}

/**
 * Change a book's publication status.
 *
 * Until now the only lever admin had over a live book was DELETE, which
 * cascades chapters, versions, jobs and assets. So the answer to "this must not
 * be public right now" was "destroy it and everything under it" — and on launch
 * day, with a book that is merely wrong rather than illegitimate, that is not an
 * answer anyone should have to give.
 *
 * DRAFT is what the UI's Unpublish sends: reversible, and the author keeps the
 * book in their workbench. ARCHIVED stays available here for a real takedown.
 * Both are accepted rather than one being hardcoded, because the difference is a
 * judgement about the book, not about the plumbing.
 */
const BOOK_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
type BookStatusValue = (typeof BOOK_STATUSES)[number];

function isBookStatus(value: unknown): value is BookStatusValue {
  return typeof value === "string" && BOOK_STATUSES.includes(value as BookStatusValue);
}

export async function PATCH(request: Request) {
  const { user: adminUser, response } = await requireAdminRoleForApi();
  if (response || !adminUser) return response ?? apiError("UNAUTHORIZED", 401);

  const body = await request.json().catch(() => null);
  const bookId = typeof body?.bookId === "string" ? body.bookId.trim() : "";
  const status = body?.status;

  if (!bookId || !isValidUuid(bookId)) {
    return apiError(E_INVALID_BOOK_ID, 400);
  }
  if (!isBookStatus(status)) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const admin = createAdminClient();

  // Read the current status first. Two reasons: the audit row is worth much more
  // when it records what the status actually changed FROM, and a missing book
  // must 404 rather than report a successful no-op update — PostgREST reports
  // zero matched rows the same way as a successful write.
  const { data: existing, error: readError } = await admin
    .from("books")
    .select("id, status, title")
    .eq("id", bookId)
    .maybeSingle();

  if (readError) {
    console.error("[admin/books] status read failed:", readError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!existing) {
    return apiError(E_INVALID_BOOK_ID, 404);
  }

  const previousStatus = (existing.status as string | null) ?? null;

  if (previousStatus === status) {
    // Not an error, but say so plainly rather than writing an audit row that
    // claims a change nobody made.
    return NextResponse.json({ ok: true, bookId, status, changed: false });
  }

  const { error: updateError } = await admin
    .from("books")
    .update({ status })
    .eq("id", bookId);

  if (updateError) {
    console.error("[admin/books] status update failed:", updateError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Audit trail — best-effort, and deliberately not allowed to fail the request.
  // Taking a book off the shelf having already succeeded, then 500-ing because
  // the log write failed, would invite the admin to press the button again.
  //
  // `recordAudit`, not a raw insert in a try/catch: the Supabase client resolves
  // with an `{ error }` property rather than throwing, so a catch block never
  // fires on a rejected insert and the row vanishes with no diagnostic. The
  // `book.publish` / `book.unpublish` actions were already in the taxonomy.
  await recordAudit(admin, {
    action: status === "PUBLISHED" ? "book.publish" : "book.unpublish",
    target: { type: "book", id: bookId },
    actor: { id: adminUser.id, role: "admin" },
    metadata: auditMetadataFromRequest(request),
    before: { status: previousStatus },
    after: { status, title: existing.title ?? null },
  });

  return NextResponse.json({ ok: true, bookId, status, changed: true });
}
