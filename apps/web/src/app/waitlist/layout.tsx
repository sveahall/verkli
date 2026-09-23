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
 * English, matching the page's own visible headings ("Limited access", "Join the
 * waitlist as an author"). This page is now the public face of verkli.com under
 * BETA_LOCK, which puts it squarely under the English-first policy for public
 * pages that `check-english-default` enforces elsewhere. The book section below
 * stays Swedish, because the book, the order form and the Stripe receipt are.
 */
// WAITLIST-FIRST. This was deliberately book-first until 2026-09-07, on the
// reasoning that "the recipient of this link can act on the book today". Both
// halves of that stopped being true on the same day:
//
//   1. BETA_LOCK is on, so `/waitlist` is no longer a link someone is sent — it
//      is where EVERY visitor to verkli.com lands. The audience went from one
//      recipient to the whole public.
//   2. They cannot act on it. Production still carries a Stripe TEST key, so a
//      real card is declined at checkout. See docs/audit-2026-09-07.md.
//
// A title advertising a purchase that cannot complete, on the front door of a
// pre-launch platform, sells the wrong thing twice over. The book is still on
// the page and still in the description; it is just no longer the headline.
//
// If the live Stripe key lands and the book becomes the point of this link
// again, flipping this back is reasonable — but check the key first.
const title = "Join the waitlist — private pre-launch";
const description = `Verkli is in private pre-launch. Join the waitlist for early access as an author or reader. ${TA_FOR_ER_ORDER.bookTitle} by ${TA_FOR_ER_ORDER.authorName} can also be ordered from this page.`;

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
