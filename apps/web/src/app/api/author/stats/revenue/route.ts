import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { apiError, E_DATABASE_ERROR } from "@/lib/api-errors";
import {
  addToCurrencyTotal,
  fetchAllRows,
  minorToMajor,
  resolveAuthorBooks,
  SETTLED_PAYMENT_STATUS,
  type CurrencyTotals,
} from "@/lib/author/stats-scope";

type AmountRow = { amount: number | string; currency: string | null };

const querySchema = z.object({ period: z.enum(["7d", "30d", "all"]).default("30d") });

export async function GET(request: Request) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ period: url.searchParams.get("period") ?? undefined });
  const period = parsed.success ? parsed.data.period : "30d";
  const selectedBookId = url.searchParams.get("bookId") || null;
  const since = period === "all" ? null : new Date();
  if (since) since.setDate(since.getDate() - (period === "7d" ? 7 : 30));
  const supabase = await createClient();

  // Which books are this author's is an RLS decision, made with the session
  // client. Revenue rows are then read as service role, scoped to that list —
  // `orders.user_id` is the *buyer*, so an author session cannot see them.
  const owned = await resolveAuthorBooks(supabase, user.id);
  if (!owned.ok) {
    console.error("[author/stats/revenue] books load failed", {
      userId: user.id,
      message: owned.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (selectedBookId && !owned.bookIds.includes(selectedBookId)) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const bookIds = selectedBookId ? [selectedBookId] : owned.bookIds;
  const admin = createAdminClient();

  // Paged, not a plain select: PostgREST stops at max_rows = 1000, which turns
  // a "total" into "the first thousand rows" without any error to notice.
  const [orders, subscriptions] = await Promise.all([
    bookIds.length > 0
      ? fetchAllRows<AmountRow>((from, to) => {
          let query = admin
            .from("orders")
            .select("amount, currency")
            .in("book_id", bookIds)
            .eq("status", SETTLED_PAYMENT_STATUS);
          // This schema records order creation, not payment settlement time.
          if (since) query = query.gte("created_at", since.toISOString());
          return query.order("id", { ascending: true }).range(from, to);
        })
      : Promise.resolve({ rows: [] as AmountRow[], error: null }),
    fetchAllRows<{ amount_monthly: number; currency: string | null }>((from, to) =>
      admin
        .from("author_subscriptions")
        .select("amount_monthly, currency")
        .eq("author_id", user.id)
        .eq("status" as never, "active")
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const errors: string[] = [];
  for (const [table, result] of [
    ["orders", orders],
    ["author_subscriptions", subscriptions],
  ] as const) {
    if (result.error) {
      errors.push(table);
      console.error("[author/stats/revenue] load failed", {
        userId: user.id, table, message: result.error,
      });
    }
  }

  // A failed later page must not turn a first-page subtotal into a total.
  const orderTotals: CurrencyTotals = new Map();
  if (!orders.error) {
    for (const row of orders.rows) {
      addToCurrencyTotal(orderTotals, row.currency, Number(row.amount) || 0);
    }
  }
  const subscriptionTotals: CurrencyTotals = new Map();
  if (!subscriptions.error) {
    for (const row of subscriptions.rows) {
      addToCurrencyTotal(subscriptionTotals, row.currency, Number(row.amount_monthly) || 0);
    }
  }
  const byCurrency = (totals: CurrencyTotals) => Object.fromEntries(
    [...totals].map(([code, minor]) => [code.toUpperCase(), minorToMajor(minor)])
  );
  const singleAmount = (totals: CurrencyTotals) => {
    if (totals.size > 1) return { total: null, currency: null };
    const [code, minor] = [...totals][0] ?? ["sek", 0];
    return { total: minorToMajor(minor), currency: code.toUpperCase() };
  };
  const sales = singleAmount(orderTotals);
  const mrr = singleAmount(subscriptionTotals);

  return NextResponse.json({
    partial: errors.length > 0,
    errors,
    period,
    bookId: selectedBookId,
    dateBasis: "order_created_at",
    // Compatibility scalars are only meaningful for one currency. Neither MRR
    // nor reader credit purchases (the donations table) are historical sales.
    totalRevenue: orders.error ? null : sales.total,
    orderRevenue: orders.error ? null : sales.total,
    donationRevenue: 0,
    currency: orders.error ? null : sales.currency,
    byCurrency: orders.error ? null : byCurrency(orderTotals),
    subscriptionMRR: subscriptions.error ? null : mrr.total,
    subscriptionCurrency: subscriptions.error ? null : mrr.currency,
    subscriptionByCurrency: subscriptions.error ? null : byCurrency(subscriptionTotals),
    subscriptionScope: "author",
    activeSubscriberCount: subscriptions.error ? null : subscriptions.rows.length,
  });
}
