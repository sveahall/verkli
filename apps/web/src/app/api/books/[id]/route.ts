import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    return NextResponse.json({ ok: false, error: bookError.message }, { status: 500 });
  }

  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Book not found" }, { status: 404 });
  }

  const { error: chaptersError } = await supabase
    .from("chapters")
    .delete()
    .eq("book_id", id);

  if (chaptersError) {
    return NextResponse.json({ ok: false, error: chaptersError.message }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("books")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
