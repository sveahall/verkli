import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isMarketingEnabled } from "@/lib/flags";
import { getLanguageLabel, normalizeLanguage } from "@/lib/languages";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_MARKETING_FEATURE_DISABLED,
} from "@/lib/api-errors";

const CHANNELS = ["generic", "tiktok", "instagram", "x"] as const;
type Channel = (typeof CHANNELS)[number];

function isChannel(s: string): s is Channel {
  return CHANNELS.includes(s as Channel);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isMarketingEnabled()) {
    return apiError(E_MARKETING_FEATURE_DISABLED, 403);
  }
  const { id: bookId } = await params;

  // SECURITY: Require author role for marketing generation
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const language = normalizeLanguage(body?.language);
  const channel: Channel = isChannel(body?.channel) ? body.channel : "generic";

  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, title, author_id, language, original_url")
    .eq("id", bookId)
    .maybeSingle();

  if (bookFetchError) {
    console.error("[marketing generate] book fetch failed:", bookFetchError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const langLabel = getLanguageLabel(language);
  const readerPath = `/reader/books/${bookId}`;
  const shareUrl = readerPath;

  const headline = `${book.title} – now in ${langLabel}`;
  const caption = `Just published: ${book.title} in ${langLabel} on Verkli. Read it here: ${readerPath}`;
  const cta = "Read on Verkli";
  const hashtags =
    channel === "x" || channel === "instagram" || channel === "tiktok"
      ? "#Verkli #translation #read"
      : "";

  const campaign = {
    book_id: bookId,
    language,
    channel,
    status: "generated",
    headline,
    caption,
    cta,
    hashtags: hashtags || null,
    share_url: shareUrl,
  };

  const { data: upserted, error: upsertError } = await supabase
    .from("marketing_campaigns")
    .upsert(campaign, { onConflict: "book_id,language,channel" })
    .select()
    .single();

  if (upsertError) {
    console.error("[marketing generate] upsert failed:", upsertError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json(upserted);
}
