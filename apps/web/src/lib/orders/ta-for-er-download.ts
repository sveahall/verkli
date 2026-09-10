/**
 * Server-only helpers behind the "Ta för er!" e-book download.
 *
 * Both the success page and the download route need the same two answers —
 * "has this session paid for the download?" and "which files actually exist?"
 * — and they must not drift. If the page offered a format the route refuses,
 * the buyer gets a dead button after paying; if the page were laxer about who
 * counts as a buyer, it would name files to someone who did not.
 *
 * Never import this from a client component: it reads the service-role key.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { TA_FOR_ER_DOWNLOAD_BUCKET, TA_FOR_ER_EBOOK_FORMATS } from "./ta-for-er";

export type TaForErFormat = (typeof TA_FOR_ER_EBOOK_FORMATS)[number];

/**
 * Paid, one of ours, and the download product — all three.
 *
 * The variant check is the load-bearing one. Without it every 249 kr
 * paperback order would also unlock the file, including orders placed before
 * the e-book existed.
 */
export async function sessionEntitlesDownload(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const session = await getStripeCheckoutSession(sessionId);
    return (
      session.payment_status === "paid" &&
      session.metadata?.payment_kind === "book_order" &&
      session.metadata?.order_variant === "ebook"
    );
  } catch {
    return false;
  }
}

/**
 * Which formats are really in the bucket.
 *
 * Listed rather than assumed. The config names PDF and EPUB so the second can
 * be added by uploading a file, with no deploy — but a format whose file is
 * missing must not show up as a button that fails after payment.
 */
export async function availableDownloadFormats(): Promise<TaForErFormat[]> {
  const admin = createAdminClient();
  const found: TaForErFormat[] = [];

  for (const fmt of TA_FOR_ER_EBOOK_FORMATS) {
    const slash = fmt.path.lastIndexOf("/");
    const dir = slash === -1 ? "" : fmt.path.slice(0, slash);
    const file = slash === -1 ? fmt.path : fmt.path.slice(slash + 1);

    const { data, error } = await admin.storage
      .from(TA_FOR_ER_DOWNLOAD_BUCKET)
      .list(dir, { search: file, limit: 100 });

    if (error) {
      // A bucket that does not exist yet is the normal state before the first
      // upload, not an error worth failing the page over.
      continue;
    }
    if ((data ?? []).some((entry) => entry.name === file)) found.push(fmt);
  }

  return found;
}
