import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { normalizeLanguage } from "@/lib/languages";

export async function POST(request: Request) {
  assertPublicEnv();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "Untitled").trim() || "Untitled";
  const description = body?.description != null ? String(body.description).trim() || null : null;
  const language = normalizeLanguage(body?.language);
  const original_source = body?.original_source != null ? String(body.original_source).trim() || null : null;
  const original_url = body?.original_url != null ? String(body.original_url).trim() || null : null;
  const is_translation = Boolean(body?.is_translation);
  const original_book_id =
    body?.original_book_id != null && String(body.original_book_id).trim() !== ""
      ? String(body.original_book_id).trim()
      : null;
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
    return NextResponse.json({ error: bookError.message }, { status: 500 });
  }

  if (!book?.id) {
    return NextResponse.json({ error: "Book created but no ID returned" }, { status: 500 });
  }

  const { error: chapterError } = await supabase.from("chapters").insert({
    book_id: book.id,
    title: "Chapter 1",
    content: "",
    order: 0,
  });

  if (chapterError) {
    return NextResponse.json(
      { error: "Book created but default chapter failed: " + chapterError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: book.id });
}
