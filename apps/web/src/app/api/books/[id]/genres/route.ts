import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_NOT_AUTHENTICATED, E_BOOK_NOT_FOUND, E_DATABASE_ERROR, E_INVALID_JSON, E_VALIDATION_FAILED } from "@/lib/api-errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("book_genres")
    .select("genre_id")
    .eq("book_id", bookId);

  if (error) {
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({ genreIds: (data ?? []).map((d) => d.genre_id) });
}

const putSchema = z.object({
  genreIds: z.array(z.string().uuid()).max(3),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  // Verify ownership
  const { data: book } = await supabase
    .from("books")
    .select("author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (!book) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  if (book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { genreIds } = parsed.data;

  // Upsert new genres first, then remove stale ones (safe against partial failure)
  if (genreIds.length > 0) {
    const rows = genreIds.map((genreId) => ({
      book_id: bookId,
      genre_id: genreId,
    }));

    const { error: upsertError } = await supabase
      .from("book_genres")
      .upsert(rows, { onConflict: "book_id,genre_id" });

    if (upsertError) {
      return apiError(E_DATABASE_ERROR, 500);
    }

    // Remove genres no longer selected
    const { error: deleteError } = await supabase
      .from("book_genres")
      .delete()
      .eq("book_id", bookId)
      .not("genre_id", "in", `(${genreIds.join(",")})`);

    if (deleteError) {
      return apiError(E_DATABASE_ERROR, 500);
    }
  } else {
    // Clear all genres
    const { error: deleteError } = await supabase
      .from("book_genres")
      .delete()
      .eq("book_id", bookId);

    if (deleteError) {
      return apiError(E_DATABASE_ERROR, 500);
    }
  }

  return NextResponse.json({ ok: true });
}
