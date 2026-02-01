import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, status")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    return NextResponse.json({ error: bookError.message }, { status: 500 });
  }

  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (book.status === "PUBLISHED") {
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
    .eq("book_id", id)
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

  const { error: updateError } = await supabase
    .from("books")
    .update({
      status: "PUBLISHED",
      published: true,
      published_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
