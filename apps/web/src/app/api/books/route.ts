import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { normalizeLanguage } from "@/lib/languages";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";

export async function POST(request: Request) {
  assertPublicEnv();

  // SECURITY: Require author role for book creation
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "Untitled").trim() || "Untitled";
  const description = body?.description != null ? String(body.description).trim() || null : null;
  const language = normalizeLanguage(body?.language);
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
      original_language: language,
      original_source: original_source || null,
      original_url: original_url || null,
      price_amount: 499,
      price_currency: "USD",
    })
    .select("id")
    .single();

  if (bookError) {
    return NextResponse.json({ error: bookError.message }, { status: 500 });
  }

  if (!book?.id) {
    return NextResponse.json({ error: "Book created but no ID returned" }, { status: 500 });
  }

  const { data: version, error: versionError } = await supabase
    .from("book_versions")
    .insert({
      book_id: book.id,
      language_code: language,
      status: "draft",
    })
    .select("id")
    .single();

  if (versionError || !version?.id) {
    return NextResponse.json(
      { error: "Book created but version creation failed: " + (versionError?.message ?? "unknown error") },
      { status: 500 }
    );
  }

  const { error: chapterError } = await supabase.from("chapters").insert({
    book_id: book.id,
    book_version_id: version.id,
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

  return NextResponse.json({ id: book.id, versionId: version.id });
}
