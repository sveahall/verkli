import { NextResponse } from "next/server";
import {
  createBookOrderCheckoutSession,
  isStripeConfigured,
} from "@/lib/payments/stripe";
import { getRequestBaseUrl } from "@/lib/request-url";
import { getClientIpFromRequest } from "@/lib/request-ip";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  apiError,
  E_RATE_LIMIT_EXCEEDED,
  E_INVALID_REQUEST_BODY,
  E_SERVER_CONFIG_ERROR,
  E_CHECKOUT_SESSION_FAILED,
} from "@/lib/api-errors";
import {
  TA_FOR_ER_ORDER,
  TA_FOR_ER_PRODUCT_NAME,
  TA_FOR_ER_EBOOK,
  TA_FOR_ER_EBOOK_PRODUCT_NAME,
} from "@/lib/orders/ta-for-er";

export const runtime = "nodejs";

// Anonymous public endpoint — rate-limit by client IP to deter abuse.
const orderLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim, collapse whitespace, and enforce a max length on a required field. */
function cleanRequired(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

/** Same as cleanRequired but allows empty (returns "" for missing). */
function cleanOptional(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return apiError(E_SERVER_CONFIG_ERROR, 503);
  }

  const rl = await orderLimiter.check(getClientIpFromRequest(request));
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  // Two products, one endpoint: a printed copy that needs an address, and a
  // download that needs nothing but an email to send the receipt to. Anything
  // that is not exactly "ebook" is treated as the printed copy, so an older
  // client that posts no variant keeps working unchanged.
  const isEbook = body.variant === "ebook";

  const emailRaw = cleanRequired(body.email, 200);
  if (!emailRaw) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }
  const email = emailRaw.toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const name = cleanRequired(body.name, 120);
  const line1 = cleanRequired(body.line1, 200);
  const postalCode = cleanRequired(body.postalCode, 20);
  const city = cleanRequired(body.city, 120);
  const line2 = cleanOptional(body.line2, 200);
  const phone = cleanOptional(body.phone, 40);

  // Address fields are required for the printed copy only. Demanding them for
  // a download would be asking a buyer for their home address to send them a
  // file, which is both pointless and a reason not to buy.
  if (!isEbook && (!name || !line1 || !postalCode || !city)) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const baseUrl = getRequestBaseUrl(request);

  try {
    const session = await createBookOrderCheckoutSession({
      amountMinor: isEbook ? TA_FOR_ER_EBOOK.priceMinor : TA_FOR_ER_ORDER.priceMinor,
      currency: isEbook ? TA_FOR_ER_EBOOK.currency : TA_FOR_ER_ORDER.currency,
      productName: isEbook ? TA_FOR_ER_EBOOK_PRODUCT_NAME : TA_FOR_ER_PRODUCT_NAME,
      customerEmail: email,
      orderVariant: isEbook ? "ebook" : "print",
      shipping: isEbook
        ? undefined
        : {
            name: name!,
            line1: line1!,
            line2: line2 || undefined,
            postalCode: postalCode!,
            city: city!,
            country: "SE",
            phone: phone || undefined,
          },
      successUrl: `${baseUrl}/order/ta-for-er/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/waitlist?order=cancelled`,
    });

    if (!session.url) {
      throw new Error("Stripe session URL is missing");
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[order.ta-for-er] stripe session failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_CHECKOUT_SESSION_FAILED, 500);
  }
}
