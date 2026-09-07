import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnedPurchaseStatusUrl } from "@/lib/payments/checkout-attempts";
import { isCheckoutIdentifier } from "@/lib/payments/checkout-status-url";

export default async function PurchaseCancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { id: bookId } = await params;
  const query = await searchParams;
  const orderId = query.order_id;
  let purchaseStatusUrl: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && isCheckoutIdentifier(orderId) && isCheckoutIdentifier(bookId)) {
      const { data: order, error } = await supabase
        .from("orders" as never)
        .select("*")
        .eq("id", orderId)
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .maybeSingle();
      if (error) {
        console.warn("[purchase.cancel] status lookup unavailable", { reason: "order_lookup_failed" });
      } else if ((order as { id?: unknown } | null)?.id === orderId) {
        purchaseStatusUrl = getOwnedPurchaseStatusUrl(order, user.id, bookId);
      }
    }
  } catch {
    console.warn("[purchase.cancel] status lookup unavailable", { reason: "order_lookup_unconfirmed" });
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-black/10 bg-white p-6 text-slate-900 shadow-sm dark:border-white/10 dark:bg-[#0f1115] dark:text-white">
        <h1 className="text-2xl font-semibold">Checkout closed</h1>
        <p className="mt-3 text-sm text-slate-700 dark:text-white/75">
          Leaving checkout doesn&apos;t establish whether a payment was made. Do not pay again until your purchase status is confirmed.
        </p>

        <p className="mt-3 text-sm text-slate-700 dark:text-white/75">
          {purchaseStatusUrl
            ? "Check purchase status below. If it remains unclear, contact support before making another payment."
            : "We couldn't verify a purchase status link here. Please contact support before making another payment."}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {purchaseStatusUrl ? (
            <Link
              href={purchaseStatusUrl}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/20 dark:text-white"
            >
              Check purchase status
            </Link>
          ) : null}
          <Link
            href={`/reader/books/${bookId}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
          >
            Back to book
          </Link>
          <Link
            href="/support"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/20 dark:text-white"
          >
            Contact support
          </Link>
          <Link
            href="/reader/discover"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/20 dark:text-white"
          >
            Explore more books
          </Link>
        </div>
      </section>
    </main>
  );
}
