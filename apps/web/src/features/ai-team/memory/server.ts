import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildConversationHistory } from "@/features/ai-team/actions/conversation-history";
import type { AgentAction, AssistantTool } from "@/lib/ai/agent-actions";
import { MAX_MEMORIES, type ConversationSnapshot, type Memory, type MemorySnapshot, type SavedMessage, type SavedThread, type memoryMutationSchema } from "./contracts";

type Client = SupabaseClient<Database>;
export class AiMemoryError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}

function check(error: { code?: string } | null) {
  if (!error) return;
  // Database messages can include private values. Only codes enter server logs.
  console.warn("[ai memory] database operation failed", { code: error.code ?? "unknown" });
  if (error.code === "23514") throw new AiMemoryError("AI_MEMORY_LIMIT", 400, "The memory limit was reached or the memory scope cannot change. Keep each memory under 500 characters and at most 24 applicable memories.");
  if (error.code === "42501") throw new AiMemoryError("AI_MEMORY_FORBIDDEN", 403, "This AI conversation or memory is not available to your account.");
  throw new AiMemoryError("AI_MEMORY_UNAVAILABLE", 503, "Saved AI conversations and memories are unavailable. Your message has not been sent. Try again later or explicitly choose a temporary conversation.");
}
export function memoryErrorResponse(error: unknown) {
  const known = error instanceof AiMemoryError ? error : new AiMemoryError("AI_MEMORY_UNAVAILABLE", 503, "Saved AI conversations and memories are unavailable. Please try again later.");
  console.warn("[ai memory] request failed", { code: known.code, status: known.status });
  return Response.json({ error: known.code, message: known.message }, { status: known.status });
}

