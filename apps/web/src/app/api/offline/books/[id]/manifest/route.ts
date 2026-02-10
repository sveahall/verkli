import { NextResponse } from "next/server";
import { apiError, E_OFFLINE_MANIFEST_LOAD_FAILED } from "@/lib/api-errors";
import { buildChapterContentHash, sha256Hex } from "@/lib/offline/hash";
import { requireOfflineBookAccess } from "@/lib/offline/server";
import type { OfflineManifestResponse } from "@/lib/offline/types";

type ChapterRow = {
  id: string;
  title: string;
  order: number;
  content: string | null;
  updated_at: string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const requestedLanguage = new URL(request.url).searchParams.get("lang");

  const access = await requireOfflineBookAccess({
    bookId: id,
    requestedLanguage,
  });
  if (!access.ok) {
    return access.response;
  }

  const { supabase, userId, book, activeVersion, activeLanguageCode } = access.context;

  const { data: chapters, error: chaptersError } = await supabase
    .from("chapters")
    .select("id, title, order, content, updated_at")
    .eq("book_version_id", activeVersion.id)
    .order("order", { ascending: true });

  if (chaptersError) {
    console.error("[offline.manifest] chapters lookup failed", {
      userId,
      bookId: book.id,
      versionId: activeVersion.id,
      code: chaptersError.code,
      message: chaptersError.message,
    });
    return apiError(E_OFFLINE_MANIFEST_LOAD_FAILED, 500);
  }

  const chapterRows = (chapters ?? []) as ChapterRow[];
  const manifestChapters = await Promise.all(
    chapterRows.map(async (chapter) => {
      const contentHash = await buildChapterContentHash({
        title: chapter.title,
        content: chapter.content,
      });

      return {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        contentHash,
        readerUrl: `/reader/read/${chapter.id}`,
      };
    })
  );

  const manifestHash = await sha256Hex(
    `${book.id}|${activeVersion.id}|${manifestChapters.map((ch) => `${ch.id}:${ch.contentHash}`).join("|")}`
  );

  const chapterHashes = Object.fromEntries(
    manifestChapters.map((chapter) => [chapter.id, chapter.contentHash])
  ) as Record<string, string>;
  const chapterUrls = manifestChapters.map((chapter) => chapter.readerUrl);
  const bookUrl = `/reader/books/${book.id}?lang=${activeLanguageCode}`;
  const timestamp = new Date().toISOString();

  const { error: upsertError } = await supabase
    .from("offline_manifests" as never)
    .upsert(
      {
        user_id: userId,
        book_id: book.id,
        book_version_id: activeVersion.id,
        language_code: activeLanguageCode,
        manifest_hash: manifestHash,
        chapter_count: manifestChapters.length,
        chapter_hashes: chapterHashes,
        chapter_urls: chapterUrls,
        book_url: bookUrl,
        last_synced_at: timestamp,
        updated_at: timestamp,
      } as never,
      { onConflict: "user_id,book_id,book_version_id" }
    );

  if (upsertError) {
    console.error("[offline.manifest] offline_manifests upsert failed", {
      userId,
      bookId: book.id,
      versionId: activeVersion.id,
      code: upsertError.code,
      message: upsertError.message,
    });
    return apiError(E_OFFLINE_MANIFEST_LOAD_FAILED, 500);
  }

  const payload: OfflineManifestResponse = {
    bookId: book.id,
    bookVersionId: activeVersion.id,
    languageCode: activeLanguageCode,
    manifestHash,
    generatedAt: timestamp,
    chapterBatchUrl: `/api/offline/books/${book.id}/chapters`,
    bookUrl,
    chapters: manifestChapters,
  };

  return NextResponse.json(payload);
}
