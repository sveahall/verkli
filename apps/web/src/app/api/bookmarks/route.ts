import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const postBodySchema = z.object({
  bookId: z.string().uuid("Invalid book ID"),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("bookmarks")
    .select("id, book_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load bookmarks" }, { status: 500 });
  }

  return NextResponse.json({ bookmarks: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first?.message ?? "Validation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { bookId } = parsed.data;

  const { data, error } = await supabase
    .from("bookmarks")
    .insert({ user_id: user.id, book_id: bookId })
    .select("id, book_id, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already bookmarked" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to add bookmark" }, { status: 500 });
  }

  await supabase.from("analytics_events").insert({
    user_id: user.id,
    event_name: "bookmark_added",
    path: "/reader/bookmarks",
    props: { book_id: bookId },
  });

  return NextResponse.json(data, { status: 200 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("bookId");

  if (!bookId || !z.string().uuid().safeParse(bookId).success) {
    return NextResponse.json({ error: "Invalid or missing bookId" }, { status: 400 });
  }

  const { data: deleted, error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to remove bookmark" }, { status: 500 });
  }

  if (deleted) {
    await supabase.from("analytics_events").insert({
      user_id: user.id,
      event_name: "bookmark_removed",
      path: "/reader/bookmarks",
      props: { book_id: bookId },
    });
  }

  return NextResponse.json({ ok: true });
}
