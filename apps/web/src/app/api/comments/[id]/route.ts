import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_COMMENT_DELETE_FAILED,
  E_COMMENT_NOT_FOUND,
  E_FORBIDDEN,
  E_INVALID_COMMENT_ID,
  E_NOT_AUTHENTICATED,
} from "@/lib/api-errors";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid comment ID"),
});

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const parsedParams = paramsSchema.safeParse(resolvedParams);
  if (!parsedParams.success) {
    return apiError(E_INVALID_COMMENT_ID, 400);
  }

  const { id } = parsedParams.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: comment, error: commentError } = await supabase
    .from("comments")
    .select("id, book_id, author_id")
    .eq("id", id)
    .maybeSingle();

  if (commentError) {
    console.error("[comments] delete lookup failed", {
      commentId: id,
      userId: user.id,
      message: commentError.message,
      code: commentError.code,
    });
    return apiError(E_COMMENT_DELETE_FAILED, 500);
  }

  if (!comment) {
    return apiError(E_COMMENT_NOT_FOUND, 404);
  }

  let canDelete = comment.author_id === user.id;
  if (!canDelete) {
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("author_id")
      .eq("id", comment.book_id)
      .maybeSingle();

    if (bookError) {
      console.error("[comments] delete book lookup failed", {
        commentId: id,
        bookId: comment.book_id,
        userId: user.id,
        message: bookError.message,
        code: bookError.code,
      });
      return apiError(E_COMMENT_DELETE_FAILED, 500);
    }

    canDelete = book?.author_id === user.id;
  }

  if (!canDelete) {
    return apiError(E_FORBIDDEN, 403);
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("comments")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    console.error("[comments] delete failed", {
      commentId: id,
      userId: user.id,
      message: deleteError.message,
      code: deleteError.code,
    });
    return apiError(E_COMMENT_DELETE_FAILED, 500);
  }

  if (!deleted) {
    return apiError(E_COMMENT_NOT_FOUND, 404);
  }

  return NextResponse.json({ ok: true });
}
