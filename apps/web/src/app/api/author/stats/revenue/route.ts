import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";

export async function GET() {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  // Get author's book IDs and donations in parallel (both only need user.id)
  const [{ data: books }, { data: donations }, { data: activeSubscriptions }] = await Promise.all([
    supabase
      .from("books")
      .select("id")
      .eq("author_id", user.id),
    supabase
      .from("donations")
      .select("amount")
      .eq("recipient_id", user.id)
      .eq("status", "completed"),
    supabase
      .from("author_subscriptions" as never)
      .select("amount_monthly, currency")
      .eq("author_id", user.id)
      .eq("status" as never, "active"),
  ]);

  const bookIds = (books ?? []).map((b) => b.id as string);

  // Sum revenue from orders table for author's books
  let orderRevenue = 0;
  if (bookIds.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("amount")
      .in("book_id", bookIds)
      .eq("status", "completed");

    for (const order of orders ?? []) {
      orderRevenue += Number(order.amount) || 0;
    }
  }

  // Sum donations for author
  let donationRevenue = 0;
  for (const donation of donations ?? []) {
    donationRevenue += Number(donation.amount) || 0;
  }

  // Subscription MRR: sum of all active subscriptions' monthly prices
  let subscriptionMRR = 0;
  let activeSubscriberCount = 0;
  for (const sub of (activeSubscriptions ?? []) as Array<{ amount_monthly: number; currency: string }>) {
    subscriptionMRR += Number(sub.amount_monthly) || 0;
    activeSubscriberCount++;
  }

  return NextResponse.json({
    totalRevenue: orderRevenue + donationRevenue + subscriptionMRR,
    orderRevenue,
    donationRevenue,
    subscriptionMRR,
    activeSubscriberCount,
    currency: "SEK",
  });
}
