import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POSTGREST_MAX_ROWS } from "@/lib/author/stats-scope";
import { buildMonthlyReport, monthBounds, type ReportOrder } from "@/lib/payments/monthly-report";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

// Keyset pagination never shifts an already-read boundary after an insert/delete.
// It is still a live read, not a database transaction snapshot.
async function readPages<T extends { id: string }>(
  query: (afterId: string | null) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const { data, error } = await query(cursor);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < POSTGREST_MAX_ROWS) return rows;
    const lastId = page.at(-1)!.id;
    if (!lastId || lastId === cursor) throw new Error("Report pagination did not advance.");
    cursor = lastId;
  }
}

export async function GET(request: Request) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  const month = new URL(request.url).searchParams.get("month") ?? "";
  let bounds;
  try {
    bounds = monthBounds(month);
  } catch {
    return NextResponse.json({ error: "Choose a valid month (YYYY-MM)." }, { status: 400, headers });
  }
  try {
    const readStartedAt = new Date().toISOString();
    const session = await createClient();
    // Resolve the entire ownership scope with the session/RLS client before
    // creating an admin client. A later book-page failure discards the scope.
    const books = await readPages<{ id: string }>((afterId) => {
      let query = session.from("books").select("id").eq("author_id", user.id)
        .lt("created_at", readStartedAt).order("id", { ascending: true }).limit(POSTGREST_MAX_ROWS);
      if (afterId) query = query.gt("id", afterId);
      return query;
    });
    const orders: ReportOrder[] = [];
    if (books.length) {
      const admin = createAdminClient();
      // Bound URL length even for authors with thousands of books.
      for (let offset = 0; offset < books.length; offset += 100) {
        const ids = books.slice(offset, offset + 100).map((book) => book.id);
        const batch = await readPages<ReportOrder & { id: string }>((afterId) => {
          let query = admin.from("orders").select("id, amount, currency, status")
            .in("book_id", ids).gte("created_at", bounds.from)
            .lt("created_at", bounds.to < readStartedAt ? bounds.to : readStartedAt)
            .order("id", { ascending: true }).limit(POSTGREST_MAX_ROWS);
          if (afterId) query = query.gt("id", afterId);
          return query;
        });
        orders.push(...batch);
      }
    }
    return NextResponse.json(buildMonthlyReport(month, orders, readStartedAt), { headers });
  } catch (error) {
    console.error("[author monthly report] load failed", {
      userId: user.id, month, message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "The monthly report could not be loaded. Please retry; no partial totals have been returned." }, { status: 500, headers });
  }
}
