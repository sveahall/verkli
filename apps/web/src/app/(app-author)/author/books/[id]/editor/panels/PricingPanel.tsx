"use client";

import type { Chapter } from "../BookEditorView.types";

interface PricingPanelProps {
  chapters: Chapter[];
  priceAmountMinor: number;
  setPriceAmountMinor: (v: number) => void;
  priceCurrency: string;
  setPriceCurrency: (v: string) => void;
  pricingModel: "book_only" | "per_chapter";
  setPricingModel: (v: "book_only" | "per_chapter") => void;
  pricingSaving: boolean;
  pricingDirty: boolean;
  pricingError: string | null;
  pricingSaved: boolean;
  handleSavePricing: () => void;
  isPublished: boolean;
  stripeConfigured: boolean;
  currentVisibility: string;
}

export default function PricingPanel({
  chapters,
  priceAmountMinor,
  setPriceAmountMinor,
  priceCurrency,
  setPriceCurrency,
  pricingModel,
  setPricingModel,
  pricingSaving,
  pricingDirty,
  pricingError,
  pricingSaved,
  handleSavePricing,
  isPublished,
  stripeConfigured,
  currentVisibility,
}: PricingPanelProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="author-section-title text-[clamp(20px,2.5vw,24px)] font-medium tracking-[-0.02em] text-foreground dark:text-foreground">Pricing and distribution</h2>

      <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-border dark:bg-card dark:shadow-none space-y-4">
        <h3 className="text-sm font-semibold text-foreground dark:text-foreground">Price and currency</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-foreground dark:text-foreground">Free</span>
          <button
            type="button"
            role="switch"
            aria-checked={priceAmountMinor > 0}
            aria-label="Book free or paid"
            onClick={() => setPriceAmountMinor(priceAmountMinor > 0 ? 0 : 4900)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 ${
              priceAmountMinor > 0 ? "bg-[#907AFF]" : "bg-muted dark:bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                priceAmountMinor > 0 ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-foreground dark:text-foreground">Paid</span>
        </div>
        {priceAmountMinor > 0 && (
          <div className="flex flex-wrap gap-4 pt-2">
            <div>
              <label htmlFor="price-amount" className="mb-1 block text-xs text-muted-foreground dark:text-muted-foreground">{pricingModel === "per_chapter" ? "Price per chapter" : "Price (shown to readers)"}</label>
              <input
                id="price-amount"
                type="number"
                min={0}
                step={1}
                value={priceAmountMinor / 100}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isFinite(v) || v < 0) return;
                  setPriceAmountMinor(Math.round(v * 100));
                }}
                aria-label="Price in currency"
                className="w-28 rounded-xl border border-black/[0.08] bg-card px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none dark:border-border dark:bg-card dark:text-foreground"
              />
            </div>
            <div>
              <label htmlFor="price-currency" className="mb-1 block text-xs text-muted-foreground dark:text-muted-foreground">Currency</label>
              <select
                id="price-currency"
                value={priceCurrency}
                onChange={(e) => setPriceCurrency(e.target.value)}
                aria-label="Currency"
                className="rounded-xl border border-black/[0.08] bg-card px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none dark:border-border dark:bg-card dark:text-foreground"
              >
                <option value="SEK">SEK</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground dark:text-muted-foreground">Price is stored in minor units (cents/ore). Here it is shown as whole currency units.</p>
      </div>

      <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-border dark:bg-card dark:shadow-none space-y-3">
        <h3 className="text-sm font-semibold text-foreground dark:text-foreground">Sales model</h3>
        <button
          type="button"
          onClick={() => setPricingModel("book_only")}
          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
            pricingModel === "book_only"
              ? "border-[#907AFF]/30 bg-[#907AFF]/10 dark:bg-[#907AFF]/15"
              : "border-black/[0.06] bg-background/50 hover:border-black/[0.12] dark:border-border dark:bg-card dark:hover:border-border"
          }`}
        >
          <span className={`text-sm ${pricingModel === "book_only" ? "font-medium text-foreground dark:text-foreground" : "text-muted-foreground dark:text-muted-foreground"}`}>Full book</span>
          {pricingModel === "book_only" && (
            <span className="rounded-full bg-[#907AFF]/20 px-2 py-0.5 text-xs font-medium text-accent-foreground dark:text-accent-foreground">Selected</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setPricingModel("per_chapter")}
          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
            pricingModel === "per_chapter"
              ? "border-[#907AFF]/30 bg-[#907AFF]/10 dark:bg-[#907AFF]/15"
              : "border-black/[0.06] bg-background/50 hover:border-black/[0.12] dark:border-border dark:bg-card dark:hover:border-border"
          }`}
        >
          <span className={`text-sm ${pricingModel === "per_chapter" ? "font-medium text-foreground dark:text-foreground" : "text-muted-foreground dark:text-muted-foreground"}`}>Chapter</span>
          {pricingModel === "per_chapter" && (
            <span className="rounded-full bg-[#907AFF]/20 px-2 py-0.5 text-xs font-medium text-accent-foreground dark:text-accent-foreground">Selected</span>
          )}
        </button>
        <p className="text-xs text-muted-foreground dark:text-muted-foreground">
          {pricingModel === "book_only"
            ? "Readers buy the complete book at the price above."
            : "Readers buy chapters individually at the price above. First chapter is always free."}
        </p>
        {pricingModel === "per_chapter" && chapters.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">Chapter pricing preview</p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-black/[0.06] dark:border-border">
              {chapters.map((ch, i) => {
                const isFree = i === 0;
                const displayPrice = priceAmountMinor > 0 ? `${(priceAmountMinor / 100).toFixed(priceAmountMinor % 100 === 0 ? 0 : 2)} ${priceCurrency}` : "Free";
                return (
                  <div key={ch.id} className={`flex items-center justify-between px-3 py-1.5 text-xs ${i > 0 ? "border-t border-black/[0.04] dark:border-border" : ""}`}>
                    <span className="truncate text-foreground dark:text-foreground">{ch.title || `Chapter ${i + 1}`}</span>
                    <span className={`ml-2 shrink-0 ${isFree ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground dark:text-muted-foreground"}`}>
                      {isFree ? "Free" : displayPrice}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-border dark:bg-card dark:shadow-none">
        <h3 className="text-sm font-semibold text-foreground dark:text-foreground mb-2">Visibility and access</h3>
        <p className="text-sm text-foreground dark:text-foreground">
          {priceAmountMinor <= 0
            ? "Free - everyone can read the book."
            : pricingModel === "per_chapter"
              ? "Paid per chapter - readers purchase chapters individually. First chapter is free."
              : "Paid - readers need to purchase the book or have access via entitlement to read."}
          {" "}
          {currentVisibility === "followers" && "Followers-only affects discoverability, not the paywall."}
        </p>
      </div>

      {!isPublished && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30" role="status">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Publish the book before selling it.</p>
        </div>
      )}
      {priceAmountMinor > 0 && !stripeConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30" role="status">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Payment configuration is missing. Contact us to enable purchases.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSavePricing}
          disabled={pricingSaving || !pricingDirty}
          aria-label="Save pricing"
          className="rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pricingSaving ? "Saving..." : "Save"}
        </button>
        {pricingError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{pricingError}</p>}
        {pricingSaved && <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">Saved.</p>}
      </div>
    </div>
  );
}
