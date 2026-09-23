import { apiError } from "@/lib/api-errors";
import { createClient } from "@/lib/supabase/server";
import { readAdDraftConfig, savedAdDraftSchema } from "./ad-draft";
export type AdDraftRow = { id: string; book_id: string; updated_at: string; paid_config: unknown };
export const AD_DRAFT_COLUMNS = "id, book_id, updated_at, paid_config";
export function savedAdDraft(row: AdDraftRow) {
  const draft = readAdDraftConfig(row.paid_config);
  const parsed = savedAdDraftSchema.safeParse({ id: row.id, bookId: row.book_id, updatedAt: row.updated_at, draft });
  return parsed.success ? parsed.data : null;
}
export function adDraftFailure(reason: string, error?: { code?: string } | null) {
  console.error("[ad drafts] operation failed", { reason, code: error?.code });
  return apiError("AD_DRAFT_STORAGE_FAILED", 500);
}
export async function readAdDraftBody(request: Request): Promise<unknown> {
  try { const text = await request.text(); return text.length <= 16_000 ? JSON.parse(text) : null; } catch { return null; }
}
export async function checkAdDraftBook(client: Awaited<ReturnType<typeof createClient>>, authorId: string, bookId: string) {
  const { data, error } = await client.from("books").select("id").eq("id", bookId).eq("author_id", authorId).maybeSingle();
  if (error) return adDraftFailure("book lookup", error);
  return data ? null : apiError("BOOK_NOT_FOUND", 404);
}
