"use client";

import { useState } from "react";
import { API_ROUTES } from "@/lib/api-routes";

type Props = {
  bookId: string;
  amount: number;
  currency: string;
};

const CHECKOUT_ERRORS: Record<string, string> = {
  AUTHOR_CANNOT_BUY_OWN_BOOK: "You can't purchase your own book.",
  BOOK_IS_FREE: "This book is free.",
  ALREADY_UNLOCKED: "You already have access to this book.",
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

function formatMoney(amount: number, currency: string): string {
  const value = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default function PurchaseBookButton({ bookId, amount, currency }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      // Canonical purchase checkout path.
      const res = await fetch(API_ROUTES.bookPurchaseCheckout(bookId), {
        method: "POST",
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
    <div className="space-y-2">
      <button
        type="button"
        onClick={handlePurchase}
        disabled={loading}
        className="rounded-full bg-[#907AFF] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Opening checkout…" : `Buy book (${formatMoney(amount, currency)})`}
      </button>
      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
