"use client";

import { useState } from "react";
import { API_ROUTES } from "@/lib/api-routes";
import { formatMoney } from "@/lib/format-money";
import { isUsableCheckoutUrl, validatePurchaseStatusUrl } from "@/lib/payments/checkout-status-url";

type Props = {
  bookId: string;
  chapterId: string;
  amount: number;
  currency: string;
  label?: string;
};

const CHECKOUT_ERRORS: Record<string, string> = {
  AUTHOR_CANNOT_BUY_OWN_BOOK: "You can't purchase your own book.",
  BOOK_IS_FREE: "This book is free.",
  ALREADY_UNLOCKED: "You already have access to this chapter.",
  CHECKOUT_START_FAILED: "We couldn't confirm your checkout status. Do not pay again. Check purchase status if available, or contact support.",
  CHECKOUT_SESSION_FAILED: "We couldn't confirm your checkout status. Do not pay again. Check purchase status if available, or contact support.",
  CHECKOUT_PAYMENT_RECORDED: "Your payment is recorded, but access still needs confirmation. Do not pay again. Check purchase status if available, or contact support.",
  CHECKOUT_PROCESSING: "We couldn't confirm your payment status. Do not pay again. Check purchase status if available, or contact support.",
  CHECKOUT_UNAVAILABLE: "We couldn't verify purchase availability. Do not pay again. Contact support to check your purchase.",
  CHECKOUT_HISTORY_UNAVAILABLE: "We can't verify your full checkout history here. Do not pay again. Contact support to review your purchase.",
  CHAPTER_CHECKOUT_UNAVAILABLE: "Chapter checkout is unavailable. Do not pay again. Contact support if you've already attempted a purchase.",
  UNAUTHORIZED: "You need to sign in.",
  FORBIDDEN: "Access denied.",
};

const DEFAULT_CHECKOUT_ERROR = "We couldn't confirm your checkout status. Do not pay again. Check purchase status if available, or contact support.";

function resolveCheckoutError(key: unknown): string {
  if (typeof key !== "string" || !Object.hasOwn(CHECKOUT_ERRORS, key)) return DEFAULT_CHECKOUT_ERROR;
  return CHECKOUT_ERRORS[key];
}


export default function PurchaseChapterButton({ bookId, chapterId, amount, currency, label }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseStatusUrl, setPurchaseStatusUrl] = useState<string | null>(null);

  const handlePurchase = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);
    setPurchaseStatusUrl(null);

    try {
      const res = await fetch(API_ROUTES.bookPurchaseCheckout(bookId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapterId }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(resolveCheckoutError(body?.error));
        setPurchaseStatusUrl(validatePurchaseStatusUrl(bookId, body?.purchaseStatusUrl));
        setLoading(false);
        return;
      }

      const checkoutUrl = typeof body?.checkoutUrl === "string" ? body.checkoutUrl : "";
      if (!isUsableCheckoutUrl(checkoutUrl)) {
        setError(DEFAULT_CHECKOUT_ERROR);
        setLoading(false);
        return;
      }

      window.location.assign(checkoutUrl);
    } catch {
      setError(DEFAULT_CHECKOUT_ERROR);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handlePurchase}
        disabled={loading}
        // ~30px before this, on the control that takes the money — in the
        // chapter list and on the paywall a reader hits mid-book. min-h-11 is
        // the DESIGN.md:159 minimum; the h-11 siblings in the paywall card
        // already sit at that height, so this also stops it looking undersized
        // next to them.
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#907AFF] px-5 text-[14px] font-semibold text-white transition hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "..." : label ?? `Buy (${formatMoney(amount, currency)})`}
      </button>
      {error ? (
        <div role="alert" aria-live="polite" aria-atomic="true" className="space-y-1 text-xs">
          <p className="text-rose-600 dark:text-rose-400">{error}</p>
          {purchaseStatusUrl ? (
            <a href={purchaseStatusUrl} className="inline-block text-slate-900 underline underline-offset-2 dark:text-white">
              Check purchase status
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
