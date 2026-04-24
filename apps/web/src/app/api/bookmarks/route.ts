import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import { z } from "zod";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
  E_ALREADY_BOOKMARKED,
  E_BOOK_NOT_FOUND,
  E_BOOKMARK_ADD_FAILED,
  E_BOOKMARK_LOAD_FAILED,
  E_BOOKMARK_REMOVE_FAILED,
  E_INVALID_BOOK_ID,
} from "@/lib/api-errors";

const postBodySchema = z.object({
  bookId: z.string().uuid("Invalid book ID"),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data, error } = await supabase
    .from("bookmarks")
    .select("id, book_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[bookmarks] load failed", { message: error.message });
    return apiError(E_BOOKMARK_LOAD_FAILED, 500);
  }

  return NextResponse.json({ bookmarks: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { bookId } = parsed.data;

  const { data, error } = await supabase
    .from("bookmarks")
    .insert({ user_id: user.id, book_id: bookId })
    .select("id, book_id, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(E_ALREADY_BOOKMARKED, 409);
    }
    // 23503 = foreign_key_violation: the referenced book was already deleted
    // (or never existed). Returning 500 here was misleading — the client
    // should show a "book not found" message, not a generic error.
    if (error.code === "23503") {
      return apiError(E_BOOK_NOT_FOUND, 404);
    }
    console.error("[bookmarks] add failed", { message: error.message });
    return apiError(E_BOOKMARK_ADD_FAILED, 500);
  }

  await logAnalyticsEvent(supabase, {
    eventType: "bookmark_added",
    userId: user.id,
    bookId,
    path: "/reader/bookmarks",
    props: { book_id: bookId },
  });

  return NextResponse.json(data, { status: 200 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("bookId");

  if (!bookId || !z.string().uuid().safeParse(bookId).success) {
    return apiError(E_INVALID_BOOK_ID, 400);
  }

  const { data: deleted, error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[bookmarks] remove failed", { message: error.message });
    return apiError(E_BOOKMARK_REMOVE_FAILED, 500);
  }

  if (deleted) {
    await logAnalyticsEvent(supabase, {
      eventType: "bookmark_removed",
      userId: user.id,
      bookId,
      path: "/reader/bookmarks",
      props: { book_id: bookId },
    });
  }

  return NextResponse.json({ ok: true });
}
