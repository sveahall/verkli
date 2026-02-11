import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_UNAUTHORIZED,
  E_BOOK_NOT_FOUND,
  E_CONTENT_FETCH_FAILED,
} from "@/lib/api-errors";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  if (!user) return apiError(E_UNAUTHORIZED, 401);

  const { id: bookId } = await params;
  const admin = createAdminClient();

  // Verify book ownership
  const { data: book } = await admin
    .from("books" as never)
    .select("id, author_id")
    .eq("id", bookId)
    .single();

  const bookRow = book as Record<string, unknown> | null;
  if (!bookRow || bookRow.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Parse query params
  const url = new URL(req.url);
  const contentType = url.searchParams.get("contentType");
  const channel = url.searchParams.get("channel");
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 1),
    100
  );

  try {
    let query = admin
      .from("content_assets" as never)
      .select("*")
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (contentType) {
      query = query.eq("content_type", contentType);
    }
    if (channel) {
      query = query.eq("channel", channel);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[content-list] query failed", error.message);
      return apiError(E_CONTENT_FETCH_FAILED, 500);
    }

    return NextResponse.json({ ok: true, assets: data ?? [] });
  } catch (err) {
    console.error(
      "[content-list] failed",
      err instanceof Error ? err.message : String(err)
    );
    return apiError(E_CONTENT_FETCH_FAILED, 500);
  }
}
