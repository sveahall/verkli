import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_FORBIDDEN,
  E_DATABASE_ERROR,
} from "@/lib/api-errors";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "all"]).default("30d"),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  // Verify author role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "author") {
    return apiError(E_FORBIDDEN, 403);
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    period: url.searchParams.get("period") ?? undefined,
  });
  const period = parsed.success ? parsed.data.period : "30d";

  // Get author's book IDs
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id")
    .eq("author_id", user.id);

  if (booksError) {
    console.error("[author/stats] books load failed", {
      userId: user.id,
      message: booksError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const bookIds = (books ?? []).map((b) => b.id as string);

  if (bookIds.length === 0) {
    return NextResponse.json({
      views: 0,
      reads: 0,
      purchases: 0,
      bookmarks: 0,
      period,
    });
  }

  // Query analytics_events for events whose path contains a book ID
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
    console.error("[author/stats] analytics load failed", {
      userId: user.id,
      message: eventsError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Filter events that match author's books
  let views = 0;
  let reads = 0;
  let purchases = 0;
  let bookmarksCount = 0;

  for (const event of events ?? []) {
    const path = (event.path as string) ?? "";
    const name = (event.event_name as string) ?? "";
    const matchesBook = bookIds.some((id) => path.includes(id));
    if (!matchesBook) continue;

    const nameLower = name.toLowerCase();
    if (nameLower.includes("view") || nameLower.includes("page_view")) {
      views++;
    } else if (nameLower.includes("read") || nameLower.includes("chapter_read")) {
      reads++;
    } else if (nameLower.includes("purchase") || nameLower.includes("checkout")) {
      purchases++;
    } else if (nameLower.includes("bookmark") || nameLower.includes("save")) {
      bookmarksCount++;
    } else {
      // Count unknown events as views
      views++;
    }
  }

  return NextResponse.json({
    views,
    reads,
    purchases,
    bookmarks: bookmarksCount,
    period,
  });
}
