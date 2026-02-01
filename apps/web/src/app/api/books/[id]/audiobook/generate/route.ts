import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";
import { normalizeLanguage } from "@/lib/languages";
import { wrapApiRoute, jsonError, ERROR_CODES, type ApiRouteContext } from "@/lib/api/errors";
import { bookIdParamSchema, firstZodMessage } from "@/lib/api/schemas";
import { checkRateLimit, rateLimitKey } from "@/lib/api/rate-limit";

async function postHandler(
  request: Request,
  ctx: { requestId: string },
  routeContext: ApiRouteContext
): Promise<Response> {
  const key = rateLimitKey(request, "/api/books/[id]/audiobook/generate");
  if (!checkRateLimit(key, { windowMs: 60 * 1000, max: 5 }).allowed) {
    return jsonError(ERROR_CODES.RATE_LIMIT, "Too many requests. Try again later.", ctx.requestId, 429);
  }
  assertPublicEnv();
  if (!isAudiobookEnabled()) {
    return jsonError(ERROR_CODES.FORBIDDEN, "Audiobook feature is disabled", ctx.requestId, 403);
  }
  const rawParams = await (routeContext.params ?? Promise.resolve({}));
  const paramResult = bookIdParamSchema.safeParse(rawParams);
  if (!paramResult.success) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, firstZodMessage(paramResult), ctx.requestId, 400);
  }
  const { id: bookId } = paramResult.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return jsonError(ERROR_CODES.NOT_AUTHENTICATED, "Not authenticated", ctx.requestId, 401);
  }

  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, author_id, language")
    .eq("id", bookId)
    .maybeSingle();

  if (bookFetchError) {
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Failed to load book", ctx.requestId, 500);
  }
  if (!book || book.author_id !== user.id) {
    return jsonError(ERROR_CODES.NOT_FOUND, "Book not found or access denied", ctx.requestId, 404);
  }

  const { error: updateGeneratingError } = await supabase
    .from("books")
    .update({ audiobook_status: "generating" })
    .eq("id", bookId);

  if (updateGeneratingError) {
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Failed to start generation", ctx.requestId, 500);
  }

  const language = normalizeLanguage(book.language);
  const mockAudioUrl = `/mock-audio/${bookId}.mp3`;

  const { error: insertError } = await supabase.from("audiobook_assets").insert({
    book_id: bookId,
    language,
    status: "generated",
    audio_url: mockAudioUrl,
    duration_seconds: null,
  });

  if (insertError) {
    await supabase.from("books").update({ audiobook_status: "failed" }).eq("id", bookId);
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Failed to create audiobook asset", ctx.requestId, 500);
  }

  const { error: updatePublishedError } = await supabase
    .from("books")
    .update({ audiobook_status: "published" })
    .eq("id", bookId);

  if (updatePublishedError) {
    await supabase.from("books").update({ audiobook_status: "failed" }).eq("id", bookId);
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Failed to update status", ctx.requestId, 500);
  }

  return NextResponse.json({ ok: true, audio_url: mockAudioUrl }, { headers: { "x-request-id": ctx.requestId } });
}

export const POST = wrapApiRoute(postHandler);
