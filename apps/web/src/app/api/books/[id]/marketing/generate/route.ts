import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isMarketingEnabled } from "@/lib/flags";
import { getLanguageLabel, normalizeLanguage } from "@/lib/languages";

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
    return NextResponse.json({ error: "Marketing feature is disabled" }, { status: 403 });
  }
  const { id: bookId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const language = normalizeLanguage(body?.language);
  const channel: Channel = isChannel(body?.channel) ? body.channel : "generic";

  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, title, author_id, language, original_url")
    .eq("id", bookId)
    .maybeSingle();

  if (bookFetchError) {
    return NextResponse.json({ error: bookFetchError.message }, { status: 500 });
  }
  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ error: "Book not found or access denied" }, { status: 404 });
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
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json(upserted);
}
