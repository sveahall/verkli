import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";

export async function GET() {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  // Get author's book IDs and donations in parallel (both only need user.id)
  const [{ data: books }, { data: donations }] = await Promise.all([
    supabase
      .from("books")
      .select("id")
      .eq("author_id", user.id),
    supabase
      .from("donations")
      .select("amount")
      .eq("recipient_id", user.id)
      .eq("status", "completed"),
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

  return NextResponse.json({
    totalRevenue: orderRevenue + donationRevenue,
    orderRevenue,
    donationRevenue,
    currency: "SEK",
  });
}
