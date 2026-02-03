import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";

function hasContent(content: string | null): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    const text = extractText(parsed);
    return text.trim().length > 0;
  } catch {
    return content.trim().length > 0;
  }
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof (node as { text?: string }).text === "string") {
    return (node as { text: string }).text;
  }
  if ("content" in node && Array.isArray((node as { content?: unknown[] }).content)) {
    return (node as { content: unknown[] }).content
      .map(extractText)
      .join("");
  }
  return "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const versionFromBody =
    body?.versionId != null && String(body.versionId).trim() !== ""
      ? String(body.versionId).trim()
      : null;
  const versionFromQuery = new URL(request.url).searchParams.get("versionId");
  const requestedVersionId = versionFromBody ?? versionFromQuery ?? null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, status, original_language")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    return NextResponse.json({ error: bookError.message }, { status: 500 });
  }

  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  let versionId = requestedVersionId;
  if (!versionId) {
    const { data: defaultVersion } = await supabase
      .from("book_versions")
      .select("id")
      .eq("book_id", id)
      .eq("language_code", (book as { original_language?: string | null }).original_language ?? "en")
      .maybeSingle();
    versionId = defaultVersion?.id ?? null;
  }
  if (!versionId) {
    const { data: anyVersion } = await supabase
      .from("book_versions")
      .select("id")
      .eq("book_id", id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    versionId = anyVersion?.id ?? null;
  }
  if (!versionId) {
    return NextResponse.json({ error: "Book has no version to publish" }, { status: 400 });
  }

  const { data: version, error: versionError } = await supabase
    .from("book_versions")
    .select("id, book_id, published_at")
    .eq("id", versionId)
    .maybeSingle();

  if (versionError || !version || version.book_id !== id) {
    return NextResponse.json({ error: "Invalid book version" }, { status: 400 });
  }

  if (version.published_at) {
    return NextResponse.json({ ok: true, alreadyPublished: true });
  }

  const title = (book.title ?? "").trim();
  if (!title) {
    return NextResponse.json(
      { error: "Book must have a title before publishing" },
      { status: 400 }
    );
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, content")
    .eq("book_version_id", versionId)
    .order("order", { ascending: true });

  if (!chapters || chapters.length === 0) {
    return NextResponse.json(
      { error: "Book must have at least one chapter" },
      { status: 400 }
    );
  }

  const hasAnyContent = chapters.some((ch) => hasContent(ch.content));
  if (!hasAnyContent) {
    return NextResponse.json(
      { error: "At least one chapter must have content before publishing" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { error: versionUpdateError } = await supabase
    .from("book_versions")
    .update({
      status: "done",
      published_at: now,
    })
    .eq("id", versionId);

  if (versionUpdateError) {
    return NextResponse.json({ error: versionUpdateError.message }, { status: 500 });
  }

  if (book.status !== "PUBLISHED") {
    const { error: updateError } = await supabase
      .from("books")
      .update({
        status: "PUBLISHED",
        published: true,
        published_at: now,
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
