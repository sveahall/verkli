import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getReadAccess } from "@/lib/books/access";
import { extractTextFromTiptapNode } from "@/lib/tiptap-content";
import { intentSchema, scopeKeySchema, type CandidateScopeKey } from "@/features/illustration-candidates/contracts";
import { hasAnyCandidateImage, hasCandidateImage } from "@/features/illustration-candidates/media-reference";
import { CandidateError, CandidateService, type Scope } from "./service";
import { createCandidatePorts } from "./repository";
import { candidateFailure, privateHeaders } from "./http";

const missing = () => new CandidateError(404, "NOT_FOUND", "This chapter illustration is unavailable.");
const databaseError = () => new CandidateError(503, "DATABASE_UNAVAILABLE", "Could not verify access to this chapter illustration. Please retry.");
type ReaderImageContext = { params: Promise<{ id: string; editionId: string; chapterId: string; assetId: string }> };

// Match ReaderReadPage's choice between structured content and source_text.
function hasReadableContent(content: unknown, scope: CandidateScopeKey): boolean {
  if (hasAnyCandidateImage(content, scope)) return true;
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) return false;
    try { return extractTextFromTiptapNode(JSON.parse(trimmed)).replace(/\s+/g, " ").trim().length > 0; }
    catch { return trimmed.length > 0; }
  }
  return Boolean(content && typeof content === "object" && extractTextFromTiptapNode(content).replace(/\s+/g, " ").trim().length > 0);
}

export async function readerCandidateImage(_request: Request, context: ReaderImageContext) {
  try {
    const params = await context.params;
    const parsed = scopeKeySchema.safeParse({ bookId: params.id, editionId: params.editionId, chapterId: params.chapterId });
    const asset = intentSchema.shape.requestId.safeParse(params.assetId);
    if (!parsed.success || !asset.success) throw missing();
    const key = parsed.data;
    const assetId = asset.data;
    const client = await createClient();
    let requestUserId: string | null | undefined;

    async function readScope(): Promise<Scope | null> {
      // Re-check the authenticated identity on every authorization, including after download.
      // Anonymous readers still have the same published free/preview access as ReaderReadPage.
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError && !(authError.name === "AuthSessionMissingError" && !user)) return null;
      const userId = user?.id ?? null;
      if (requestUserId !== undefined && requestUserId !== userId) return null;
      requestUserId = userId;

      // These reads use the request's session and RLS, never the storage admin client.
      const { data: chapter, error: chapterError } = await client.from("chapters")
        .select("id,title,book_id,book_version_id,version_number,deleted_at,content,source_text")
        .eq("id", key.chapterId).eq("book_id", key.bookId).eq("book_version_id", key.editionId).is("deleted_at", null).maybeSingle();
      if (chapterError) throw databaseError();
      if (!chapter || chapter.id !== key.chapterId || chapter.book_id !== key.bookId || chapter.book_version_id !== key.editionId || chapter.deleted_at) return null;
      const { data: book, error: bookError } = await client.from("books")
        .select("id,author_id,status,price_amount,pricing_model,deleted_at")
        .eq("id", key.bookId).is("deleted_at", null).maybeSingle();
      if (bookError) throw databaseError();
      if (!book || book.id !== key.bookId || !book.author_id || book.deleted_at) return null;
      const { data: edition, error: editionError } = await client.from("book_versions")
        .select("id,book_id").eq("id", key.editionId).eq("book_id", book.id).maybeSingle();
      if (editionError) throw databaseError();
      if (!edition || edition.id !== key.editionId || edition.book_id !== book.id) return null;

      const readAccess = await getReadAccess({
        supabase: client, userId, bookId: book.id, chapterId: chapter.id,
        bookVersionId: chapter.book_version_id, bookAuthorId: book.author_id,
        bookPriceAmount: Math.max(0, Math.trunc(Number(book.price_amount ?? 0))),
        bookPricingModel: String(book.pricing_model ?? "book_only"),
      });
      const isAuthorView = Boolean(userId && book.author_id === userId);
      const hasPaidEntitlement = readAccess.access === "full" && (readAccess.reason === "purchased" || readAccess.reason === "plus");
      if (book.status !== "PUBLISHED" && !isAuthorView && !hasPaidEntitlement) return null;
      if (readAccess.access === "locked") return null;
      const content = hasReadableContent(chapter.content, key) ? chapter.content : chapter.source_text;
      if (!hasCandidateImage(content, key, assetId)) return null;
      if (!Number.isSafeInteger(chapter.version_number) || chapter.version_number < 0) throw databaseError();
      return { ...key, ownerId: book.author_id, chapterVersion: chapter.version_number, chapterTitle: chapter.title };
    }

    const initial = await readScope();
    if (!initial) throw missing();
    const ports = await createCandidatePorts();
    // This guarded instance exposes only image(); the author routes keep their own authorization.
    const candidates = new CandidateService({ ...ports, authorize: async (ownerId) => {
      const current = await readScope();
      return current?.ownerId === ownerId ? current : null;
    } }, initial.ownerId, key);
    const { bytes, mime } = await candidates.image(assetId);
    return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": mime, "Content-Length": String(bytes.length) } });
  } catch (error) { return candidateFailure(error); }
}
