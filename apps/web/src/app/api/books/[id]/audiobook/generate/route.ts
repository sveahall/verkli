import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isAudiobookEnabled()) {
    return NextResponse.json({ error: "Audiobook feature is disabled" }, { status: 403 });
  }
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

  return NextResponse.json(
    { error: "Audiobook generation is not implemented yet" },
    { status: 501 }
  );
}
