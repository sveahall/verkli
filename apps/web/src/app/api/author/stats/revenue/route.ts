import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { apiError, E_DATABASE_ERROR } from "@/lib/api-errors";
import {
  addToCurrencyTotal,
  dominantCurrencyTotal,
  fetchAllRows,
  minorToMajor,
  resolveAuthorBooks,
  SETTLED_PAYMENT_STATUS,
  type CurrencyTotals,
} from "@/lib/author/stats-scope";

type AmountRow = { amount: number | string; currency: string | null };

export async function GET() {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

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

  const { bookIds } = owned;
  const admin = createAdminClient();

  // Paged, not a plain select: PostgREST stops at max_rows = 1000, which turns
  // a "total" into "the first thousand rows" without any error to notice.
  const [orders, donations, subscriptions] = await Promise.all([
    bookIds.length > 0
      ? fetchAllRows<AmountRow>((from, to) =>
          admin
            .from("orders")
            .select("amount, currency")
            .in("book_id", bookIds)
            .eq("status", SETTLED_PAYMENT_STATUS)
            .order("id", { ascending: true })
            .range(from, to)
        )
      : Promise.resolve({ rows: [] as AmountRow[], error: null }),
    fetchAllRows<AmountRow>((from, to) =>
      admin
        .from("donations")
        .select("amount, currency")
        .eq("recipient_id", user.id)
        .eq("status", SETTLED_PAYMENT_STATUS)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<{ amount_monthly: number; currency: string | null }>((from, to) =>
      admin
        .from("author_subscriptions" as never)
        .select("amount_monthly, currency")
        .eq("author_id", user.id)
        .eq("status" as never, "active")
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  // These used to be swallowed, so a broken revenue query looked exactly like
  // an author who had not sold anything. Log loudly; still answer with what
  // did load rather than failing the whole dashboard.
  for (const [table, result] of [
    ["orders", orders],
    ["donations", donations],
    ["author_subscriptions", subscriptions],
  ] as const) {
    if (result.error) {
      console.error("[author/stats/revenue] load failed", {
        userId: user.id,
        table,
        message: result.error,
      });
    }
  }

  // Amounts are minor units and each row carries its own currency, so they are
  // tallied per currency rather than added into one meaningless number.
  const orderTotals: CurrencyTotals = new Map();
  for (const row of orders.rows) {
    addToCurrencyTotal(orderTotals, row.currency, Number(row.amount) || 0);
  }

  const donationTotals: CurrencyTotals = new Map();
  for (const row of donations.rows) {
    addToCurrencyTotal(donationTotals, row.currency, Number(row.amount) || 0);
  }

  const subscriptionTotals: CurrencyTotals = new Map();
  for (const row of subscriptions.rows) {
    addToCurrencyTotal(
      subscriptionTotals,
      row.currency,
      Number(row.amount_monthly) || 0
    );
  }

  const combined: CurrencyTotals = new Map();
  for (const totals of [orderTotals, donationTotals, subscriptionTotals]) {
    for (const [code, minor] of totals) {
      combined.set(code, (combined.get(code) ?? 0) + minor);
    }
  }

  if (combined.size > 1) {
    console.warn("[author/stats/revenue] multiple currencies; reporting the largest", {
      userId: user.id,
      currencies: [...combined.keys()],
    });
  }

  // KNOWN LIMITATION, deliberate. With revenue in more than one currency the
  // headline reports the largest bucket only, so it under-reports. The
  // alternative — adding SEK to EUR — produces a number that is not an amount
  // of anything, which is worse. Presenting mixed currencies properly is a
  // product decision (convert at whose rate, as of when?) rather than a coding
  // one, and September is a Swedish, card-only, single-book launch that cannot
  // reach this case. `byCurrency` below carries the full picture for whoever
  // builds that UI.
  const headline = dominantCurrencyTotal(combined);
  const code = headline.currency.toLowerCase();

  return NextResponse.json({
    totalRevenue: headline.total,
    orderRevenue: minorToMajor(orderTotals.get(code) ?? 0),
    donationRevenue: minorToMajor(donationTotals.get(code) ?? 0),
    subscriptionMRR: minorToMajor(subscriptionTotals.get(code) ?? 0),
    activeSubscriberCount: subscriptions.rows.length,
    currency: headline.currency,
    // Present so a mixed-currency author is not silently under-reported by the
    // headline figure above.
    byCurrency: Object.fromEntries(
      [...combined].map(([c, minor]) => [c.toUpperCase(), minorToMajor(minor)])
    ),
  });
}
