import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { assistantToolSchema } from "@/lib/ai/agent-actions";
import { conversationMutationSchema, editionIdSchema } from "@/features/ai-team/memory/contracts";
import { createConversation, deleteConversation, getConversationSnapshot, memoryErrorResponse, requireMemoryScope } from "@/features/ai-team/memory/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const querySchema = z.object({ bookId: z.string().uuid(), editionId: editionIdSchema, tool: assistantToolSchema, threadId: z.string().uuid().optional() });
const invalid = () => NextResponse.json({ error: "INVALID_REQUEST_BODY", message: "Choose a valid book, edition, assistant and conversation." }, { status: 400 });

export async function GET(request: NextRequest, { params }: Context) {
  const gate = await requireAuthorRoleForApi();
  if (gate.response) return gate.response;
  const search = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({ bookId: (await params).id, editionId: search.get("editionId") || null, tool: search.get("tool") || "edit", threadId: search.get("threadId") || undefined });
  if (!parsed.success) return invalid();
  try {
    const client = await createClient();
    const { bookId, editionId, tool, threadId } = parsed.data;
    await requireMemoryScope(client, gate.user.id, bookId, editionId ?? null);
    return NextResponse.json(await getConversationSnapshot(client, gate.user.id, bookId, tool, editionId ?? null, threadId));
  } catch (error) { return memoryErrorResponse(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  const gate = await requireAuthorRoleForApi();
  if (gate.response) return gate.response;
  const bookId = z.string().uuid().safeParse((await params).id);
  if (!bookId.success) return invalid();
  let raw: unknown;
  try { raw = await request.json(); } catch { return invalid(); }
  const parsed = conversationMutationSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  try {
    const client = await createClient();
    const body = parsed.data;
    await requireMemoryScope(client, gate.user.id, bookId.data, body.operation === "create" ? body.editionId ?? null : null);
    if (body.operation === "create") return NextResponse.json({ thread: await createConversation(client, gate.user.id, bookId.data, body.tool, body.editionId ?? null) });
    await deleteConversation(client, bookId.data, body.threadId);
    return NextResponse.json({ deleted: true });
  } catch (error) { return memoryErrorResponse(error); }
}
