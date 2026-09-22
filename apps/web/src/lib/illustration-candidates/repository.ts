import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { CandidateError, MAX_IMAGE_BYTES, type CandidatePorts } from "./service";

const columns = "id,book_id,user_id,content_type,channel,version,status,visibility,config,metadata,created_at";
function databaseError() { return new CandidateError(503, "DATABASE_UNAVAILABLE", "Could not verify or save this candidate. Keep your proposal and retry with the same request."); }

// Created only after author authentication. Storage is used only after scope and readiness checks.
export async function createCandidatePorts(): Promise<CandidatePorts> {
  const client = await createClient();
  let admin: ReturnType<typeof createAdminClient> | undefined;
  const privileged = () => admin ??= createAdminClient();
  return {
    async authorize(ownerId, key) {
      const { data: book, error: bookError } = await client.from("books").select("id,author_id,deleted_at").eq("id", key.bookId).eq("author_id", ownerId).is("deleted_at", null).maybeSingle();
      if (bookError) throw databaseError();
      if (!book || book.id !== key.bookId || book.author_id !== ownerId || book.deleted_at) return null;
      const { data: edition, error: editionError } = await client.from("book_versions").select("id,book_id").eq("id", key.editionId).eq("book_id", book.id).maybeSingle();
      if (editionError) throw databaseError();
      if (!edition || edition.id !== key.editionId || edition.book_id !== book.id) return null;
      const { data: chapter, error: chapterError } = await client.from("chapters").select("id,book_id,book_version_id,version_number,title,deleted_at").eq("id", key.chapterId).eq("book_id", book.id).eq("book_version_id", edition.id).is("deleted_at", null).maybeSingle();
      if (chapterError) throw databaseError();
      if (!chapter || chapter.id !== key.chapterId || chapter.book_id !== book.id || chapter.book_version_id !== edition.id || chapter.deleted_at) return null;
      if (!Number.isInteger(chapter.version_number) || chapter.version_number < 0) throw databaseError();
      return { ...key, ownerId, chapterVersion: chapter.version_number, chapterTitle: chapter.title };
    },
    async ready() {
      try {
        // Read-only capability checks. Missing schema, unknown bucket or public storage fails closed.
        const { error } = await privileged().from("content_assets").select(columns).limit(0);
        if (error) return false;
        const bucket = await privileged().storage.getBucket("content-assets");
        return !bucket.error && bucket.data?.id === "content-assets" && bucket.data.public === false;
      } catch { return false; }
    },
    async find(scope, id) {
      const { data, error } = await privileged().from("content_assets").select(columns).eq("id", id).eq("book_id", scope.bookId).eq("user_id", scope.ownerId).maybeSingle();
      if (error) throw databaseError();
      return data;
    },
    async list(scope) {
      const { data, error } = await privileged().from("content_assets").select(columns)
        .eq("book_id", scope.bookId).eq("user_id", scope.ownerId).eq("content_type", "image").eq("channel", "generic").eq("visibility", "private").eq("status", "completed")
        .eq("config->>feature", "chapter_illustration").eq("config->>contractVersion", "1").eq("config->>editionId", scope.editionId).eq("config->>chapterId", scope.chapterId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(25);
      if (error) throw databaseError();
      return data ?? [];
    },
    async nextVersion(scope) {
      const { data, error } = await privileged().from("content_assets").select("version").eq("book_id", scope.bookId).eq("content_type", "image").eq("channel", "generic").order("version", { ascending: false }).limit(1);
      if (error) throw databaseError();
      return (data?.[0]?.version ?? 0) + 1;
    },
    async reserve(row) {
      const { data, error } = await privileged().from("content_assets").insert({ ...row, config: row.config as Json, metadata: row.metadata as Json, asset_url: null }).select(columns).maybeSingle();
      if (error?.code === "23505") return null; // Bounded retry also reconciles a concurrent identical ID.
      if (error) throw databaseError();
      return data;
    },
    async complete(scope, id, intentHash) {
      const { data, error } = await privileged().from("content_assets").update({ status: "completed" }).eq("id", id).eq("book_id", scope.bookId).eq("user_id", scope.ownerId).eq("status", "pending").eq("metadata->>intentHash", intentHash).select(columns).maybeSingle();
      if (error) throw databaseError();
      return data;
    },
    async upload(path, bytes, mime) {
      const { error } = await privileged().storage.from("content-assets").upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
      if (error) throw databaseError();
    },
    async download(path) {
      const { data, error } = await privileged().storage.from("content-assets").download(path);
      if (error || !data || data.size > MAX_IMAGE_BYTES) return null;
      return Buffer.from(await data.arrayBuffer());
    },
  };
}
