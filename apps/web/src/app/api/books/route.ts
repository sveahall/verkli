import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { normalizeLanguage } from "@/lib/languages";
import { wrapApiRoute, jsonError, ERROR_CODES } from "@/lib/api/errors";
import { createBookBodySchema, firstZodMessage } from "@/lib/api/schemas";
import { checkRateLimit, rateLimitKey } from "@/lib/api/rate-limit";
import { auditLog } from "@/lib/api/audit";

async function postHandler(
  request: Request,
  ctx: { requestId: string }
): Promise<Response> {
  const key = rateLimitKey(request, "/api/books");
  if (!checkRateLimit(key, { windowMs: 60 * 1000, max: 10 }).allowed) {
    return jsonError(ERROR_CODES.RATE_LIMIT, "Too many requests. Try again later.", ctx.requestId, 429);
  }
  assertPublicEnv();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return jsonError(ERROR_CODES.NOT_AUTHENTICATED, "Not authenticated", ctx.requestId, 401);
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = createBookBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, firstZodMessage(parsed), ctx.requestId, 400);
  }
  const {
    title: rawTitle,
    description,
    language: langInput,
    original_source,
    original_url,
    is_translation,
    original_book_id,
  } = parsed.data;
  const title = rawTitle || "Untitled";
  const language = normalizeLanguage(langInput);
  const translation_status: "draft" | null = is_translation ? "draft" : null;

  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Date.now();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      title,
      description,
      slug,
      author_id: user.id,
      status: "DRAFT",
      language,
      original_source: original_source || null,
      original_url: original_url || null,
      is_translation,
      original_book_id: original_book_id || null,
      translation_status: translation_status,
    })
    .select("id")
    .single();

  if (bookError) {
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Failed to create book", ctx.requestId, 500);
  }

  if (!book?.id) {
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Book created but no ID returned", ctx.requestId, 500);
  }

  const { error: chapterError } = await supabase.from("chapters").insert({
    book_id: book.id,
    title: "Chapter 1",
    content: "",
    order: 0,
  });

  if (chapterError) {
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Default chapter failed", ctx.requestId, 500);
  }

  await auditLog({
    actorUserId: user.id,
    actorRole: "writer",
    action: "book.create",
    entityType: "book",
    entityId: book.id,
    requestId: ctx.requestId,
    meta: { status: "DRAFT" },
  }).catch(() => {});

  return NextResponse.json({ id: book.id }, { headers: { "x-request-id": ctx.requestId } });
}

export const POST = wrapApiRoute(postHandler);