export async function requireMemoryScope(client: Client, ownerId: string, bookId: string, editionId: string | null) {
  const { data: book, error } = await client.from("books").select("author_id, deleted_at").eq("id", bookId).maybeSingle();
  check(error);
  if (!book || book.deleted_at) throw new AiMemoryError("BOOK_NOT_FOUND", 404, "This book is unavailable.");
  if (book.author_id !== ownerId) throw new AiMemoryError("FORBIDDEN", 403, "This book does not belong to your account.");
  await requireEditionScope(client, bookId, editionId);
}
export async function requireEditionScope(client: Client, bookId: string, editionId: string | null) {
  if (!editionId) return;
  const { data, error } = await client.from("book_versions").select("id").eq("id", editionId).eq("book_id", bookId).maybeSingle();
  check(error);
  if (!data) throw new AiMemoryError("AI_EDITION_NOT_FOUND", 404, "This edition is not available in this book.");
}
async function memoryEnabled(client: Client, ownerId: string) {
  const { data, error } = await client.from("ai_memory_settings").select("enabled").eq("owner_id", ownerId).maybeSingle();
  check(error);
  return data?.enabled ?? true;
}
function memoryFilter(bookId: string, editionId: string | null) {
  return `scope.eq.author,and(scope.eq.book,book_id.eq.${bookId})${editionId ? `,and(scope.eq.edition,book_id.eq.${bookId},edition_id.eq.${editionId})` : ""}`;
}
async function applicableMemories(client: Client, ownerId: string, bookId: string, editionId: string | null): Promise<Memory[]> {
  const { data, error } = await client.from("ai_memories").select("id,content,scope,updated_at").eq("owner_id", ownerId)
    .or(memoryFilter(bookId, editionId)).order("updated_at", { ascending: false }).order("id").limit(MAX_MEMORIES);
  check(error);
  return (data ?? []).map((row) => ({ id: row.id, content: row.content, scope: row.scope as Memory["scope"], updatedAt: row.updated_at }));
}
export async function getMemorySnapshot(client: Client, ownerId: string, bookId: string, editionId: string | null): Promise<MemorySnapshot> {
  const enabled = await memoryEnabled(client, ownerId);
  return { enabled, memories: await applicableMemories(client, ownerId, bookId, editionId) };
}
export async function getPreferences(client: Client, ownerId: string, bookId: string, editionId: string | null): Promise<Memory[]> {
  if (!(await memoryEnabled(client, ownerId))) return [];
  return applicableMemories(client, ownerId, bookId, editionId);
}
export async function mutateMemory(client: Client, ownerId: string, bookId: string, body: z.infer<typeof memoryMutationSchema>) {
  const editionId = body.editionId ?? null;
  if (body.operation === "settings") {
    const { error } = await client.from("ai_memory_settings").upsert({ owner_id: ownerId, enabled: body.enabled }, { onConflict: "owner_id" });
    check(error);
  } else if (body.operation === "delete") {
    const { data, error } = await client.from("ai_memories").delete().eq("id", body.id).eq("owner_id", ownerId).or(memoryFilter(bookId, editionId)).select("id").maybeSingle();
    check(error);
    if (!data) throw new AiMemoryError("AI_MEMORY_NOT_FOUND", 404, "This memory is no longer available.");
  } else if (body.id) {
    let query = client.from("ai_memories").update({ content: body.content }).eq("id", body.id).eq("owner_id", ownerId).eq("scope", body.scope);
    query = body.scope === "author" ? query.is("book_id", null) : query.eq("book_id", bookId);
    query = body.scope === "edition" ? query.eq("edition_id", editionId!) : query.is("edition_id", null);
    const { data, error } = await query.select("id").maybeSingle();
    check(error);
    if (!data) throw new AiMemoryError("AI_MEMORY_NOT_FOUND", 404, "This memory is no longer available in its original scope. Refresh and try again.");
  } else {
    const { error } = await client.from("ai_memories").insert({ owner_id: ownerId, content: body.content, scope: body.scope, book_id: body.scope === "author" ? null : bookId, edition_id: body.scope === "edition" ? editionId : null });
    check(error);
  }
  return getMemorySnapshot(client, ownerId, bookId, editionId);
}
const threadDto = (row: { id: string; title: string; updated_at: string }): SavedThread => ({ id: row.id, title: row.title, updatedAt: row.updated_at });
const messageDto = (row: { id: string; role: string; content: string; created_at: string }): SavedMessage => ({ id: row.id, role: row.role as SavedMessage["role"], content: row.content, createdAt: row.created_at });
export async function getConversationSnapshot(client: Client, ownerId: string, bookId: string, tool: AssistantTool, editionId: string | null, threadId?: string): Promise<ConversationSnapshot> {
  let query = client.from("ai_threads").select("id,title,updated_at").eq("owner_id", ownerId).eq("book_id", bookId).eq("tool", tool).is("deleted_at", null);
  query = editionId ? query.eq("edition_id", editionId) : query.is("edition_id", null);
  const { data, error } = await query.order("updated_at", { ascending: false }).order("id").limit(20);
  check(error);
  const threads = (data ?? []).map(threadDto);
  let thread = threadId ? threads.find((item) => item.id === threadId) ?? null : threads[0] ?? null;
  if (threadId && !thread) {
    let selected = client.from("ai_threads").select("id,title,updated_at").eq("id", threadId).eq("owner_id", ownerId).eq("book_id", bookId).eq("tool", tool).is("deleted_at", null);
    selected = editionId ? selected.eq("edition_id", editionId) : selected.is("edition_id", null);
    const result = await selected.maybeSingle(); check(result.error);
    if (!result.data) throw new AiMemoryError("AI_CONVERSATION_NOT_FOUND", 404, "This conversation is no longer available in this tool and edition.");
    thread = threadDto(result.data);
  }
  if (!thread) return { threads, thread: null, messages: [] };
  const messages = await loadHistory(client, ownerId, thread.id, 50);
  return { threads, thread, messages };
}
export async function loadHistory(client: Client, ownerId: string, threadId: string, limit = 12): Promise<SavedMessage[]> {
  const { data, error } = await client.from("ai_messages").select("id,role,content,created_at").eq("thread_id", threadId).eq("owner_id", ownerId).eq("state", "completed").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  check(error);
  return (data ?? []).reverse().map(messageDto);
}
export async function createConversation(client: Client, ownerId: string, bookId: string, tool: AssistantTool, editionId: string | null) {
  const { data, error } = await client.from("ai_threads").insert({ owner_id: ownerId, book_id: bookId, edition_id: editionId, tool }).select("id,title,updated_at").single();
  check(error);
  if (!data) throw new AiMemoryError("AI_MEMORY_UNAVAILABLE", 503, "The conversation could not be created. Please try again.");
  return threadDto(data);
}
export async function deleteConversation(client: Client, bookId: string, threadId: string) {
  const { data, error } = await client.rpc("ai_delete_thread", { p_book_id: bookId, p_thread_id: threadId });
  check(error);
  if (data !== true) throw new AiMemoryError("AI_CONVERSATION_NOT_FOUND", 404, "This conversation is no longer available.");
}
export type Reservation = { status: "reserved" | "completed"; threadId: string; replyId: string; content?: string };
export async function reserveTurn(client: Client, input: { bookId: string; editionId: string | null; tool: AssistantTool; threadId?: string; requestId: string; message: string }): Promise<Reservation> {
  const { data, error } = await client.rpc("ai_reserve_request", { p_book_id: input.bookId, p_edition_id: input.editionId ?? undefined, p_tool: input.tool, p_thread_id: input.threadId, p_request_id: input.requestId, p_content: input.message });
  check(error);
  const result = data as unknown as Reservation | { status: string };
  if (result?.status === "pending") throw new AiMemoryError("AI_CONVERSATION_PENDING", 409, "A reply is already being generated or could not be saved. Refresh this conversation before sending another message. You can start a new conversation if it remains unavailable.");
  if (result?.status === "conflict") throw new AiMemoryError("AI_REQUEST_CONFLICT", 409, "This request identifier belongs to another message or conversation.");
  if (result?.status === "interrupted") throw new AiMemoryError("AI_CONVERSATION_INTERRUPTED", 409, "This reply was interrupted and will not be sent again automatically. Send a new message to continue.");
  if (result?.status === "deleted" || result?.status === "not_found") throw new AiMemoryError("AI_CONVERSATION_NOT_FOUND", 404, "This conversation is no longer available in this tool and edition.");
  if (result?.status !== "reserved" && result?.status !== "completed") throw new AiMemoryError("AI_MEMORY_UNAVAILABLE", 503, "The conversation could not be reserved. Your message has not been sent.");
  return result as Reservation;
}
export async function completeTurn(client: Client, threadId: string, requestId: string, content: string, actions: AgentAction[] = []): Promise<boolean> {
  let label = actions.length ? "[Historical suggestion — no action execution is recorded.]\n" : "";
  // Keep concrete proposals for follow-ups, without trusting client outcomes or
  // storing executable actions. Include the label in the existing reply limit.
  const history = buildConversationHistory([{ role: "assistant", content, actions }])[0].content;
  const shortened = content.length > (actions.length ? 900 : 4000)
    || actions.some((action) => Object.values(action).some((value) => typeof value === "string" && value.length > 750))
    || label.length + history.length > 4000;
  if (shortened) label += "[Saved context shortened: some reply or proposal text was omitted.]\n";
  const { data, error } = await client.rpc("ai_complete_request", { p_thread_id: threadId, p_request_id: requestId, p_content: `${label}${history}`.slice(0, 4000) });
  if (error) { console.warn("[ai memory] reply persistence failed", { code: error.code }); return false; }
  return (data as { status?: string } | null)?.status === "completed";
}
