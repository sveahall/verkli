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
import type { TablesUpdate } from "@/lib/supabase/types";

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
    if (parsed.error.issues.some((issue) => issue.path[0] === "expectedUpdatedAt")) {
      return apiError(E_VALIDATION_FAILED, 400, { detail: "Reload the campaign to get the current post revision before saving." });
    }
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("marketing_posts")
    .select("id, status, content_type, caption, hashtags, cta, media_asset_url, updated_at")
    .eq("id", id).eq("author_id", gate.user.id).maybeSingle();
  if (readError) {
    console.error("[marketing post] read failed:", readError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!current) return apiError("POST_NOT_FOUND", 404);
  const input = parsed.data;
  if (input.expectedUpdatedAt !== current.updated_at) {
    return apiError("POST_CHANGED", 409, { detail: "This post changed in another tab. Your draft has been kept. Load the latest saved copy to compare before reviewing again." });
  }
  const copyChanged = (input.caption !== undefined && input.caption !== current.caption)
    || (input.hashtags !== undefined && input.hashtags !== current.hashtags)
    || (input.cta !== undefined && input.cta !== current.cta);
  if (current.status === "asset_pending" || (current.status === "posted" && copyChanged)) {
    return apiError("POST_NOT_EDITABLE", 409, { detail: "This post is generating or has already been marked as posted." });
  }
  if (input.status === "ready" && (!(input.caption ?? current.caption)?.trim()
    || (current.content_type !== "text" && !current.media_asset_url))) {
    return apiError("POST_NOT_READY", 422, { detail: "Add the caption and finish the media before approving this post." });
  }
  if (input.status === "posted" && (current.status !== "ready" || copyChanged)) {
    return apiError("POST_REVIEW_REQUIRED", 409, { detail: "Save and approve the final copy before marking it as posted." });
  }
  const update: TablesUpdate<"marketing_posts"> = {};
  if (parsed.data.caption !== undefined) update.caption = parsed.data.caption;
  if (parsed.data.hashtags !== undefined) update.hashtags = parsed.data.hashtags;
  if (parsed.data.cta !== undefined) update.cta = parsed.data.cta;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.postedUrl !== undefined) update.posted_url = parsed.data.postedUrl;

  if (copyChanged && input.status !== "ready") update.status = "draft";

  // Auto-stamp posted_at when status flips to "posted"
  if (parsed.data.status === "posted") {
    update.posted_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("marketing_posts")
    .update(update)
    .eq("id", id)
    .eq("author_id", gate.user.id)
    .eq("status", current.status)
    .eq("updated_at", input.expectedUpdatedAt)
    .select(
      `id, status, caption, hashtags, cta, posted_at, posted_url, updated_at`
    )
    .maybeSingle();

  if (error) {
    console.error("[post patch]:", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!data) return apiError("POST_CHANGED", 409, { detail: "This post changed. Refresh and review the latest version." });
  return NextResponse.json({ post: {
    id: data.id, status: data.status, caption: data.caption, hashtags: data.hashtags,
    cta: data.cta, postedAt: data.posted_at, postedUrl: data.posted_url, updatedAt: data.updated_at,
  } });
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
