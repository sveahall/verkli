import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markOrderFailedForUser } from "@/lib/payments/purchase";

export default async function PurchaseCancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { id: bookId } = await params;
  const query = await searchParams;
  const orderId = String(query.order_id ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && orderId) {
    await markOrderFailedForUser(orderId, user.id);
  }

  redirect(`/reader/books/${bookId}?purchase=cancelled`);
}
