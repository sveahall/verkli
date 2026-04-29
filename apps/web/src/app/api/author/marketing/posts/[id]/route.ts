import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { updatePostBodySchema } from "@/lib/marketing/schemas";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
  isValidUuid,
} from "@/lib/api-errors";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  const { id } = await params;
  if (!isValidUuid(id)) return apiError(E_INVALID_BOOK_ID, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = updatePostBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.caption !== undefined) update.caption = parsed.data.caption;
  if (parsed.data.hashtags !== undefined) update.hashtags = parsed.data.hashtags;
  if (parsed.data.cta !== undefined) update.cta = parsed.data.cta;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.postedUrl !== undefined) update.posted_url = parsed.data.postedUrl;

  // Auto-stamp posted_at when status flips to "posted"
  if (parsed.data.status === "posted") {
    update.posted_at = new Date().toISOString();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_posts")
    .update(update)
    .eq("id", id)
    .eq("author_id", gate.user.id)
    .select(
      `id, status, caption, hashtags, cta, posted_at, posted_url, updated_at`
    )
    .single();

  if (error) {
    console.error("[post patch]:", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({ post: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  const { id } = await params;
  if (!isValidUuid(id)) return apiError(E_INVALID_BOOK_ID, 400);

  const supabase = await createClient();
  const { error } = await supabase
    .from("marketing_posts")
    .delete()
    .eq("id", id)
    .eq("author_id", gate.user.id);

  if (error) {
    console.error("[post delete]:", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({ ok: true });
}
