import Link from "next/link";
import { BookOpen, Clock3, Download } from "lucide-react";
import styles from "@/components/public/PublicPage.module.css";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { TA_FOR_ER_ORDER } from "@/lib/orders/ta-for-er";
import { availableDownloadFormats } from "@/lib/orders/ta-for-er-download";

export const runtime = "nodejs";

/**
 * One confirmation page, two products.
 *
 * The printed copy gets posted, so the page says so and stops. The download
 * has to hand over the file here: there is no account to log into and nothing
 * is emailed yet, so this page is the delivery.
 *
 * Which one it is comes from the Stripe session's `order_variant`, never from
 * the URL. A buyer who edits the query string must not be able to talk the
 * page into offering a file.
 */
export default async function TaForErSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const sessionId = String(session_id ?? "").trim();

  let paid = false;
  let isEbook = false;
  if (sessionId) {
    try {
      const session = await getStripeCheckoutSession(sessionId);
      // Only confirm when this session is genuinely a "Ta för er!" book order —
      // a paid donation/subscription session_id must not show this confirmation.
      paid =
        session.payment_status === "paid" &&
        session.metadata?.payment_kind === "book_order";
      isEbook = paid && session.metadata?.order_variant === "ebook";
    } catch {
      /* ignore — show the pending message below */
    }
  }

  // Only listed for a paid download, so an unpaid visitor never learns what
  // files exist.
  const formats = isEbook ? await availableDownloadFormats() : [];

  return (
    <main className={styles.page}>
      <section className={styles.status}>
        <div className={styles.statusIcon}>
          {isEbook ? (
            <Download size={25} aria-hidden="true" />
          ) : paid ? (
            <BookOpen size={25} aria-hidden="true" />
          ) : (
            <Clock3 size={25} aria-hidden="true" />
          )}
        </div>

        {paid && isEbook ? (
          <>
            <h1 className="text-foreground">Tack! Här är din bok.</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Betalningen är bekräftad. <span className="font-medium">{TA_FOR_ER_ORDER.bookTitle}</span> av{" "}
              {TA_FOR_ER_ORDER.authorName} är din — ladda ner i det format du vill ha. Du får ett kvitto via
              e-post.
            </p>

            {formats.length > 0 ? (
              <>
                <div className={styles.actions}>
                  {formats.map((fmt) => (
                    <a
                      key={fmt.id}
                      href={`/api/order/ta-for-er/download?session_id=${encodeURIComponent(sessionId)}&format=${fmt.id}`}
                      className={styles.primary}
                    >
                      <Download size={16} aria-hidden="true" />
                      Ladda ner {fmt.label}
                    </a>
                  ))}
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                  Spara filen direkt. Länken gäller en timme, men du kan alltid komma tillbaka hit och hämta
                  en ny — spara den här sidan.
                </p>
              </>
            ) : (
              // Paid, but no file in the bucket. Say so plainly instead of
              // rendering a button that fails: the buyer has already been
              // charged and needs to know a human will sort it out.
              <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
                Din betalning gick igenom, men filen ligger inte uppe än. Vi hör av oss till dig på e-post så
                fort den finns — du behöver inte göra något.
              </p>
            )}
          </>
        ) : paid ? (
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
          <Link href="/waitlist" className={paid && isEbook ? styles.secondary : styles.primary}>
            Tillbaka till verkli
          </Link>
        </div>
      </section>
    </main>
  );
}
