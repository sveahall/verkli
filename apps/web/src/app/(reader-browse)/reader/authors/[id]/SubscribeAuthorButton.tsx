"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format-money";

type Props = {
  authorId: string;
  priceMonthlyMinor: number;
  currency: string;
  isSignedIn: boolean;
  signInHref: string;
  initialSubscribed: boolean;
};

export default function SubscribeAuthorButton({
  authorId,
  priceMonthlyMinor,
  currency,
  isSignedIn,
  signInHref,
  initialSubscribed,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(initialSubscribed);

  if (subscribed) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2.5 text-[13px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-800/40">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Subscribed
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <a
        href={signInHref}
        className="rounded-full bg-white/10 px-4 py-2.5 text-[13px] font-semibold text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/20"
      >
        Subscribe · {formatMoney(priceMonthlyMinor, currency, 0)}/mo
      </a>
    );
  }

  const handleSubscribe = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/authors/${authorId}/subscribe`, { method: "POST" });
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        const errorKey = typeof body.error === "string" ? body.error : null;
        if (errorKey === "ALREADY_SUBSCRIBED") {
          setSubscribed(true);
          return;
        }
        setError(
          errorKey === "SUBSCRIPTION_PLAN_NOT_FOUND"
            ? "Subscription not available right now."
            : "Could not start subscription. Try again."
        );
        return;
      }

      const checkoutUrl = typeof body.checkoutUrl === "string" ? body.checkoutUrl : "";
      if (!checkoutUrl) {
        setError("Could not start checkout. Try again.");
        return;
      }

      window.location.assign(checkoutUrl);
    } catch {
      setError("Could not start checkout. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className="rounded-full bg-white/10 px-4 py-2.5 text-[13px] font-semibold text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Opening checkout…" : `Subscribe · ${formatMoney(priceMonthlyMinor, currency, 0)}/mo`}
      </button>
      {error ? (
        <p className="text-[12px] text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
