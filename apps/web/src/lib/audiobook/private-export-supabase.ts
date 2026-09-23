import "server-only";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";
import { getChapterText } from "./chapter-text";
import { PRIVATE_EXPORT_LIMITS, PrivateExportError, privateContentHash, validatePrivateSnapshot } from "./private-export-contract";
import type { PrivateExportDependencies } from "./private-export-service";

const limiter = createPerUserRateLimiter({ name: "audiobook-private-export", maxPerMinute: 2 });
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const objectPath = new RegExp(`^cache/${uuid}/${uuid}-[a-f0-9]{16}\\.(mp3|wav)(\\.timing\\.json)?$`);
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

/** No clients are created until a request invokes these dependencies. All metadata uses session RLS plus explicit ownership filters. */
export function createPrivateExportDependencies(): PrivateExportDependencies {
  return {
    async authorize(signal) {
      signal.throwIfAborted();
      const { user, response } = await requireAuthorRoleForApi();
      signal.throwIfAborted();
      if (response || !user) throw new PrivateExportError(response?.status ?? 401, "AUTHOR_AUTH_REQUIRED", "Sign in with author access to export your existing audio.");
      return user.id;
    },
    async rateLimit(ownerId) { return (await limiter.check(ownerId)).allowed; },
    async snapshot(ownerId, bookId, editionId, signal) {
      signal.throwIfAborted();
      const client = await createClient();
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
        .order("order", { ascending: true }).order("id", { ascending: true }).limit(PRIVATE_EXPORT_LIMITS.chapters).abortSignal(signal);
      databaseResult(chaptersResult.error, signal);
      const rows = chaptersResult.data;
      if (!rows?.length || chaptersResult.count !== rows.length || rows.length > PRIVATE_EXPORT_LIMITS.chapters) unavailable();
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
        asset: { id: asset.id, bookId: asset.book_id, language: asset.language, status: asset.status, isSmoke: asset.is_smoke, demoRunId: asset.demo_run_id }, chapterCount: chaptersResult.count, chapters }, ownerId, bookId, editionId);
    },
    async readObject(path, maxBytes, signal) {
      signal.throwIfAborted();
      if (!objectPath.test(path) || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > PRIVATE_EXPORT_LIMITS.sourceBytes) unavailable();
      // Service calls this only after validating the owned edition, canonical paths and snapshot identity.
      // No signed/public URL or client-chosen bucket is accepted.
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const abort = () => { void reader?.cancel().catch(() => undefined); };
      try {
        const { data, error } = await createAdminClient().storage.from(getAudiobookStorageBucket())
          .download(path, {}, { signal, cache: "no-store", redirect: "error" }).asStream();
        if (error || !data) throw new PrivateExportError(503, "SOURCE_READ_FAILED", "Could not read verified existing audio. Try again shortly.");
        reader = data.getReader(); signal.addEventListener("abort", abort, { once: true });
        signal.throwIfAborted();
        const chunks: Buffer[] = []; let total = 0;
        while (true) {
          signal.throwIfAborted();
          const { value, done } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) throw new PrivateExportError(413, "SOURCE_TOO_LARGE", "Existing audio exceeds this export's source size limit.");
          chunks.push(Buffer.from(value));
        }
        if (!total) unavailable();
        return Buffer.concat(chunks, total);
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof PrivateExportError) throw error;
        console.error("[audiobook export] private source read failed");
        throw new PrivateExportError(503, "SOURCE_READ_FAILED", "Could not read verified existing audio. Try again shortly.");
      } finally {
        signal.removeEventListener("abort", abort);
        if (reader) { try { await reader.cancel(); } catch { /* Keep the original error. */ } reader.releaseLock(); }
      }
    },
  };
}
