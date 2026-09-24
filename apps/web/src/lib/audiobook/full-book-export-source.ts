import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getChapterText } from "./chapter-text";
import { PRIVATE_EXPORT_LIMITS, PrivateExportError, privateContentHash, validatePrivateSnapshot, type PrivateExportLimits } from "./private-export-contract";

function unavailable(): never {
  throw new PrivateExportError(422, "SOURCE_UNVERIFIED", "This edition does not have complete, verifiable existing audio within the export limits. No audio was generated.");
}
function notFound(): never {
  throw new PrivateExportError(404, "EDITION_NOT_FOUND", "This edition is not available in your account.");
}
function databaseResult(error: unknown, signal: AbortSignal): void {
  signal.throwIfAborted();
  if (error) {
    console.error("[audiobook export] metadata lookup failed");
    throw new PrivateExportError(503, "SOURCE_LOOKUP_FAILED", "Could not verify existing audio. Try again shortly.");
  }
}

/** Shared snapshot query. Worker callers still supply an explicit verified owner and edition. */
export async function loadPrivateExportSnapshot(client: SupabaseClient<Database>, ownerId: string, bookId: string, editionId: string, signal: AbortSignal, limits: PrivateExportLimits = PRIVATE_EXPORT_LIMITS) {
  signal.throwIfAborted();
  const bookResult = await client.from("books").select("id, author_id, title, deleted_at, demo_run_id")
    .eq("id", bookId).eq("author_id", ownerId).is("deleted_at", null).is("demo_run_id", null).abortSignal(signal).maybeSingle();
  databaseResult(bookResult.error, signal);
  const book = bookResult.data;
  if (!book || book.id !== bookId || book.author_id !== ownerId || book.deleted_at || book.demo_run_id) notFound();
  const editionResult = await client.from("book_versions").select("id, book_id, language_code, demo_run_id")
    .eq("id", editionId).eq("book_id", bookId).is("demo_run_id", null).abortSignal(signal).maybeSingle();
  databaseResult(editionResult.error, signal);
  const edition = editionResult.data;
  if (!edition || edition.id !== editionId || edition.book_id !== bookId || edition.demo_run_id) notFound();
  const profileResult = await client.from("profiles").select("display_name").eq("user_id", ownerId).abortSignal(signal).maybeSingle();
  databaseResult(profileResult.error, signal);
  const assetResult = await client.from("audiobook_assets").select("id, book_id, language, status, is_smoke, demo_run_id")
    .eq("book_id", bookId).eq("language", edition.language_code).eq("status", "generated").eq("is_smoke", false).is("demo_run_id", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).abortSignal(signal).maybeSingle();
  databaseResult(assetResult.error, signal);
  const asset = assetResult.data;
  if (!asset || asset.book_id !== bookId || asset.language !== edition.language_code || asset.status !== "generated" || asset.is_smoke || asset.demo_run_id) unavailable();
  const chaptersResult = await client.from("chapters").select("id, book_id, book_version_id, order, title, content, deleted_at", { count: "exact" })
    .eq("book_id", bookId).eq("book_version_id", editionId).is("deleted_at", null)
    .order("order", { ascending: true }).order("id", { ascending: true }).limit(limits.chapters).abortSignal(signal);
  databaseResult(chaptersResult.error, signal);
  const rows = chaptersResult.data;
  if (!rows?.length || chaptersResult.count !== rows.length || rows.length > limits.chapters) unavailable();
  const chapters = [];
  for (const chapter of rows) {
    if (chapter.book_id !== bookId || chapter.book_version_id !== editionId || chapter.deleted_at) unavailable();
    const text = getChapterText(chapter.content);
    if (!text.trim() || text.length > 100000) unavailable();
    const contentHash = privateContentHash(text, chapter.id, editionId);
    const cacheResult = await client.from("chapter_audio_cache")
      .select("id, chapter_id, book_version_id, content_hash, voice_id, model_path, language, audio_path, file_size_bytes")
      .eq("chapter_id", chapter.id).eq("book_version_id", editionId).eq("content_hash", contentHash).eq("language", edition.language_code)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).abortSignal(signal).maybeSingle();
    databaseResult(cacheResult.error, signal);
    const cache = cacheResult.data;
    if (!cache) unavailable();
    chapters.push({ id: chapter.id, bookId: chapter.book_id, editionId: chapter.book_version_id, order: chapter.order, title: chapter.title, text,
      cache: { id: cache.id, chapterId: cache.chapter_id, editionId: cache.book_version_id, contentHash: cache.content_hash, voiceId: cache.voice_id, modelId: cache.model_path, language: cache.language, path: cache.audio_path, bytes: cache.file_size_bytes } });
  }
  return validatePrivateSnapshot({ ownerId, book: { id: book.id, authorId: book.author_id, title: book.title, deletedAt: book.deleted_at, demoRunId: book.demo_run_id },
    edition: { id: edition.id, bookId: edition.book_id, language: edition.language_code, demoRunId: edition.demo_run_id }, authorName: profileResult.data?.display_name,
    asset: { id: asset.id, bookId: asset.book_id, language: asset.language, status: asset.status, isSmoke: asset.is_smoke, demoRunId: asset.demo_run_id }, chapterCount: chaptersResult.count, chapters }, ownerId, bookId, editionId, limits);
}

