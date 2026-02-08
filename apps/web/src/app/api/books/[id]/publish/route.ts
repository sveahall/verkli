import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
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
} from "@/lib/api-errors";

type PublishVisibility = "public" | "followers" | "private";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const versionFromBody =
    body?.versionId != null && String(body.versionId).trim() !== ""
      ? String(body.versionId).trim()
      : null;
  const requestedVisibility = normalizeVisibility(body?.visibility);
  const requestedAction =
    typeof body?.action === "string" && ["publish", "update", "unpublish"].includes(body.action)
      ? (body.action as "publish" | "update" | "unpublish")
      : null;
  const versionFromQuery = new URL(request.url).searchParams.get("versionId");
  const requestedVersionId = versionFromBody ?? versionFromQuery ?? null;

  // SECURITY: Require author role for book publishing
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, status, original_language, cover_image")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    console.error("[publish] book lookup failed", { bookId: id, code: bookError.code, message: bookError.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  let versionId = requestedVersionId;
  if (!versionId) {
    const { data: defaultVersion } = await supabase
      .from("book_versions")
      .select("id")
      .eq("book_id", id)
      .eq("language_code", (book as { original_language?: string | null }).original_language ?? "en")
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

  const { data: version, error: versionError } = await supabase
    .from("book_versions")
    .select("id, book_id, published_at, visibility")
    .eq("id", versionId)
    .maybeSingle();

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
    const { error: versionUpdateError } = await supabase
      .from("book_versions")
      .update({ published_at: null })
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

  if (version.published_at) {
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

  const { error: versionUpdateError } = await supabase
    .from("book_versions")
    .update({
      status: "done",
      published_at: now,
      visibility: nextVisibility,
    })
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
