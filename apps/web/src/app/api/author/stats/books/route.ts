import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  apiError,
  E_DATABASE_ERROR,
} from "@/lib/api-errors";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "all"]).default("30d"),
});

export async function GET(request: Request) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    period: url.searchParams.get("period") ?? undefined,
  });
  const period = parsed.success ? parsed.data.period : "30d";

  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title")
    .eq("author_id", user.id);

  if (booksError) {
    console.error("[author/stats/books] books load failed", {
      userId: user.id,
      message: booksError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!books || books.length === 0) {
    return NextResponse.json({ books: [] });
  }

  const bookIds = books.map((b) => b.id as string);

  let eventsQuery = supabase
    .from("analytics_events")
    .select("event_name, path");

  if (period === "7d") {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    eventsQuery = eventsQuery.gte("created_at", since.toISOString());
  } else if (period === "30d") {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    eventsQuery = eventsQuery.gte("created_at", since.toISOString());
  }

  const { data: events, error: eventsError } = await eventsQuery;

  if (eventsError) {
    console.error("[author/stats/books] analytics load failed", {
      userId: user.id,
      message: eventsError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Build per-book stats
  const statsMap = new Map<string, { views: number; reads: number; purchases: number }>();
  for (const id of bookIds) {
    statsMap.set(id, { views: 0, reads: 0, purchases: 0 });
  }

  for (const event of events ?? []) {
    const path = (event.path as string) ?? "";
    const name = ((event.event_name as string) ?? "").toLowerCase();

    for (const bookId of bookIds) {
      if (!path.includes(bookId)) continue;
      const entry = statsMap.get(bookId)!;
      if (name.includes("read") || name.includes("chapter_read")) {
        entry.reads++;
      } else if (name.includes("purchase") || name.includes("checkout")) {
        entry.purchases++;
      } else {
        entry.views++;
      }
    }
  }

  const result = books
    .map((book) => ({
      id: book.id,
      title: book.title as string,
      ...(statsMap.get(book.id as string) ?? { views: 0, reads: 0, purchases: 0 }),
    }))
    .sort((a, b) => b.views - a.views);

  return NextResponse.json({ books: result });
}
