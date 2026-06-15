"use client";

import { useState } from "react";

type Props = {
  currentPriceAmount: number | null;
  currentPriceCurrency: string;
  onComplete: () => void;
};

export default function PricingStep({ currentPriceAmount, currentPriceCurrency, onComplete }: Props) {
  const isFree = currentPriceAmount === null || currentPriceAmount === 0;
  const [choice, setChoice] = useState<"free" | "paid">(isFree ? "free" : "paid");
  const priceDisplay = currentPriceAmount
    ? `${(currentPriceAmount / 100).toFixed(0)} ${currentPriceCurrency}`
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-6 py-6 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#907AFF]">Step 6</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Set your price
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-slate-500 dark:text-white/50">
          {priceDisplay
            ? `Your book is currently priced at ${priceDisplay}. You can change this from the dashboard later.`
            : "Choose whether your book is free or paid. You can adjust pricing from the dashboard anytime."}
        </p>
      </div>

      <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setChoice("free")}
          className={`rounded-xl border px-4 py-4 text-center transition ${
            choice === "free"
              ? "border-[#907AFF] ring-1 ring-[#907AFF]/30"
              : "border-slate-100 hover:border-slate-200 dark:border-white/[0.08] dark:hover:border-white/[0.15]"
          }`}
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-white/90">Free</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-white/40">Open to all readers</p>
        </button>
        <button
          type="button"
          onClick={() => setChoice("paid")}
          className={`rounded-xl border px-4 py-4 text-center transition ${
            choice === "paid"
              ? "border-[#907AFF] ring-1 ring-[#907AFF]/30"
              : "border-slate-100 hover:border-slate-200 dark:border-white/[0.08] dark:hover:border-white/[0.15]"
          }`}
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-white/90">Paid</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-white/40">
            {priceDisplay ?? "Set price later"}
          </p>
        </button>
      </div>

      {choice === "paid" && !priceDisplay && (
        <p className="text-[13px] text-slate-400 dark:text-white/40">
          You can set the exact price from the dashboard after completing setup.
        </p>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onComplete}
          className="rounded-full bg-[#0F172A] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E293B]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
