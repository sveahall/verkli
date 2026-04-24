import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { getBookAsOwner } from "@/lib/books/service";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_NO_BOOK_VERSION_TO_PUBLISH,
  E_INVALID_BOOK_VERSION,
  E_MISSING_VISIBILITY_SETTING,
  E_MISSING_BOOK_TITLE,
  E_NO_CHAPTERS,
  E_CHAPTER_NEEDS_CONTENT,
  E_MISSING_COVER_IMAGE,
  E_INVALID_BOOK_ID,
  isValidUuid,
} from "@/lib/api-errors";

type PublishVisibility = "public" | "followers" | "private";
type PublishScope = "book" | "chapter";

function hasContent(content: string | null): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    const text = extractText(parsed);
    return text.trim().length > 0;
  } catch {
    return content.trim().length > 0;
  }
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof (node as { text?: string }).text === "string") {
    return (node as { text: string }).text;
  }
  if ("content" in node && Array.isArray((node as { content?: unknown[] }).content)) {
    return (node as { content: unknown[] }).content
      .map(extractText)
      .join("");
  }
  return "";
}

function normalizeVisibility(value: unknown): PublishVisibility | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "public" || normalized === "followers" || normalized === "private") {
    return normalized;
  }
  return null;
}

function normalizeScope(value: unknown): PublishScope {
  if (typeof value !== "string") return "book";
  return value.trim().toLowerCase() === "chapter" ? "chapter" : "book";
}

