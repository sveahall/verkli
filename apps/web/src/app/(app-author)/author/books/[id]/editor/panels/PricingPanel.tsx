"use client";

import { useState } from "react";
import { ArrowRight, BookOpen, Check, Layers3 } from "lucide-react";
import styles from "./PricingPanel.module.css";
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
  const [paid, setPaid] = useState(priceAmountMinor > 0);
  const [priceDraft, setPriceDraft] = useState(String(priceAmountMinor / 100));
  const [lastAmount, setLastAmount] = useState(priceAmountMinor);
  // Match the pricing hook's prop reset, without replacing our own input echo.
  if (lastAmount !== priceAmountMinor) {
    setLastAmount(priceAmountMinor);
    setPriceDraft(String(priceAmountMinor / 100));
    setPaid(priceAmountMinor > 0);
  }
  const draftNumber = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(priceDraft) ? Number(priceDraft.replace(",", ".")) : NaN;
  const draftMinor = Math.round(draftNumber * 100);
  const draftInvalid = paid && (!Number.isFinite(draftMinor) || draftMinor <= 0);

  function updateAmount(amount: number) {
    setLastAmount(amount);
    setPriceAmountMinor(amount);
  }

  const displayPrice = `${(priceAmountMinor / 100).toFixed(priceAmountMinor % 100 === 0 ? 0 : 2)} ${priceCurrency}`;

  function chooseAccess(nextPaid: boolean) {
    if (nextPaid === paid) return;
    const amount = nextPaid ? 4900 : 0;
    setPaid(nextPaid);
    setPriceDraft(String(amount / 100));
    updateAmount(amount);
  }

  return (
    <div className={`mx-auto max-w-4xl ${styles.panel}`}>
      <header className={styles.heading}>
        <h2 className="font-display text-[clamp(24px,3vw,32px)] font-medium tracking-tight">Set the terms for your story.</h2>
        <p>Choose how readers get access. Save your price before moving on to publication.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.settings}>
          <fieldset>
            <legend className={styles.legend}>Reader access</legend>
            <div className={styles.choices}>
              {[
                { value: false, label: "Free", description: "Let readers explore at no cost." },
                { value: true, label: "Paid", description: "Set a price for your work." },
              ].map((option) => (
                <button key={option.label} type="button" aria-pressed={paid === option.value} onClick={() => chooseAccess(option.value)} className={styles.choice}>
                  <span className={styles.choiceTitle}>{option.label}{paid === option.value && <Check size={16} aria-hidden />}</span>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {paid && (
            <div className={styles.amountFields}>
              <div>
                <label htmlFor="price-amount">{pricingModel === "per_chapter" ? "Price per chapter" : "Full book price"}</label>
                <input id="price-amount" type="text" inputMode="decimal" value={priceDraft}
                  onChange={(e) => {
                    const draft = e.target.value;
                    setPriceDraft(draft);
                    const amount = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(draft) ? Math.round(Number(draft.replace(",", ".")) * 100) : NaN;
                    if (Number.isFinite(amount) && amount > 0) updateAmount(amount);
                  }}
                  aria-invalid={draftInvalid} aria-describedby={draftInvalid ? "price-draft-error" : "price-amount-hint"}
                />
              </div>
              <div>
                <label htmlFor="price-currency">Currency</label>
                <select id="price-currency" value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)}>
                  <option value="SEK">SEK</option><option value="EUR">EUR</option><option value="USD">USD</option>
                </select>
              </div>
              <p id="price-amount-hint" className={styles.fieldHint}>The price readers see when purchasing.</p>
            </div>
          )}
          {draftInvalid && <p id="price-draft-error" role="alert" className="text-sm text-red-600 dark:text-red-400">Enter a price greater than 0, or choose Free.</p>}

          <fieldset className={styles.salesModel}>
            <legend className={styles.legend}>Sales model</legend>
            <div className={styles.choices}>
              <button type="button" aria-pressed={pricingModel === "book_only"} onClick={() => setPricingModel("book_only")} className={styles.choice}>
                <BookOpen size={20} aria-hidden />
                <span className={styles.choiceTitle}>Full book{pricingModel === "book_only" && <Check size={16} aria-hidden />}</span>
                <span>One purchase for the complete book.</span>
              </button>
              <button type="button" aria-pressed={pricingModel === "per_chapter"} onClick={() => setPricingModel("per_chapter")} className={styles.choice}>
                <Layers3 size={20} aria-hidden />
                <span className={styles.choiceTitle}>Per chapter{pricingModel === "per_chapter" && <Check size={16} aria-hidden />}</span>
                <span>Individual chapters. The first is always free.</span>
              </button>
            </div>
            {!paid && <p className={styles.fieldHint}>Your book stays free with either sales model.</p>}
          </fieldset>

          {pricingModel === "per_chapter" && (
            <details className={styles.chapterPreview}>
              <summary>Chapter price preview <span>{chapters.length} chapters</span></summary>
              {chapters.length > 0 ? <div className={styles.chapterList}>
                {chapters.map((chapter, index) => (
                  <div key={chapter.id}><span>{chapter.title || `Chapter ${index + 1}`}</span><strong>{index === 0 || !paid ? "Free" : draftInvalid ? "Enter a price" : displayPrice}</strong></div>
                ))}
              </div> : <p className={styles.fieldHint}>Add chapters in Write to preview their prices here. The first chapter will be free.</p>}
            </details>
          )}
        </div>

        <aside className={styles.summary} aria-label="Reader price summary">
          <p className={styles.summaryLabel}>For your readers</p>
          <p className={styles.summaryPrice}>{!paid ? "Free to read" : draftInvalid ? "Set your price" : displayPrice}</p>
          <p>{!paid ? "Readers can read the book without a purchase." : pricingModel === "per_chapter" ? "Per chapter, with a free first chapter to begin the story." : "One purchase unlocks the full book."}</p>
          <div className={styles.summaryNote}>
            <ArrowRight size={17} aria-hidden />
            <span>{isPublished ? "Saved price changes apply to your published book." : "Save now. Your book becomes available when you publish it."}</span>
          </div>
          {currentVisibility === "followers" && <p className={styles.visibilityNote}>Followers-only controls who can discover your book. Your price still applies.</p>}
        </aside>
      </div>

      {paid && !stripeConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30" role="status">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Purchases need payment configuration. Contact us to enable purchases.</p>
        </div>
      )}

      <footer className={styles.saveBar}>
        <button type="button" onClick={() => { if (!draftInvalid) handleSavePricing(); }} disabled={pricingSaving || !pricingDirty || draftInvalid} aria-label="Save pricing" className="min-h-11 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
          {pricingSaving ? "Saving…" : "Save pricing"}
        </button>
        <div aria-live="polite">
          {pricingError ? <p className="text-sm text-red-600 dark:text-red-400" role="alert">{pricingError}</p>
            : pricingSaved && !pricingDirty && !draftInvalid ? <p className="text-sm text-emerald-700 dark:text-emerald-400">Pricing saved.</p>
            : <p className="text-sm text-muted-foreground">{pricingDirty || draftInvalid ? "You have unsaved changes." : "Your current pricing is saved."}</p>}
        </div>
      </footer>
    </div>
  );
}
