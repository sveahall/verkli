import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { confirmStripeBookPurchase } from "@/lib/payments/purchase";

export default async function PurchaseSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ order_id?: string; session_id?: string }>;
}) {
  const { id: bookId } = await params;
  const query = await searchParams;

  const orderId = String(query.order_id ?? "").trim();
  const sessionId = String(query.session_id ?? "").trim();

  if (!orderId || !sessionId) {
    redirect(`/reader/books/${bookId}?purchase=failed`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/reader/signin?next=${encodeURIComponent(`/reader/books/${bookId}`)}`);
  }

  let ok = false;
  try {
    ok = await confirmStripeBookPurchase({
      orderId,
      sessionId,
      userId: user.id,
      bookId,
    });
  } catch {
    ok = false;
  }

  redirect(`/reader/books/${bookId}?purchase=${ok ? "success" : "failed"}`);
}
