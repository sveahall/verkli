import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
  E_HIGHLIGHT_NOT_FOUND,
  E_HIGHLIGHT_UPDATE_FAILED,
  E_HIGHLIGHT_DELETE_FAILED,
} from "@/lib/api-errors";

const updateHighlightSchema = z.object({
  color: z.enum(["yellow", "green", "blue", "rose", "purple"]).optional(),
  note: z.string().max(5000).nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: highlightId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = updateHighlightSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.note !== undefined) updates.note = parsed.data.note;

  if (Object.keys(updates).length === 0) {
    return apiError(E_VALIDATION_FAILED, 400, { detail: "No fields to update" });
  }

  const { data: row, error } = await supabase
    .from("highlights")
    .update(updates)
    .eq("id", highlightId)
    .eq("user_id", user.id)
    .select("id, chapter_id, book_id, book_version_id, start_offset, end_offset, snippet, color, note, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[highlights] update failed", {
      userId: user.id,
      highlightId,
      message: error.message,
    });
    return apiError(E_HIGHLIGHT_UPDATE_FAILED, 500);
  }

  if (!row) {
    return apiError(E_HIGHLIGHT_NOT_FOUND, 404);
  }

  return NextResponse.json({ ok: true, highlight: row });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: highlightId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  // RLS already restricts to own highlights, but verify to return proper 404
  const { data: existing, error: lookupError } = await supabase
    .from("highlights")
    .select("id")
    .eq("id", highlightId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("[highlights] lookup failed", {
      userId: user.id,
      highlightId,
      message: lookupError.message,
    });
    return apiError(E_HIGHLIGHT_DELETE_FAILED, 500);
  }

  if (!existing) {
    return apiError(E_HIGHLIGHT_NOT_FOUND, 404);
  }

  const { error } = await supabase
    .from("highlights")
    .delete()
    .eq("id", highlightId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[highlights] delete failed", {
      userId: user.id,
      highlightId,
      message: error.message,
    });
    return apiError(E_HIGHLIGHT_DELETE_FAILED, 500);
  }

  return NextResponse.json({ ok: true });
}
