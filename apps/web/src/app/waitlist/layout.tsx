import type { Metadata } from "next";
import { TA_FOR_ER_ORDER } from "@/lib/orders/ta-for-er";

/**
 * `openGraph` and `twitter` are set explicitly, and that is the point.
 *
 * Next does NOT derive them from `title`/`description` — a page that sets only
 * those still inherits the root layout's `openGraph` block. That is what
 * happened here: the `<title>` tag was right, while every link preview showed
 * the generic "Verkli — the platform for authors and readers" instead of the
 * book this page exists to sell.
 *
 * Swedish deliberately. The book, the order form and the Stripe receipt are all
 * Swedish, and `app/waitlist` sits outside `check-english-default`'s SCOPE
 * (which covers the reader and author route groups), so matching the page is
 * correct here rather than a gate violation.
 */
// Book-first, because that is what a recipient of this link can act on today.
// The waitlist sign-up is still on the page, above the order section.
const title = `Beställ ${TA_FOR_ER_ORDER.bookTitle} — ${TA_FOR_ER_ORDER.authorName}`;
const description = `Beställ ${TA_FOR_ER_ORDER.bookTitle} av ${TA_FOR_ER_ORDER.authorName}. ${TA_FOR_ER_ORDER.priceLabel}, frakt ingår.`;

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: "Verkli",
    url: "/waitlist",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
