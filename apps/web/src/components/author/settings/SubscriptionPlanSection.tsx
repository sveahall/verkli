"use client";

import { useState } from "react";

type Props = {
  initialEnabled: boolean;
  initialPriceMonthly: number;
  initialCurrency: string;
  initialDescription: string | null;
};

const CURRENCY_OPTIONS = [
  { value: "sek", label: "SEK — Swedish krona" },
  { value: "eur", label: "EUR — Euro" },
  { value: "usd", label: "USD — US dollar" },
  { value: "gbp", label: "GBP — British pound" },
];

export default function SubscriptionPlanSection({
  initialEnabled,
  initialPriceMonthly,
  initialCurrency,
  initialDescription,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [price, setPrice] = useState(String(Math.round(initialPriceMonthly / 100)));
  const [currency, setCurrency] = useState(initialCurrency);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setStatus("idle");

    const priceMinor = Math.round(parseFloat(price) * 100);
    if (!Number.isFinite(priceMinor) || priceMinor < 100) {
      setErrorMessage("Enter a monthly price of at least 1.");
      setStatus("error");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/author/subscription-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          price_monthly: priceMinor,
          currency,
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(body.error ?? "Could not save subscription settings.");
        setStatus("error");
        return;
      }
      setErrorMessage("");
      setStatus("ok");
    } catch {
      setErrorMessage("Could not save subscription settings.");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white px-7 py-5 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-section-title">Reader subscriptions</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/45">
            Let readers pay a monthly fee for access to all your books — like a personal membership.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={`relative mt-0.5 h-6 w-10 flex-shrink-0 rounded-full transition-colors ${
            enabled
              ? "bg-[#907AFF]"
              : "bg-slate-200 dark:bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900 dark:text-white">
              Monthly price
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input-base min-h-[44px] w-full text-[14px]"
                placeholder="49"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input-base min-h-[44px] shrink-0 text-[14px]"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[12px] text-slate-400 dark:text-white/30">
              Readers pay this amount every month for unlimited access.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900 dark:text-white">
              What&apos;s included <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="e.g. Access to all books, early chapters, and exclusive updates."
              className="input-base w-full resize-none text-[14px]"
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] rounded-full bg-[#0F172A] px-5 py-2 text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] transition hover:bg-[#1E293B] hover:shadow-[0_6px_16px_rgba(15,23,42,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save subscription settings"}
        </button>
        {status === "ok" && (
          <span className="text-[13px] text-emerald-600 dark:text-emerald-400">Saved</span>
        )}
        {status === "error" && (
          <span className="text-[13px] text-red-600 dark:text-red-400">
            {errorMessage || "Could not save subscription settings."}
          </span>
        )}
      </div>
    </section>
  );
}
