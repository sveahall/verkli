import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  isValidUuid,
} from "@/lib/api-errors";

type ChapterPayload = {
  id: string;
  title: string;
  order: number;
  bookVersionId: string;
  languageCode: string;
  content: string | null;
  sourceText: string | null;
  hasAudio: boolean;
};

type VersionPayload = {
  id: string;
  languageCode: string;
  status: string;
  publishedAt: string | null;
  chapterCount: number;
  audiobookStatus: string | null;
};

/**
 * Admin book moderation detail. Uses the service-role client so chapter content
 * of DRAFT / unpublished books (hidden from the anon client by RLS) is readable.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  const admin = createAdminClient();

  const { data: book, error: bookError } = await admin
    .from("books")
    .select(
      "id, title, slug, description, cover_image, status, author_id, language, original_language, created_at, updated_at"
    )
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[admin/books/:id] book load failed:", bookError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!book) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Author display name (best-effort; falls back to "Unknown").
  let authorName = "Unknown";
  if (book.author_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", book.author_id)
      .maybeSingle();
    const displayName =
      typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
    if (displayName) authorName = displayName;
  }

  // Language versions for this book.
  const { data: versionRows, error: versionError } = await admin
    .from("book_versions")
    .select("id, language_code, status, published_at")
    .eq("book_id", bookId)
    .order("language_code", { ascending: true });

  if (versionError) {
    console.error("[admin/books/:id] versions load failed:", versionError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const versions = versionRows ?? [];

  // Chapters across all versions of this book.
  const { data: chapterRows, error: chapterError } = await admin
    .from("chapters")
    .select("id, title, order, book_version_id, content, source_text")
    .eq("book_id", bookId)
    .order("order", { ascending: true });

  if (chapterError) {
    console.error("[admin/books/:id] chapters load failed:", chapterError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const chapters = chapterRows ?? [];
  const chapterIds = chapters.map((c) => c.id as string);

  // Per-chapter audio status: a chapter has audio if any chapter_audio_cache row
  // with a non-empty audio_path exists for it. Batch fetch, never query per-chapter.
  const chaptersWithAudio = new Set<string>();
  if (chapterIds.length > 0) {
    const { data: audioRows, error: audioError } = await admin
      .from("chapter_audio_cache")
      .select("chapter_id, audio_path")
      .in("chapter_id", chapterIds);

    if (audioError) {
      console.error("[admin/books/:id] audio cache load failed:", audioError.message);
      return apiError(E_DATABASE_ERROR, 500);
    }

    for (const row of audioRows ?? []) {
      const path = typeof row.audio_path === "string" ? row.audio_path.trim() : "";
      if (path) chaptersWithAudio.add(row.chapter_id as string);
    }
  }

  // Per-language audiobook generation status (audiobook_assets tracks status only).
  const audiobookStatusByLanguage = new Map<string, string>();
  const { data: assetRows, error: assetError } = await admin
    .from("audiobook_assets")
    .select("language, status")
    .eq("book_id", bookId);

  if (assetError) {
    console.error("[admin/books/:id] audiobook assets load failed:", assetError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  for (const row of assetRows ?? []) {
    const language = typeof row.language === "string" ? row.language.trim().toLowerCase() : "";
    const status = typeof row.status === "string" ? row.status.trim() : "";
    if (language && status) audiobookStatusByLanguage.set(language, status);
  }

  // Map version id → language code for chapter labelling.
  const languageByVersionId = new Map<string, string>(
    versions.map((v) => [v.id as string, (v.language_code as string) ?? ""])
  );
  const chapterCountByVersionId = new Map<string, number>();
  for (const c of chapters) {
    const versionId = c.book_version_id as string;
    chapterCountByVersionId.set(versionId, (chapterCountByVersionId.get(versionId) ?? 0) + 1);
  }

  const versionPayload: VersionPayload[] = versions.map((v) => {
    const languageCode = (v.language_code as string) ?? "";
    return {
      id: v.id as string,
      languageCode,
      status: (v.status as string) ?? "draft",
      publishedAt: (v.published_at as string | null) ?? null,
      chapterCount: chapterCountByVersionId.get(v.id as string) ?? 0,
      audiobookStatus: audiobookStatusByLanguage.get(languageCode.toLowerCase()) ?? null,
    };
  });

  const chapterPayload: ChapterPayload[] = chapters.map((c) => {
    const versionId = c.book_version_id as string;
    return {
      id: c.id as string,
      title: (c.title as string) ?? "",
      order: typeof c.order === "number" ? c.order : 0,
      bookVersionId: versionId,
      languageCode: languageByVersionId.get(versionId) ?? "",
      content: (c.content as string | null) ?? null,
      sourceText: (c.source_text as string | null) ?? null,
      hasAudio: chaptersWithAudio.has(c.id as string),
    };
  });

  return NextResponse.json({
    book: {
      id: book.id,
      title: book.title,
      slug: book.slug,
      description: book.description ?? null,
      coverImage: book.cover_image ?? null,
      status: book.status,
      authorId: book.author_id,
      authorName,
      language: book.language ?? book.original_language ?? null,
      createdAt: book.created_at,
      updatedAt: book.updated_at,
    },
    versions: versionPayload,
    chapters: chapterPayload,
  });
}
