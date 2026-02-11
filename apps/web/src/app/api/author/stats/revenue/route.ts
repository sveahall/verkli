import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_FORBIDDEN,
} from "@/lib/api-errors";

export async function GET() {
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

  // Get author's book IDs
  const { data: books } = await supabase
    .from("books")
    .select("id")
    .eq("author_id", user.id);

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
  const { data: donations } = await supabase
    .from("donations")
    .select("amount")
    .eq("recipient_id", user.id)
    .eq("status", "completed");

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
