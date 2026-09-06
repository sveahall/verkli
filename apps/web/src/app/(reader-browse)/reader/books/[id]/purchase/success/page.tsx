import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { confirmStripeBookPurchase } from "@/lib/payments/purchase";
import { getDiscoverHref } from "@/lib/flags";

type PurchaseOutcome = "success" | "pending" | "failed";

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

  let outcome: PurchaseOutcome = "pending";
  let requiresSignIn = false;
  const discoverHref = getDiscoverHref();

  if (orderId && sessionId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      requiresSignIn = true;
    } else {
      try {
        const result = await confirmStripeBookPurchase({
          orderId,
          sessionId,
          userId: user.id,
          bookId,
        });
        // "processing" is a delayed payment method still settling — neither
        // success nor failure. It must not render the failure copy, which tells
        // the buyer to try again and can double-charge them.
        outcome =
          result === "paid" ? "success" : result === "processing" ? "pending" : "failed";
      } catch {
        outcome = "pending";
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-black/10 bg-white p-6 text-slate-900 shadow-sm dark:border-white/10 dark:bg-[#0f1115] dark:text-white">
        <h1 className="text-2xl font-semibold">Purchase status</h1>

        {outcome === "success" ? (
          <>
            <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
              Payment verified. Your purchased access is ready.
            </p>
            <p className="mt-2 text-sm text-slate-700 dark:text-white/75">
              You can open the purchase from this page or find it in your library.
            </p>
          </>
        ) : null}

        {outcome === "failed" ? (
          <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">
            We could not verify this purchase. Please contact support before making another
            payment.
          </p>
        ) : null}

        {outcome === "pending" ? (
          <p className="mt-3 text-sm text-slate-700 dark:text-white/75">
            We are still checking your purchase status. Do not pay again. You can reload this
            page in a moment, or contact support if the status does not change.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/reader/books/${bookId}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
          >
            Go to book
          </Link>
          <Link
            href="/reader/library"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/20 dark:text-white"
          >
            Go to library
          </Link>
          {/* Discover 404s when NEXT_PUBLIC_DISCOVERY_ENABLED is off, so the
              flag decides whether this CTA exists at all. */}
          {discoverHref ? (
            <Link
              href={discoverHref}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/20 dark:text-white"
            >
              Explore more books
            </Link>
          ) : null}
          {requiresSignIn ? (
            <Link
              href={`/reader/signin?next=${encodeURIComponent(`/reader/books/${bookId}`)}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/20 dark:text-white"
            >
              Sign in to view access
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
