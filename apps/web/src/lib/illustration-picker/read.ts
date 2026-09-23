import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { PICKER_PAGE_SIZE, type PickerModel, type PickerQuery } from "@/features/illustration-picker/contracts";
export class PickerError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const unavailable = () => new PickerError(404, "NOT_FOUND", "This book or edition is unavailable in your account. Choose another book.");
const failed = () => new PickerError(503, "READ_FAILED", "Could not load your illustration workspace. Please try again.");
const pattern = (text: string) => `%${text.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
const editionTitle = (language: string) => language.toUpperCase();
export async function readPicker(client: SupabaseClient<Database>, ownerId: string, query: PickerQuery): Promise<PickerModel> {
  const start = query.page * PICKER_PAGE_SIZE;
  const model: PickerModel = { stage: "books", query, book: null, edition: null, items: [], hasNext: false };
  if (!query.book) {
    let request = client.from("books").select("id,title,author_id,deleted_at").eq("author_id", ownerId).is("deleted_at", null);
    if (query.q) request = request.ilike("title", pattern(query.q));
    const { data, error } = await request.order("updated_at", { ascending: false }).order("id").range(start, start + PICKER_PAGE_SIZE);
    if (error) throw failed();
    if ((data ?? []).some((book) => book.author_id !== ownerId || book.deleted_at)) throw failed();
    return { ...model, hasNext: (data?.length ?? 0) > PICKER_PAGE_SIZE, items: (data ?? []).slice(0, PICKER_PAGE_SIZE).map((book) => ({ id: book.id, title: book.title || "Untitled book", detail: "Choose an edition" })) };
  }
  const { data: book, error: bookError } = await client.from("books").select("id,title,author_id,deleted_at").eq("id", query.book).eq("author_id", ownerId).is("deleted_at", null).maybeSingle();
  if (bookError) throw failed();
  if (!book || book.id !== query.book || book.author_id !== ownerId || book.deleted_at) throw unavailable();
  model.book = { id: book.id, title: book.title || "Untitled book" };
  if (!query.edition) {
    const { data, error } = await client.from("book_versions").select("id,book_id,language_code,created_at").eq("book_id", book.id).order("created_at", { ascending: false }).order("id").range(start, start + PICKER_PAGE_SIZE);
    if (error || (data ?? []).some((edition) => edition.book_id !== book.id)) throw failed();
    return { ...model, stage: "editions", hasNext: (data?.length ?? 0) > PICKER_PAGE_SIZE, items: (data ?? []).slice(0, PICKER_PAGE_SIZE).map((edition) => ({ id: edition.id, title: editionTitle(edition.language_code), detail: `Created ${new Date(edition.created_at).toISOString().replace("T", " ").replace("Z", " UTC")}` })) };
  }
  const { data: edition, error: editionError } = await client.from("book_versions").select("id,book_id,language_code").eq("id", query.edition).eq("book_id", book.id).maybeSingle();
  if (editionError) throw failed();
  if (!edition || edition.id !== query.edition || edition.book_id !== book.id) throw unavailable();
  model.edition = { id: edition.id, title: editionTitle(edition.language_code) };
  let request = client.from("chapters").select("id,book_id,book_version_id,title,order,deleted_at").eq("book_id", book.id).eq("book_version_id", edition.id).is("deleted_at", null);
  if (query.q) request = request.ilike("title", pattern(query.q));
  const { data, error } = await request.order("order").order("id").range(start, start + PICKER_PAGE_SIZE);
  if (error || (data ?? []).some((chapter) => chapter.book_id !== book.id || chapter.book_version_id !== edition.id || chapter.deleted_at)) throw failed();
  return { ...model, stage: "chapters", hasNext: (data?.length ?? 0) > PICKER_PAGE_SIZE, items: (data ?? []).slice(0, PICKER_PAGE_SIZE).map((chapter) => ({ id: chapter.id, title: chapter.title || "Untitled chapter", detail: "Open image candidates" })) };
}
