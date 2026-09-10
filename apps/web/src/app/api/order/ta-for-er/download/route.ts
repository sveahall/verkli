import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { getClientIpFromRequest } from "@/lib/request-ip";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  apiError,
  E_RATE_LIMIT_EXCEEDED,
  E_INVALID_REQUEST_BODY,
  E_SERVER_CONFIG_ERROR,
} from "@/lib/api-errors";
import { TA_FOR_ER_DOWNLOAD_BUCKET } from "@/lib/orders/ta-for-er";
import {
  availableDownloadFormats,
  sessionEntitlesDownload,
} from "@/lib/orders/ta-for-er-download";

export const runtime = "nodejs";

/**
 * Hands a paying buyer their file.
 *
 *   GET /api/order/ta-for-er/download?session_id=cs_…            -> what they can download
 *   GET /api/order/ta-for-er/download?session_id=cs_…&format=pdf -> 302 to a signed URL
 *
 * The proof of purchase is the Stripe session itself. There is no account and
 * no DB row — the printed-copy order works the same way, and BETA_LOCK means a
 * buyer cannot be sent into the reader app to collect what they paid for.
 *
 * What is checked before anything is signed:
 *   - the session exists and Stripe says `payment_status === "paid"`
 *   - it is one of ours (`payment_kind === "book_order"`)
 *   - it is the DOWNLOAD, not the printed copy (`order_variant === "ebook"`).
 *     Without that last one, anyone who bought the 249 kr paperback would also
 *     get the file, and every earlier print order would retroactively include
 *     a product it never paid for.
 *
 * The link is signed for 60 minutes and the bucket is private, so a URL that
 * leaks stops working; the buyer can always come back to the success page and
 * get a fresh one, because it is derived from the session id.
 *
 * Known gap, deliberate: nothing is emailed. Close the tab and the only way
 * back is the Stripe receipt, which does not carry the link. Wiring that needs
 * a `checkout.session.completed` handler AND the live endpoint subscribed to
 * that event — a handler alone is dead code here, which is exactly how
 * `charge.refunded` shipped doing nothing (see check:stripe-webhook).
 */

const downloadLimiter = createPerUserRateLimiter({ maxPerMinute: 20 });

const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET(request: Request) {
  if (!isStripeConfigured()) {
    return apiError(E_SERVER_CONFIG_ERROR, 503);
  }

  const rl = await downloadLimiter.check(getClientIpFromRequest(request));
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const url = new URL(request.url);
  const sessionId = (url.searchParams.get("session_id") ?? "").trim();
  const format = (url.searchParams.get("format") ?? "").trim();

  if (!sessionId) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  if (!(await sessionEntitlesDownload(sessionId))) {
    // Same answer for "no such session", "not paid" and "bought the paperback".
    // Telling them apart would let someone probe session ids for their status.
    return NextResponse.json({ error: "NOT_ENTITLED" }, { status: 403 });
  }

  const present = await availableDownloadFormats();

  // No format asked for: say what is on offer, so the success page can render
  // only the buttons that will work.
  if (!format) {
    return NextResponse.json({
      formats: present.map((f) => ({ id: f.id, label: f.label, hint: f.hint })),
    });
  }

  const chosen = present.find((f) => f.id === format);
  if (!chosen) {
    return NextResponse.json({ error: "FORMAT_UNAVAILABLE" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(TA_FOR_ER_DOWNLOAD_BUCKET)
    .createSignedUrl(chosen.path, SIGNED_URL_TTL_SECONDS, { download: true });

  if (error || !data?.signedUrl) {
    console.error("[order.ta-for-er.download] signing failed", {
      format: chosen.id,
      message: error?.message,
    });
    return apiError(E_SERVER_CONFIG_ERROR, 500);
  }

  return NextResponse.redirect(data.signedUrl, 302);
}
