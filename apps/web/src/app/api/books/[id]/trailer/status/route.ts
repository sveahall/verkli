import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_UNAUTHORIZED,
} from "@/lib/api-errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  if (!user) return apiError(E_UNAUTHORIZED, 401);

  const { id: bookId } = await params;
  if (!UUID_RE.test(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  // Books SELECT RLS allows author + visibility checks; the explicit
  // `.eq("author_id", user.id)` filter still scopes the result to the
  // owner, but RLS now provides defense-in-depth.
  const supabase = await createClient();
  const { data: book, error } = await supabase
    .from("books")
    .select("trailer_url, trailer_status")
    .eq("id", bookId)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[trailer status] fetch failed:", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!book) return apiError(E_BOOK_NOT_FOUND, 404);

  return NextResponse.json({
    status: (book as { trailer_status: string | null }).trailer_status,
    url: (book as { trailer_url: string | null }).trailer_url,
  });
}
