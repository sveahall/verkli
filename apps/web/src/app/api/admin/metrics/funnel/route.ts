import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_KEY = process.env.ADMIN_API_KEY?.trim();

export async function GET(request: Request) {
  const key = request.headers.get("x-admin-key")?.trim();
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceIso = since.toISOString();

  const primaryQuery = await admin
    .from("analytics_events")
    .select("event_type, event_name, path")
    .gte("created_at", sinceIso);

  let rows = primaryQuery.data as
    | Array<{ event_type?: string | null; event_name?: string | null; path?: string | null }>
    | null;
  let queryError = primaryQuery.error;

  if (queryError && /event_type/i.test(queryError.message ?? "")) {
    const fallbackQuery = await admin
      .from("analytics_events")
      .select("event_name, path")
      .gte("created_at", sinceIso);

    rows = fallbackQuery.data as Array<{ event_name?: string | null; path?: string | null }> | null;
    queryError = fallbackQuery.error;
  }

  if (queryError) {
    return NextResponse.json({ error: "Failed to load funnel data" }, { status: 500 });
  }

  const authorCounts: Record<string, number> = {};
  const readerCounts: Record<string, number> = {};

  for (const row of rows ?? []) {
    const name = row.event_type ?? row.event_name ?? "unknown";
    const path = (row.path as string) ?? "";
    const isAuthor = path.startsWith("/author") || path.includes("author");
    const isReader = path.startsWith("/reader") || path.includes("reader");

    if (isAuthor) {
      authorCounts[name] = (authorCounts[name] ?? 0) + 1;
    }
    if (isReader) {
      readerCounts[name] = (readerCounts[name] ?? 0) + 1;
    }
    if (!isAuthor && !isReader) {
      authorCounts[name] = (authorCounts[name] ?? 0) + 1;
      readerCounts[name] = (readerCounts[name] ?? 0) + 1;
    }
  }

  const author = Object.entries(authorCounts).map(([event_name, count]) => ({ event_name, count }));
  const reader = Object.entries(readerCounts).map(([event_name, count]) => ({ event_name, count }));

  author.sort((a, b) => b.count - a.count);
  reader.sort((a, b) => b.count - a.count);

  return NextResponse.json({
    since: sinceIso,
    author,
    reader,
  });
}