function isMissingPublishedChapterCountColumn(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42703" &&
    typeof error.message === "string" &&
    error.message.includes("published_chapter_count")
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;
  if (!isValidUuid(id)) return apiError(E_INVALID_BOOK_ID, 400);
  const body = await request.json().catch(() => ({}));
  const versionFromBody =
    body?.versionId != null && String(body.versionId).trim() !== ""
      ? String(body.versionId).trim()
      : null;
  const requestedVisibility = normalizeVisibility(body?.visibility);
  const requestedScope = normalizeScope(body?.scope);
  const requestedAction =
    typeof body?.action === "string" && ["publish", "update", "unpublish"].includes(body.action)
      ? (body.action as "publish" | "update" | "unpublish")
      : null;
  const requestedChapterId =
    body?.chapterId != null && String(body.chapterId).trim() !== ""
      ? String(body.chapterId).trim()
      : null;
  const versionFromQuery = new URL(request.url).searchParams.get("versionId");
  const requestedVersionId = versionFromBody ?? versionFromQuery ?? null;

  // SECURITY: Require author role for book publishing
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  // Ownership check
  const bookResult = await getBookAsOwner(
    supabase,
    id,
    user.id,
    "id, title, author_id, status, original_language, language, cover_image",
  );
  if (!bookResult.ok) {
    return apiError(
      bookResult.error === "book_not_found" ? E_BOOK_NOT_FOUND : E_DATABASE_ERROR,
      bookResult.error === "book_not_found" ? 404 : 500,
    );
  }
  const book = bookResult.data as {
    id: string;
    title: string | null;
    author_id: string;
    status: string | null;
    original_language?: string | null;
    language?: string | null;
    cover_image?: string | null;
  };

  let versionId = requestedVersionId;
  if (!versionId) {
    // Prefer the book's original_language, then fall back to `language`
    // (the legacy column some Swedish-first books populate instead) before
    // hard-coding "en". Otherwise a Swedish author with `original_language`
    // null publishes whatever happens to be first by created_at.
    const preferredLanguage =
      book.original_language ?? book.language ?? "en";
    const { data: defaultVersion } = await supabase
      .from("book_versions")
      .select("id")
      .eq("book_id", id)
      .eq("language_code", preferredLanguage)
      .maybeSingle();
    versionId = defaultVersion?.id ?? null;
  }
  if (!versionId) {
    const { data: anyVersion } = await supabase
      .from("book_versions")
      .select("id")
      .eq("book_id", id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    versionId = anyVersion?.id ?? null;
  }
  if (!versionId) {
    return apiError(E_NO_BOOK_VERSION_TO_PUBLISH, 400);
  }

  let hasPublishedChapterCountColumn = true;

  const withPublishedChapterCount = await supabase
    .from("book_versions")
    .select("id, book_id, published_at, visibility, published_chapter_count")
    .eq("id", versionId)
    .maybeSingle();

  const fallbackWithoutPublishedChapterCount = isMissingPublishedChapterCountColumn(
    withPublishedChapterCount.error
  )
    ? await supabase
        .from("book_versions")
        .select("id, book_id, published_at, visibility")
        .eq("id", versionId)
        .maybeSingle()
    : null;

  if (fallbackWithoutPublishedChapterCount) {
    hasPublishedChapterCountColumn = false;
  }

  const version =
    fallbackWithoutPublishedChapterCount?.data != null
      ? { ...fallbackWithoutPublishedChapterCount.data, published_chapter_count: null }
      : withPublishedChapterCount.data;
  const versionError = fallbackWithoutPublishedChapterCount?.error ?? withPublishedChapterCount.error;

  if (versionError || !version || version.book_id !== id) {
    if (versionError) {
      console.error("[publish] version lookup failed", { bookId: id, versionId, message: versionError.message });
    }
    return apiError(E_INVALID_BOOK_VERSION, 400);
  }

  if (requestedAction === "unpublish") {
    if (!version.published_at) {
      return NextResponse.json({ ok: true, alreadyUnpublished: true });
    }

    // Chapter-level unpublish: retract a single chapter (and all after it)
    if (requestedScope === "chapter" && requestedChapterId && hasPublishedChapterCountColumn) {
      const { data: chapter, error: chapterError } = await supabase
        .from("chapters")
        .select("id, order")
        .eq("book_version_id", versionId)
        .eq("id", requestedChapterId)
        .maybeSingle();

      if (chapterError) {
        console.error("[publish] chapter lookup for unpublish failed", {
          bookId: id, versionId, chapterId: requestedChapterId, message: chapterError.message,
        });
        return apiError(E_DATABASE_ERROR, 500);
      }
      if (!chapter) {
        return apiError(E_CHAPTER_NEEDS_CONTENT, 400, { detail: "Selected chapter not found in this version." });
      }

      const chapterOrder = Number(chapter.order ?? 0);
      const nextPublishedChapterCount = Number.isFinite(chapterOrder) ? chapterOrder : 0;

      // Guard: the chapter must actually be published for unpublish to make sense.
      // If published_chapter_count is null all chapters are live; retracting is valid.
      // Otherwise the new count must be strictly less than the current count.
      const currentCount =
        typeof version.published_chapter_count === "number" && Number.isFinite(version.published_chapter_count)
          ? Math.max(0, Math.floor(version.published_chapter_count))
          : null;

      if (currentCount !== null && nextPublishedChapterCount >= currentCount) {
        // Chapter is already unpublished — retract would increase the count, which is a publish.
        return NextResponse.json({ ok: true, alreadyUnpublished: true, scope: "chapter" });
      }

      if (nextPublishedChapterCount === 0) {
        // Retracting to 0 means no chapters are published — full unpublish
        const { error: versionUpdateError } = await supabase
          .from("book_versions")
          .update({ published_at: null, published_chapter_count: null })
          .eq("id", versionId);

        if (versionUpdateError) {
          console.error("[publish] chapter unpublish (full) failed", { bookId: id, versionId, message: versionUpdateError.message });
          return apiError(E_DATABASE_ERROR, 500);
        }

        const { data: remainingPublished } = await supabase
          .from("book_versions")
          .select("id")
          .eq("book_id", id)
          .not("published_at", "is", null)
          .limit(1);

        if (!remainingPublished || remainingPublished.length === 0) {
          await supabase
            .from("books")
            .update({ status: "DRAFT", published: false, published_at: null })
            .eq("id", id);
        }

        return NextResponse.json({ ok: true, unpublished: true, scope: "chapter", publishedChapterCount: 0 });
      }

      const { error: versionUpdateError } = await supabase
        .from("book_versions")
        .update({ published_chapter_count: nextPublishedChapterCount })
        .eq("id", versionId);

      if (versionUpdateError) {
        console.error("[publish] chapter unpublish failed", {
          bookId: id, versionId, chapterId: requestedChapterId, message: versionUpdateError.message,
        });
        return apiError(E_DATABASE_ERROR, 500);
      }

      return NextResponse.json({
        ok: true,
        scope: "chapter",
        chapterId: requestedChapterId,
        publishedChapterCount: nextPublishedChapterCount,
      });
    }

    // Full version unpublish
    const unpublishPayload = hasPublishedChapterCountColumn
      ? { published_at: null, published_chapter_count: null }
      : { published_at: null };
    const { error: versionUpdateError } = await supabase
      .from("book_versions")
      .update(unpublishPayload)
      .eq("id", versionId);

    if (versionUpdateError) {
      console.error("[publish] unpublish version failed", { bookId: id, versionId, message: versionUpdateError.message });
      return apiError(E_DATABASE_ERROR, 500);
    }

    const { data: remainingPublished } = await supabase
      .from("book_versions")
      .select("id")
      .eq("book_id", id)
      .not("published_at", "is", null)
      .limit(1);

    if (!remainingPublished || remainingPublished.length === 0) {
      const { error: updateError } = await supabase
        .from("books")
        .update({
          status: "DRAFT",
          published: false,
          published_at: null,
        })
        .eq("id", id);

      if (updateError) {
        console.error("[publish] revert book to DRAFT failed", { bookId: id, message: updateError.message });
        return apiError(E_DATABASE_ERROR, 500);
      }
    }

    return NextResponse.json({ ok: true, unpublished: true });
  }

  if (requestedAction === "update") {
    if (!requestedVisibility) {
      return apiError(E_MISSING_VISIBILITY_SETTING, 400);
    }

    const { error: versionUpdateError } = await supabase
      .from("book_versions")
      .update({ visibility: requestedVisibility })
      .eq("id", versionId);

    if (versionUpdateError) {
      console.error("[publish] update visibility failed", { bookId: id, versionId, message: versionUpdateError.message });
      return apiError(E_DATABASE_ERROR, 500);
    }

    return NextResponse.json({ ok: true, visibility: requestedVisibility });
  }

  const chapterReleaseMode = requestedScope === "chapter";
  if (chapterReleaseMode && !hasPublishedChapterCountColumn) {
    return apiError(E_DATABASE_ERROR, 503, {
      detail:
        "Database schema is outdated: missing book_versions.published_chapter_count. Run the latest Supabase migrations.",
    });
  }
  if (version.published_at && !chapterReleaseMode) {
    if (requestedVisibility && requestedVisibility !== version.visibility) {
      const { error: versionUpdateError } = await supabase
        .from("book_versions")
        .update({ visibility: requestedVisibility })
        .eq("id", versionId);

      if (versionUpdateError) {
        console.error("[publish] update visibility on published version failed", { bookId: id, versionId, message: versionUpdateError.message });
        return apiError(E_DATABASE_ERROR, 500);
      }

      return NextResponse.json({ ok: true, visibility: requestedVisibility, alreadyPublished: true });
    }

    return NextResponse.json({ ok: true, alreadyPublished: true });
  }

  const title = (book.title ?? "").trim();
  if (!title) {
    return apiError(E_MISSING_BOOK_TITLE, 400);
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, content")
    .eq("book_version_id", versionId)
    .order("order", { ascending: true });

  if (!chapters || chapters.length === 0) {
    return apiError(E_NO_CHAPTERS, 400);
  }

  const hasAnyContent = chapters.some((ch) => hasContent(ch.content));
  if (!hasAnyContent) {
    return apiError(E_CHAPTER_NEEDS_CONTENT, 400);
  }

  const coverImage = (book as { cover_image?: string | null }).cover_image;
  if (!coverImage) {
    return apiError(E_MISSING_COVER_IMAGE, 400);
  }

  const now = new Date().toISOString();
  const nextVisibility = requestedVisibility ?? normalizeVisibility(version.visibility) ?? "public";

  if (chapterReleaseMode) {
    if (!requestedChapterId) {
      return apiError(E_CHAPTER_NEEDS_CONTENT, 400, { detail: "chapterId is required for chapter publish mode" });
    }

    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .select("id, order, content")
      .eq("book_version_id", versionId)
      .eq("id", requestedChapterId)
      .maybeSingle();

    if (chapterError) {
      console.error("[publish] chapter lookup failed", {
        bookId: id,
        versionId,
        chapterId: requestedChapterId,
        message: chapterError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }
    if (!chapter) {
      return apiError(E_CHAPTER_NEEDS_CONTENT, 400, { detail: "Selected chapter not found in this version." });
    }
    if (!hasContent(chapter.content)) {
      return apiError(E_CHAPTER_NEEDS_CONTENT, 400);
    }

    const currentlyPublishedChapterCount =
      typeof version.published_chapter_count === "number" && Number.isFinite(version.published_chapter_count)
        ? Math.max(0, Math.floor(version.published_chapter_count))
        : null;

    if (version.published_at && currentlyPublishedChapterCount === null) {
      return NextResponse.json({
        ok: true,
        alreadyPublished: true,
        scope: "book",
        publishedChapterCount: null,
      });
    }

    const chapterOrder = Number(chapter.order ?? 0);
    const nextPublishedChapterCount = Math.max(
      currentlyPublishedChapterCount ?? 0,
      Number.isFinite(chapterOrder) ? chapterOrder + 1 : 1
    );

    const { error: versionUpdateError } = await supabase
      .from("book_versions")
      .update({
        status: "done",
        published_at: version.published_at ?? now,
        visibility: nextVisibility,
        published_chapter_count: nextPublishedChapterCount,
      })
      .eq("id", versionId);

    if (versionUpdateError) {
      console.error("[publish] chapter publish update failed", {
        bookId: id,
        versionId,
        chapterId: requestedChapterId,
        message: versionUpdateError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }

    if (book.status !== "PUBLISHED") {
      const { error: updateError } = await supabase
        .from("books")
        .update({
          status: "PUBLISHED",
          published: true,
          published_at: now,
        })
        .eq("id", id);

      if (updateError) {
        console.error("[publish] book status update failed", { bookId: id, message: updateError.message });
        return apiError(E_DATABASE_ERROR, 500);
      }
    }

    return NextResponse.json({
      ok: true,
      scope: "chapter",
      chapterId: requestedChapterId,
      publishedChapterCount: nextPublishedChapterCount,
    });
  }

  const fullPublishPayload: {
    status: string;
    published_at: string;
    visibility: PublishVisibility;
    published_chapter_count?: number | null;
  } = {
    status: "done",
    published_at: now,
    visibility: nextVisibility,
  };
  if (hasPublishedChapterCountColumn) {
    fullPublishPayload.published_chapter_count = null;
  }

  const { error: versionUpdateError } = await supabase
    .from("book_versions")
    .update(fullPublishPayload)
    .eq("id", versionId);

  if (versionUpdateError) {
    console.error("[publish] version publish update failed", { bookId: id, versionId, message: versionUpdateError.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (book.status !== "PUBLISHED") {
    const { error: updateError } = await supabase
      .from("books")
      .update({
        status: "PUBLISHED",
        published: true,
        published_at: now,
      })
      .eq("id", id);

    if (updateError) {
      console.error("[publish] book status update failed", { bookId: id, message: updateError.message });
      return apiError(E_DATABASE_ERROR, 500);
    }
  }

  return NextResponse.json({ ok: true });
}
