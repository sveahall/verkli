import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isMarketingEnabled } from "@/lib/flags";
import { normalizeLanguage } from "@/lib/languages";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { enqueueMarketingJob } from "@/lib/marketing-queue";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_MARKETING_FEATURE_DISABLED,
} from "@/lib/api-errors";

const ALL_CHANNELS = ["generic", "tiktok", "instagram", "x"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isMarketingEnabled()) {
    return apiError(E_MARKETING_FEATURE_DISABLED, 403);
  }
  const { id: bookId } = await params;

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const language = normalizeLanguage(body?.language);
  const channels: string[] = Array.isArray(body?.channels)
    ? body.channels.filter((c: unknown) => typeof c === "string" && ALL_CHANNELS.includes(c))
    : ALL_CHANNELS;

  if (channels.length === 0) {
    return NextResponse.json({ error: "No valid channels provided" }, { status: 400 });
  }

  // Verify book ownership
  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookFetchError) {
    console.error("[marketing schedule] book fetch failed:", bookFetchError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const jobId = await enqueueMarketingJob({
    bookId,
    authorId: user.id,
    channels,
    language,
  });

  if (!jobId) {
    return NextResponse.json(
      { error: "Could not enqueue job — Redis may be unavailable" },
      { status: 503 }
    );
  }

  return NextResponse.json({ jobId, status: "queued" });
}
