import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { normalizeLanguage } from "@/lib/languages";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id: bookId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, author_id, language")
    .eq("id", bookId)
    .maybeSingle();

  if (bookFetchError) {
    return NextResponse.json({ error: bookFetchError.message }, { status: 500 });
  }
  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ error: "Book not found or access denied" }, { status: 404 });
  }

  const { error: updateGeneratingError } = await supabase
    .from("books")
    .update({ audiobook_status: "generating" })
    .eq("id", bookId);

  if (updateGeneratingError) {
    return NextResponse.json({ error: updateGeneratingError.message }, { status: 500 });
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
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: updatePublishedError } = await supabase
    .from("books")
    .update({ audiobook_status: "published" })
    .eq("id", bookId);

  if (updatePublishedError) {
    await supabase.from("books").update({ audiobook_status: "failed" }).eq("id", bookId);
    return NextResponse.json({ error: updatePublishedError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, audio_url: mockAudioUrl });
}
