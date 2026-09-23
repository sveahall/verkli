"use client";

import { useState } from "react";

type Props = {
  initialEnabled: boolean;
  initialPriceMonthly: number;
  initialCurrency: string;
  initialDescription: string | null;
  savePlan?: (plan: { enabled: boolean; price_monthly: number; currency: string; description: string | null }) => Promise<Response>;
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
  savePlan,
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
      const plan = { enabled, price_monthly: priceMinor, currency, description: description.trim() || null };
      const res = savePlan ? await savePlan(plan) : await fetch("/api/author/subscription-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
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
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-7" onChange={() => setStatus("idle")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-medium">Reader subscriptions</h2>
          <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">
            Offer readers a monthly membership with access to all your books.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Enable reader subscriptions"
          aria-checked={enabled}
          disabled={saving}
          onClick={() => { setEnabled((v) => !v); setStatus("idle"); }}
          className="relative inline-flex min-h-11 w-12 flex-shrink-0 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-60"
        >
          <span className={`relative h-7 w-12 rounded-full border border-border transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute left-1 top-1 h-[18px] w-[18px] rounded-full shadow-sm transition-transform ${enabled ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground"}`} />
          </span>
        </button>
      </div>

      {enabled && (
        <fieldset disabled={saving} className="mt-5 grid min-w-0 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="subscription-price" className="text-sm font-medium">
              Monthly price
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                id="subscription-price"
                min="1"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input-base min-h-11 min-w-0 w-full text-base sm:text-sm"
                placeholder="49"
              />
              <select
                aria-label="Subscription currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input-base min-h-11 !w-24 shrink-0 text-base sm:text-sm"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[12px] text-muted-foreground dark:text-muted-foreground">
              Readers pay this amount every month for unlimited access.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="subscription-description" className="text-sm font-medium">
              What&apos;s included <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="subscription-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="e.g. Access to all books, early chapters, and exclusive updates."
              className="input-base min-h-28 w-full resize-y text-base sm:text-sm"
            />
          </div>
        </fieldset>
      )}
      {!enabled && <p className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">Reader subscriptions are off. Enable them to set a monthly price, then save your subscription settings.</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-11 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save subscription settings"}
        </button>
        <p role={status === "error" ? "alert" : "status"} aria-live="polite" className={`min-h-5 text-sm ${status === "ok" ? "text-emerald-700 dark:text-emerald-400" : status === "error" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
          {saving ? "Saving subscription settings…" : status === "ok" ? "Subscription settings saved." : status === "error" ? errorMessage || "Could not save subscription settings." : "Saved separately from account preferences."}
        </p>
      </div>
    </section>
  );
}
