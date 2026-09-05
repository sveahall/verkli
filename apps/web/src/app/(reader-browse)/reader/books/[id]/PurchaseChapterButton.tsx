"use client";

import { useState } from "react";
import { API_ROUTES } from "@/lib/api-routes";
import { formatMoney } from "@/lib/format-money";

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
  CHECKOUT_START_FAILED: "Could not start checkout. Try again.",
  CHECKOUT_SESSION_FAILED: "Checkout session failed. Try again.",
  UNAUTHORIZED: "You need to sign in.",
  FORBIDDEN: "Access denied.",
};

const DEFAULT_CHECKOUT_ERROR = "Something went wrong. Try again.";

function resolveCheckoutError(key: string | null | undefined): string {
  if (!key) return DEFAULT_CHECKOUT_ERROR;
  return CHECKOUT_ERRORS[key] ?? DEFAULT_CHECKOUT_ERROR;
}


export default function PurchaseChapterButton({ bookId, chapterId, amount, currency, label }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(API_ROUTES.bookPurchaseCheckout(bookId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapterId }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(resolveCheckoutError(body?.error));
        setLoading(false);
        return;
      }

      const checkoutUrl = typeof body?.checkoutUrl === "string" ? body.checkoutUrl : "";
      if (!checkoutUrl) {
        setError("Could not start checkout. Try again.");
        setLoading(false);
        return;
      }

      window.location.assign(checkoutUrl);
    } catch {
      setError("Could not start checkout. Try again.");
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
      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
