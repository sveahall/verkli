import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_BOOK_NOT_FOUND,
  E_TRANSLATION_LIST_FAILED,
} from "@/lib/api-errors";

export async function GET(
  _request: Request,
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

  // Verify book ownership
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError || !book) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  if (book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Fetch all book versions (each version = a language)
  const { data: versions, error: versionsError } = await supabase
    .from("book_versions")
    .select("id, book_id, language_code, status, published_at, created_at, updated_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });

  if (versionsError) {
    console.error("[translations] versions query failed", {
      bookId,
      message: versionsError.message,
    });
    return apiError(E_TRANSLATION_LIST_FAILED, 500);
  }

  const rows = versions ?? [];

  // Separate completed/draft versions from pending translations
  const completed = rows.filter((v) => v.status === "done" || v.status === "draft");
  const pending = rows.filter((v) => v.status === "translating" || v.status === "failed");

  return NextResponse.json({
    versions: completed.map((v) => ({
      id: v.id,
      languageCode: v.language_code,
      status: v.status,
      publishedAt: v.published_at,
      createdAt: v.created_at,
    })),
    pendingTranslations: pending.map((v) => ({
      id: v.id,
      languageCode: v.language_code,
      status: v.status,
      createdAt: v.created_at,
    })),
  });
}
