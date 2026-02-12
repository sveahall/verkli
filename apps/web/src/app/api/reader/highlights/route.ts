import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
  E_HIGHLIGHT_LOAD_FAILED,
  E_HIGHLIGHT_CREATE_FAILED,
  E_HIGHLIGHT_DUPLICATE,
} from "@/lib/api-errors";

const createHighlightSchema = z.object({
  chapter_id: z.string().uuid(),
  book_id: z.string().uuid().optional(),
  book_version_id: z.string().uuid().optional(),
  start_offset: z.number().int().min(0),
  end_offset: z.number().int().min(1),
  color: z.enum(["yellow", "green", "blue", "rose", "purple"]).default("yellow"),
  snippet: z.string().min(1).max(1000),
  note: z.string().max(5000).optional(),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const url = new URL(request.url);
  const chapterId = url.searchParams.get("chapter_id");

  if (!chapterId) {
    return apiError(E_VALIDATION_FAILED, 400, { detail: "chapter_id query param required" });
  }

  const { data: rows, error } = await supabase
    .from("highlights")
    .select("id, chapter_id, book_id, book_version_id, start_offset, end_offset, snippet, color, note, created_at, updated_at")
    .eq("chapter_id", chapterId)
    .eq("user_id", user.id)
    .order("start_offset", { ascending: true });

  if (error) {
    console.error("[highlights] list failed", {
      userId: user.id,
      chapterId,
      message: error.message,
    });
    return apiError(E_HIGHLIGHT_LOAD_FAILED, 500);
  }

  return NextResponse.json({ highlights: rows ?? [] });
}

export async function POST(request: Request) {
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

  const parsed = createHighlightSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { chapter_id, start_offset, end_offset, color, snippet, note } = parsed.data;

  if (end_offset <= start_offset) {
    return apiError(E_VALIDATION_FAILED, 400, { detail: "end_offset must be greater than start_offset" });
  }

  // Resolve book_id and book_version_id from chapter if not provided
  let bookId = parsed.data.book_id;
  let bookVersionId = parsed.data.book_version_id;

  if (!bookId || !bookVersionId) {
    const { data: chapter } = await supabase
      .from("chapters")
      .select("book_id, book_version_id")
      .eq("id", chapter_id)
      .maybeSingle();

    if (chapter) {
      bookId = bookId ?? (chapter.book_id as string);
      bookVersionId = bookVersionId ?? (chapter.book_version_id as string);
    }
  }

  if (!bookId || !bookVersionId) {
    return apiError(E_VALIDATION_FAILED, 400, { detail: "Could not resolve book_id or book_version_id" });
  }

  const { data: row, error: insertError } = await supabase
    .from("highlights")
    .insert({
      user_id: user.id,
      book_id: bookId,
      book_version_id: bookVersionId,
      chapter_id,
      start_offset,
      end_offset,
      snippet,
      color,
      note: note ?? null,
    })
    .select("id, chapter_id, book_id, book_version_id, start_offset, end_offset, snippet, color, note, created_at, updated_at")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      return apiError(E_HIGHLIGHT_DUPLICATE, 409);
    }
    console.error("[highlights] create failed", {
      userId: user.id,
      chapterId: chapter_id,
      message: insertError.message,
      code: insertError.code,
    });
    return apiError(E_HIGHLIGHT_CREATE_FAILED, 500);
  }

  return NextResponse.json({ ok: true, highlight: row });
}
