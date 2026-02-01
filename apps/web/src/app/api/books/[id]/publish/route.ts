import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { wrapApiRoute, jsonError, ERROR_CODES, type ApiRouteContext } from "@/lib/api/errors";
import { bookIdParamSchema, firstZodMessage } from "@/lib/api/schemas";
import { checkRateLimit, rateLimitKey } from "@/lib/api/rate-limit";
import { auditLog } from "@/lib/api/audit";

function hasContent(content: string | null): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    const text = extractText(parsed);
    return text.trim().length > 0;
  } catch {
    return content.trim().length > 0;
  }
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof (node as { text?: string }).text === "string") {
    return (node as { text: string }).text;
  }
  if ("content" in node && Array.isArray((node as { content?: unknown[] }).content)) {
    return (node as { content: unknown[] }).content
      .map(extractText)
      .join("");
  }
  return "";
}

async function postHandler(
  request: Request,
  ctx: { requestId: string },
  routeContext: ApiRouteContext
): Promise<Response> {
  const key = rateLimitKey(request, "/api/books/[id]/publish");
  if (!checkRateLimit(key, { windowMs: 60 * 1000, max: 10 }).allowed) {
    return jsonError(ERROR_CODES.RATE_LIMIT, "Too many requests. Try again later.", ctx.requestId, 429);
  }
  assertPublicEnv();
  const rawParams = await (routeContext.params ?? Promise.resolve({}));
  const paramResult = bookIdParamSchema.safeParse(rawParams);
  if (!paramResult.success) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, firstZodMessage(paramResult), ctx.requestId, 400);
  }
  const { id } = paramResult.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return jsonError(ERROR_CODES.NOT_AUTHENTICATED, "Not authenticated", ctx.requestId, 401);
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, status")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Failed to load book", ctx.requestId, 500);
  }

  if (!book || book.author_id !== user.id) {
    return jsonError(ERROR_CODES.NOT_FOUND, "Book not found", ctx.requestId, 404);
  }

  if (book.status === "PUBLISHED") {
    return NextResponse.json({ ok: true, alreadyPublished: true }, { headers: { "x-request-id": ctx.requestId } });
  }

  const title = (book.title ?? "").trim();
  if (!title) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, "Book must have a title before publishing", ctx.requestId, 400);
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, content")
    .eq("book_id", id)
    .order("order", { ascending: true });

  if (!chapters || chapters.length === 0) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, "Book must have at least one chapter", ctx.requestId, 400);
  }

  const hasAnyContent = chapters.some((ch) => hasContent(ch.content));
  if (!hasAnyContent) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, "At least one chapter must have content before publishing", ctx.requestId, 400);
  }

  const { error: updateError } = await supabase
    .from("books")
    .update({
      status: "PUBLISHED",
      published: true,
      published_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Failed to publish", ctx.requestId, 500);
  }

  await auditLog({
    actorUserId: user.id,
    actorRole: "writer",
    action: "book.publish",
    entityType: "book",
    entityId: id,
    requestId: ctx.requestId,
    meta: {},
  }).catch(() => {});

  return NextResponse.json({ ok: true }, { headers: { "x-request-id": ctx.requestId } });
}

export const POST = wrapApiRoute(postHandler);
