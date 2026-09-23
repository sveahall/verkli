import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { editionIdSchema, memoryMutationSchema } from "@/features/ai-team/memory/contracts";
import { getMemorySnapshot, memoryErrorResponse, mutateMemory, requireMemoryScope } from "@/features/ai-team/memory/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const querySchema = z.object({ bookId: z.string().uuid(), editionId: editionIdSchema });
const invalid = () => NextResponse.json({ error: "INVALID_REQUEST_BODY", message: "Choose a valid book and edition, and keep each memory between 1 and 500 characters." }, { status: 400 });

export async function GET(request: NextRequest, { params }: Context) {
  const gate = await requireAuthorRoleForApi();
  if (gate.response) return gate.response;
  const parsed = querySchema.safeParse({ bookId: (await params).id, editionId: request.nextUrl.searchParams.get("editionId") || null });
  if (!parsed.success) return invalid();
  try {
    const client = await createClient();
    const { bookId, editionId } = parsed.data;
    await requireMemoryScope(client, gate.user.id, bookId, editionId ?? null);
    return NextResponse.json(await getMemorySnapshot(client, gate.user.id, bookId, editionId ?? null));
  } catch (error) { return memoryErrorResponse(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  const gate = await requireAuthorRoleForApi();
  if (gate.response) return gate.response;
  const bookId = z.string().uuid().safeParse((await params).id);
  if (!bookId.success) return invalid();
  let raw: unknown;
  try { raw = await request.json(); } catch { return invalid(); }
  const parsed = memoryMutationSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  try {
    const client = await createClient();
    await requireMemoryScope(client, gate.user.id, bookId.data, parsed.data.editionId ?? null);
    return NextResponse.json(await mutateMemory(client, gate.user.id, bookId.data, parsed.data));
  } catch (error) { return memoryErrorResponse(error); }
}
