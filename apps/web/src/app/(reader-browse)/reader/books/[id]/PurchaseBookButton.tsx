"use client";

import { useState } from "react";

type Props = {
  bookId: string;
  amount: number;
  currency: string;
};

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
      const res = await fetch(`/api/books/${bookId}/purchase/checkout`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(String(body?.error ?? "Could not start checkout"));
        setLoading(false);
        return;
      }

      const checkoutUrl = typeof body?.checkoutUrl === "string" ? body.checkoutUrl : "";
      if (!checkoutUrl) {
        setError("Missing checkout URL");
        setLoading(false);
        return;
      }

      window.location.assign(checkoutUrl);
    } catch {
      setError("Could not start checkout");
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
        {loading ? "Opening checkout..." : `Buy book (${formatMoney(amount, currency)})`}
      </button>
      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
