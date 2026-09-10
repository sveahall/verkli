import Link from "next/link";
import { BookOpen, Clock3 } from "lucide-react";
import styles from "@/components/public/PublicPage.module.css";
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
    <main className={styles.page}>
      <section className={styles.status}>
        <div className={styles.statusIcon}>{paid ? <BookOpen size={25} aria-hidden="true" /> : <Clock3 size={25} aria-hidden="true" />}</div>
        {paid ? (
          <>
            <h1 className="text-foreground">Tack för din beställning!</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Din betalning är bekräftad. <span className="font-medium">{TA_FOR_ER_ORDER.bookTitle}</span> av{" "}
              {TA_FOR_ER_ORDER.authorName} skickas till adressen du angav. Frakten ingår. Du får ett kvitto
              via e-post.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-foreground">Beställningsstatus</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Vi väntar på en bekräftelse på din betalning. Om statusen inte uppdateras, titta in igen om en
              liten stund.
            </p>
          </>
        )}

        <div className={styles.actions}>
          <Link
            href="/waitlist"
            className={styles.primary}
          >
            Tillbaka till verkli
          </Link>
        </div>
      </section>
    </main>
  );
}
