"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type Plan = "per_language" | "pro";

type TranslationCheckoutModalProps = {
  open: boolean;
  onClose: () => void;
  bookId: string;
  sourceVersionId: string;
  languages: string[];
  /** Called when user picks Pro subscription and should be redirected to billing. */
  onProSubscribe: () => void;
  /** Called after successful per-language checkout redirect. */
  onCheckoutStarted?: () => void;
};

export default function TranslationCheckoutModal({
  open,
  onClose,
  bookId,
  sourceVersionId,
  languages,
  onProSubscribe,
  onCheckoutStarted,
}: TranslationCheckoutModalProps) {
  const [plan, setPlan] = useState<Plan>("per_language");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const languageCount = languages.length;
  const perLanguagePrice = 199;
  const totalPrice = perLanguagePrice * languageCount;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleSubmit = useCallback(async () => {
    if (loading) return;

    if (plan === "pro") {
      onProSubscribe();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/translate/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languages, sourceVersionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(
          typeof data.detail === "string"
            ? data.detail
            : "Could not start checkout. Try again."
        );
        return;
      }
      onCheckoutStarted?.();
      window.location.href = data.url;
    } catch {
      setError("Could not start checkout. Try again.");
    } finally {
      setLoading(false);
    }
  }, [plan, loading, bookId, languages, sourceVersionId, onProSubscribe, onCheckoutStarted]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70"
          aria-label="Close"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2 className="mb-6 text-center text-lg font-semibold text-slate-900 dark:text-white">
          Choose plan to translate book
        </h2>

        <div className="space-y-4">
          {/* Pay per translation */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-4 transition ${
              plan === "per_language"
                ? "border-[#907AFF] bg-[#907AFF]/5"
                : "border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"
            }`}
          >
            <input
              type="radio"
              name="translate-plan"
              value="per_language"
              checked={plan === "per_language"}
              onChange={() => setPlan("per_language")}
              className="mt-0.5 h-4 w-4 accent-[#907AFF]"
            />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Pay per translation</p>
              <p className="text-sm text-slate-500 dark:text-white/50">
                {perLanguagePrice} kr / language
                {languageCount > 1 && (
                  <span className="ml-1 text-slate-400 dark:text-white/30">
                    ({languageCount} languages = {totalPrice} kr)
                  </span>
                )}
              </p>
            </div>
          </label>

          {/* Subscribe to PRO */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-4 transition ${
              plan === "pro"
                ? "border-[#907AFF] bg-[#907AFF]/5"
                : "border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"
            }`}
          >
            <input
              type="radio"
              name="translate-plan"
              value="pro"
              checked={plan === "pro"}
              onChange={() => setPlan("pro")}
              className="mt-0.5 h-4 w-4 accent-[#907AFF]"
            />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Subscribe to PRO author</p>
              <p className="mb-2 text-sm text-slate-500 dark:text-white/50">2 490 kr / month</p>
              <ul className="space-y-1 text-sm text-slate-600 dark:text-white/60">
                {["Unlimited translations", "Audiobook generation", "Marketing tools", "Analytics"].map(
                  (feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <svg className="h-4 w-4 shrink-0 text-[#907AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  )
                )}
              </ul>
            </div>
          </label>
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading || languageCount === 0}
          className="mt-6 block w-full rounded-full bg-[#907AFF] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? "Redirecting..."
            : plan === "pro"
              ? "Subscribe to PRO"
              : "Translate full book"}
        </button>
      </div>
    </div>
  );
}
