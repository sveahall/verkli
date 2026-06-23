import Link from "next/link";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { TA_FOR_ER_ORDER } from "@/lib/orders/ta-for-er";

export const runtime = "nodejs";

export default async function TaForErSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const sessionId = String(session_id ?? "").trim();

  let paid = false;
  if (sessionId) {
    try {
      const session = await getStripeCheckoutSession(sessionId);
      // Only confirm when this session is genuinely a "Ta för er!" book order —
      // a paid donation/subscription session_id must not show this confirmation.
      paid =
        session.payment_status === "paid" &&
        session.metadata?.payment_kind === "book_order";
    } catch {
      /* ignore — show the pending message below */
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-black/10 bg-white p-8 text-slate-900 shadow-sm dark:border-white/10 dark:bg-[#0f1115] dark:text-white">
        {paid ? (
          <>
            <h1 className="text-2xl font-semibold">Tack för din beställning!</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-700 dark:text-white/75">
              Din betalning är bekräftad. <span className="font-medium">{TA_FOR_ER_ORDER.bookTitle}</span> av{" "}
              {TA_FOR_ER_ORDER.authorName} skickas till adressen du angav. Frakten ingår. Du får ett kvitto
              via e-post.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Beställningsstatus</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-700 dark:text-white/75">
              Vi väntar på en bekräftelse på din betalning. Om statusen inte uppdateras, titta in igen om en
              liten stund.
            </p>
          </>
        )}

        <div className="mt-6">
          <Link
            href="/waitlist"
            className="inline-flex min-h-[44px] items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
          >
            Tillbaka till verkli
          </Link>
        </div>
      </section>
    </main>
  );
}
