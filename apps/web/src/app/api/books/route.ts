import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";

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
  const language = body?.language != null ? String(body.language).trim() || "en" : "en";
  const original_source = body?.original_source != null ? String(body.original_source).trim() || null : null;
  const original_url = body?.original_url != null ? String(body.original_url).trim() || null : null;

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
