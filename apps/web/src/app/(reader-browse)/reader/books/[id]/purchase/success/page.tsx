import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { confirmStripeBookPurchase } from "@/lib/payments/purchase";

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

  if (orderId && sessionId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      requiresSignIn = true;
    } else {
      try {
        const ok = await confirmStripeBookPurchase({
          orderId,
          sessionId,
          userId: user.id,
          bookId,
        });
        outcome = ok ? "success" : "failed";
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
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
            Payment verified. This book is now unlocked for your account.
          </p>
        ) : null}

        {outcome === "failed" ? (
          <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">
            We could not verify the purchase. You can try again or contact support.
          </p>
        ) : null}

        {outcome === "pending" ? (
          <p className="mt-3 text-sm text-slate-700 dark:text-white/75">
            We are waiting for payment confirmation. If access does not update right away, reopen the
            book in a moment.
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
            href="/reader/discover"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/20 dark:text-white"
          >
            Explore more books
          </Link>
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
