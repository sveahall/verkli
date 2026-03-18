"use client";

import { useState } from "react";
import { API_ROUTES } from "@/lib/api-routes";
import type { BookFormat } from "@/app/(app-author)/author/books/[id]/editor/panels/PrintPanel.helpers";

type FormatOption = {
  format: BookFormat;
  label: string;
  priceMinor: number;
  currency: string;
};

type Props = {
  bookId: string;
  formats: FormatOption[];
};

const CHECKOUT_ERRORS: Record<string, string> = {
  POD_NOT_ENABLED: "Print on demand is not available for this book.",
  POD_FORMAT_UNAVAILABLE: "This format is not available.",
  POD_PRICE_NOT_SET: "Price has not been set for this format.",
  AUTHOR_CANNOT_BUY_OWN_BOOK: "You can't order your own book.",
  CHECKOUT_START_FAILED: "Could not start checkout. Try again.",
  CHECKOUT_SESSION_FAILED: "Checkout session failed. Try again.",
  UNAUTHORIZED: "You need to sign in.",
};

const DEFAULT_ERROR = "Something went wrong. Try again.";

function resolveError(key: string | null | undefined): string {
  if (!key) return DEFAULT_ERROR;
  return CHECKOUT_ERRORS[key] ?? DEFAULT_ERROR;
}

function formatMoney(amount: number, currency: string): string {
  const value = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toFixed(0)} ${currency.toUpperCase()}`;
  }
}

export default function OrderPhysicalCopyButton({ bookId, formats }: Props) {
  const [selectedFormat, setSelectedFormat] = useState<BookFormat>(formats[0].format);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = formats.find((f) => f.format === selectedFormat) ?? formats[0];

  const handleOrder = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(API_ROUTES.podCheckout(bookId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: selected.format }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(resolveError(body?.error));
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
    <div className="space-y-3">
      {formats.length > 1 && (
        <div className="flex items-center gap-2">
          {formats.map((f) => (
            <button
              key={f.format}
              type="button"
              onClick={() => { setSelectedFormat(f.format); setError(null); }}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                selectedFormat === f.format
                  ? "bg-[#907AFF] text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={handleOrder}
        disabled={loading}
        className="rounded-full border border-amber-600/30 bg-amber-500/10 px-6 py-3 text-[14px] font-semibold text-amber-800 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/30 dark:text-amber-300 dark:hover:bg-amber-500/15"
      >
        {loading
          ? "Opening checkout..."
          : `Order ${selected.label.toLowerCase()} (${formatMoney(selected.priceMinor, selected.currency)})`}
      </button>
      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
