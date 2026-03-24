"use client";

import { useMemo, useState } from "react";
import {
  normalizePrintOnDemandSettings,
  POD_PRICE_FLOOR,
  POD_PRODUCTION_COST,
  POD_SHIPPING_COST_SE,
  type BookFormat,
  type PrintOnDemandSettings,
} from "./PrintPanel.helpers";

type Props = {
  bookId: string;
  title: string;
  authorDisplayName: string;
  coverImageUrl: string | null;
  originalUrl: string | null;
  chapterCount: number;
  totalWordCount: number;
  languageCode: string;
  isPublished: boolean;
  priceAmountMinor: number;
  priceCurrency: string;
  printOnDemandSettings?: PrintOnDemandSettings | null;
  onOpenEdit: () => void;
  onOpenCover: () => void;
  onOpenPublish: () => void;
  onSavePrintOnDemandSettings?: (
    settings: PrintOnDemandSettings
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

const FORMAT_INFO: Record<
  BookFormat,
  { label: string; tagline: string; cost: string; shippingSE: string; shippingEU: string }
> = {
  softcover: {
    label: "Softcover",
    tagline: "Paperback. Lighter, affordable, reader favourite.",
    cost: "~55 kr",
    shippingSE: "~39 kr",
    shippingEU: "~79 kr",
  },
  hardcover: {
    label: "Hardcover",
    tagline: "Premium feel. Higher value, higher margin.",
    cost: "~95 kr",
    shippingSE: "~49 kr",
    shippingEU: "~99 kr",
  },
};

export default function PrintPanel({
  coverImageUrl,
  chapterCount,
  totalWordCount,
  isPublished,
  printOnDemandSettings,
  onOpenEdit,
  onOpenCover,
  onOpenPublish,
  onSavePrintOnDemandSettings,
}: Props) {
  const hasContent = totalWordCount > 0 && chapterCount > 0;
  const hasCover = Boolean(coverImageUrl);
  const persistedSettings = useMemo(
    () => normalizePrintOnDemandSettings(printOnDemandSettings),
    [printOnDemandSettings]
  );

  const [enabled, setEnabled] = useState(persistedSettings.enabled);
  const [activated, setActivated] = useState(persistedSettings.enabled);
  const [selectedFormats, setSelectedFormats] = useState<Set<BookFormat>>(
    new Set(persistedSettings.formats)
  );
  const [editionLimit, setEditionLimit] = useState<"unlimited" | "limited">(
    persistedSettings.editionLimit
  );
  const [limitCount, setLimitCount] = useState(
    persistedSettings.limitCount != null ? String(persistedSettings.limitCount) : "100"
  );
  const [isbnDraft, setIsbnDraft] = useState(persistedSettings.isbn ?? "");
  const [isbnSaved, setIsbnSaved] = useState(Boolean(persistedSettings.isbn));
  const [priceCurrency, setPriceCurrency] = useState(persistedSettings.priceCurrency);
  const [softcoverPrice, setSoftcoverPrice] = useState(
    persistedSettings.softcoverPriceMinor != null ? String(persistedSettings.softcoverPriceMinor / 100) : ""
  );
  const [hardcoverPrice, setHardcoverPrice] = useState(
    persistedSettings.hardcoverPriceMinor != null ? String(persistedSettings.hardcoverPriceMinor / 100) : ""
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingIsbn, setIsSavingIsbn] = useState(false);
  const [isSavingActivation, setIsSavingActivation] = useState(false);

  const toggleFormat = (format: BookFormat) => {
    setSaveError(null);
    setSelectedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(format)) next.delete(format);
      else next.add(format);
      return next;
    });
  };

  const parsePriceToMinor = (value: string): number | null => {
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100);
  };

  const buildSettings = (overrides: Partial<PrintOnDemandSettings> = {}): PrintOnDemandSettings =>
    normalizePrintOnDemandSettings({
      enabled: persistedSettings.enabled,
      formats: Array.from(selectedFormats),
      editionLimit,
      limitCount: editionLimit === "limited" ? limitCount : null,
      isbn: persistedSettings.isbn,
      softcoverPriceMinor: parsePriceToMinor(softcoverPrice),
      hardcoverPriceMinor: parsePriceToMinor(hardcoverPrice),
      priceCurrency,
      ...overrides,
    });

  const handleSaveIsbn = async () => {
    const trimmed = isbnDraft.replace(/\D/g, "");
    if (!/^\d{13}$/.test(trimmed)) {
      setSaveError("Enter a valid 13-digit ISBN before saving print settings.");
      return;
    }

    if (!onSavePrintOnDemandSettings) {
      setIsbnDraft(trimmed);
      setIsbnSaved(true);
      setSaveError(null);
      return;
    }

    setSaveError(null);
    setIsSavingIsbn(true);
    const result = await onSavePrintOnDemandSettings(
      buildSettings({
        enabled: persistedSettings.enabled,
        isbn: trimmed,
      })
    );
    setIsSavingIsbn(false);

    if (!result.ok) {
      setSaveError(result.message);
      return;
    }

    setIsbnDraft(trimmed);
    setIsbnSaved(true);
  };

  const handleActivate = async () => {
    if (selectedFormats.size === 0) {
      setSaveError("Select at least one format before activating print on demand.");
      return;
    }

    if (editionLimit === "limited" && !/^[1-9]\d*$/.test(limitCount.trim())) {
      setSaveError("Enter a copy limit above 0 before activating print on demand.");
      return;
    }

    // Validate prices for each enabled format
    for (const fmt of selectedFormats) {
      const priceStr = fmt === "softcover" ? softcoverPrice : hardcoverPrice;
      const priceMinor = parsePriceToMinor(priceStr);
      if (!priceMinor) {
        setSaveError(`Set a price for ${FORMAT_INFO[fmt].label} before activating.`);
        return;
      }
      if (priceMinor < POD_PRICE_FLOOR[fmt]) {
        const floor = (POD_PRICE_FLOOR[fmt] / 100).toFixed(0);
        setSaveError(`${FORMAT_INFO[fmt].label} price must be at least ${floor} ${priceCurrency} to cover production and shipping.`);
        return;
      }
    }

    if (!onSavePrintOnDemandSettings) {
      setActivated(true);
      setEnabled(true);
      setSaveError(null);
      return;
    }

    setSaveError(null);
    setIsSavingActivation(true);
    const result = await onSavePrintOnDemandSettings(
      buildSettings({
        enabled: true,
      })
    );
    setIsSavingActivation(false);

    if (!result.ok) {
      setSaveError(result.message);
      return;
    }

    setEnabled(true);
    setActivated(true);
  };

  const formatLabels = Array.from(selectedFormats).map((f) => FORMAT_INFO[f].label);

  /* ── Activated ── */
  if (activated) {
    const hasMissingPrices = Array.from(selectedFormats).some((fmt) =>
      fmt === "softcover" ? !persistedSettings.softcoverPriceMinor : !persistedSettings.hardcoverPriceMinor
    );

    const goToSettings = () => {
      setEnabled(true);
      setActivated(false);
      setSaveError(null);
    };

    return (
      <div className="mx-auto max-w-2xl py-10">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none">
          {/* Header */}
          <div className="flex items-center gap-3.5 border-b border-slate-100 px-6 py-5 dark:border-white/[0.06]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
              <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                Print on demand is active
              </h2>
              <p className="text-[13px] text-slate-500 dark:text-white/50">
                Readers can order a physical copy. Printed and shipped on demand.
              </p>
            </div>
          </div>

          {/* Detail rows */}
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-[13px] text-slate-500 dark:text-white/50">Format</span>
              <span className="text-[13px] font-medium text-slate-900 dark:text-white">
                {formatLabels.join(" & ")}
              </span>
            </div>
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-[13px] text-slate-500 dark:text-white/50">Edition</span>
              <span className="text-[13px] font-medium text-slate-900 dark:text-white">
                {editionLimit === "limited" ? `Limited — ${limitCount} copies` : "Unlimited"}
              </span>
            </div>
            {persistedSettings.softcoverPriceMinor && selectedFormats.has("softcover") ? (
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-[13px] text-slate-500 dark:text-white/50">Softcover price</span>
                <span className="text-[13px] font-medium text-slate-900 dark:text-white">
                  {(persistedSettings.softcoverPriceMinor / 100).toFixed(0)} {persistedSettings.priceCurrency}
                </span>
              </div>
            ) : null}
            {persistedSettings.hardcoverPriceMinor && selectedFormats.has("hardcover") ? (
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-[13px] text-slate-500 dark:text-white/50">Hardcover price</span>
                <span className="text-[13px] font-medium text-slate-900 dark:text-white">
                  {(persistedSettings.hardcoverPriceMinor / 100).toFixed(0)} {persistedSettings.priceCurrency}
                </span>
              </div>
            ) : null}
          </div>

          {/* Warning row */}
          {hasMissingPrices && (
            <div className="flex items-center justify-between border-t border-amber-200 bg-amber-50 px-6 py-4 dark:border-amber-800/40 dark:bg-amber-950/30">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span className="text-[13px] font-medium text-amber-700 dark:text-amber-400">
                  Price not set — readers cannot order yet
                </span>
              </div>
              <button
                type="button"
                onClick={goToSettings}
                className="shrink-0 text-[13px] font-semibold text-amber-800 transition hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200"
              >
                Set price &rarr;
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={goToSettings}
              className="text-[13px] font-semibold text-[#907AFF] transition hover:text-[#7c6ae6]"
            >
              Edit settings &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Pitch (not yet enabled) ── */
  if (!enabled) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        {/* Hero */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#907AFF]">Print on demand</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Offer your book as a physical copy
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-500 dark:text-white/50">
            Each book is printed when a reader orders it. No inventory, no upfront
            cost&nbsp;&mdash; we handle printing, packaging and shipping.
          </p>
        </div>

        {/* Benefits row */}
        <div className="mt-10 grid grid-cols-3 gap-6 text-center">
          {[
            { icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", title: "No inventory" },
            { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", title: "No risk" },
            { icon: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4", title: "We handle it all" },
          ].map((item) => (
            <div key={item.title}>
              <svg className="mx-auto h-6 w-6 text-slate-400 dark:text-white/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <p className="mt-2 text-[13px] font-medium text-slate-700 dark:text-white/80">{item.title}</p>
            </div>
          ))}
        </div>

        {/* Pricing comparison */}
        <div className="mt-12">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-black/[0.04] dark:bg-white/[0.06] dark:ring-white/10">
            {(["softcover", "hardcover"] as const).map((format) => {
              const info = FORMAT_INFO[format];
              return (
                <div key={format} className="bg-white px-6 py-6 dark:bg-[#0a0a0f]">
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{info.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-white/40">{info.tagline}</p>
                  <div className="mt-5 space-y-2.5 text-[13px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 dark:text-white/40">Production</span>
                      <span className="font-medium text-slate-700 dark:text-white/80">{info.cost}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 dark:text-white/40">Shipping SE</span>
                      <span className="font-medium text-slate-700 dark:text-white/80">{info.shippingSE}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 dark:text-white/40">Shipping EU</span>
                      <span className="font-medium text-slate-700 dark:text-white/80">{info.shippingEU}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-center text-[13px] text-slate-400 dark:text-white/40">
            You set the reader price.
            Example: sell softcover for 179&nbsp;kr &rarr; production 55&nbsp;kr + shipping 39&nbsp;kr = <span className="font-semibold text-emerald-600 dark:text-emerald-400">you keep 85&nbsp;kr</span>
          </p>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <button
            type="button"
            onClick={() => setEnabled(true)}
            className="rounded-full bg-[#907AFF] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6]"
          >
            Get started
          </button>
        </div>
      </div>
    );
  }

  /* ── Configuration ── */
  return (
    <div className="mx-auto max-w-2xl space-y-10 py-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#907AFF]">Print on demand</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Set up your physical book
        </h2>
      </div>

      {/* Format */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Format</h3>
        <p className="mt-1 text-[13px] text-slate-400 dark:text-white/40">Select one or both.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(["softcover", "hardcover"] as const).map((format) => {
            const info = FORMAT_INFO[format];
            const selected = selectedFormats.has(format);
            return (
              <button
                key={format}
                type="button"
                onClick={() => toggleFormat(format)}
                className={`rounded-xl border px-5 py-4 text-left transition ${
                  selected
                    ? "border-[#907AFF] ring-1 ring-[#907AFF]/30"
                    : "border-slate-100 hover:border-slate-200 dark:border-white/[0.08] dark:hover:border-white/[0.15]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800 dark:text-white/90">{info.label}</span>
                  {selected ? (
                    <svg className="h-5 w-5 text-[#907AFF]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="h-5 w-5 rounded-full ring-1.5 ring-slate-200 dark:ring-white/20" />
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400 dark:text-white/40">{info.tagline}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-white/50">
                  From <span className="font-medium text-slate-700 dark:text-white/80">{info.cost}</span> / copy
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Edition */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Edition</h3>
        <p className="mt-1 text-[13px] text-slate-400 dark:text-white/40">Set a limit to create exclusivity, or leave it open.</p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditionLimit("unlimited")}
            className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
              editionLimit === "unlimited"
                ? "bg-[#907AFF] text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"
            }`}
          >
            Unlimited
          </button>
          <button
            type="button"
            onClick={() => setEditionLimit("limited")}
            className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
              editionLimit === "limited"
                ? "bg-[#907AFF] text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"
            }`}
          >
            Limited edition
          </button>
          {editionLimit === "limited" && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={limitCount}
                onChange={(e) => setLimitCount(e.target.value)}
                className="w-20 rounded-lg border border-black/[0.08] px-3 py-1.5 text-[13px] text-slate-900 focus:border-[#907AFF] focus:outline-none focus:ring-1 focus:ring-[#907AFF] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
              />
              <span className="text-[13px] text-slate-400 dark:text-white/40">copies</span>
            </div>
          )}
        </div>
      </div>

      {/* ISBN */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">ISBN</h3>
        <p className="mt-1 text-[13px] text-slate-400 dark:text-white/40">Required for bookstore and distributor listings.</p>
        {isbnSaved ? (
          <div className="mt-3 flex items-center gap-3">
            <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-slate-600 dark:text-white/70">ISBN saved</span>
            <button
              type="button"
              onClick={() => setIsbnSaved(false)}
              className="text-xs font-medium text-[#907AFF] transition hover:text-[#7c6ae6]"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={isbnDraft}
              onChange={(e) => setIsbnDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveIsbn(); }}
              placeholder="978-91-XXXX-XXX-X"
              className="w-52 rounded-lg border border-black/[0.08] px-3 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-300 focus:border-[#907AFF] focus:outline-none focus:ring-1 focus:ring-[#907AFF] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
            />
            <button
              type="button"
              onClick={handleSaveIsbn}
              disabled={isSavingIsbn || !isbnDraft.replace(/\D/g, "").trim()}
              className="rounded-full bg-[#907AFF] px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#7c6ae6] disabled:opacity-40"
            >
              {isSavingIsbn ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* Pricing */}
      {selectedFormats.size > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pricing</h3>
          <p className="mt-1 text-[13px] text-slate-400 dark:text-white/40">Set the reader price per format. You keep the margin after production and shipping.</p>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-[13px] text-slate-500 dark:text-white/50">Currency</span>
            {(["SEK", "EUR", "USD"] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => { setPriceCurrency(cur); setSaveError(null); }}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
                  priceCurrency === cur
                    ? "bg-[#907AFF] text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"
                }`}
              >
                {cur}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {(["softcover", "hardcover"] as const)
              .filter((fmt) => selectedFormats.has(fmt))
              .map((fmt) => {
                const priceStr = fmt === "softcover" ? softcoverPrice : hardcoverPrice;
                const setPrice = fmt === "softcover" ? setSoftcoverPrice : setHardcoverPrice;
                const priceMinor = parsePriceToMinor(priceStr);
                const productionCost = POD_PRODUCTION_COST[fmt];
                const shippingCost = POD_SHIPPING_COST_SE[fmt];
                const margin = priceMinor ? priceMinor - productionCost - shippingCost : null;
                const belowFloor = priceMinor !== null && priceMinor < POD_PRICE_FLOOR[fmt];

                return (
                  <div key={fmt} className="rounded-xl border border-slate-100 px-4 py-3 dark:border-white/[0.08]">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-slate-800 dark:text-white/90">
                        {FORMAT_INFO[fmt].label}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={priceStr}
                          onChange={(e) => { setPrice(e.target.value); setSaveError(null); }}
                          placeholder={(POD_PRICE_FLOOR[fmt] / 100).toFixed(0)}
                          className="w-24 rounded-lg border border-black/[0.08] px-3 py-1.5 text-right text-[13px] text-slate-900 focus:border-[#907AFF] focus:outline-none focus:ring-1 focus:ring-[#907AFF] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                        />
                        <span className="text-[13px] text-slate-400 dark:text-white/40">{priceCurrency}</span>
                      </div>
                    </div>
                    {margin !== null && (
                      <p className={`mt-2 text-[12px] ${belowFloor ? "text-rose-600 dark:text-rose-400" : margin > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-white/40"}`}>
                        {belowFloor
                          ? `Below minimum (${(POD_PRICE_FLOOR[fmt] / 100).toFixed(0)} ${priceCurrency})`
                          : `Margin: ${(margin / 100).toFixed(0)} ${priceCurrency} (price ${((priceMinor ?? 0) / 100).toFixed(0)} - production ${(productionCost / 100).toFixed(0)} - shipping ${(shippingCost / 100).toFixed(0)})`}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Pre-requisites */}
      {(!hasContent || !hasCover || !isPublished) && (
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 px-5 py-4 dark:border-amber-800/30 dark:bg-amber-950/20">
          <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">Before you can activate:</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-amber-700 dark:text-amber-400">
            {!hasCover && (
              <li className="flex items-center justify-between">
                <span>Add a cover image</span>
                <button type="button" onClick={onOpenCover} className="font-medium underline">Go to cover</button>
              </li>
            )}
            {!hasContent && (
              <li className="flex items-center justify-between">
                <span>Write or import your manuscript</span>
                <button type="button" onClick={onOpenEdit} className="font-medium underline">Go to editor</button>
              </li>
            )}
            {!isPublished && (
              <li className="flex items-center justify-between">
                <span>Publish your book</span>
                <button type="button" onClick={onOpenPublish} className="font-medium underline">Publish</button>
              </li>
            )}
          </ul>
        </div>
      )}

      {saveError && (
        <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-6 dark:border-white/[0.06]">
        <button
          type="button"
          onClick={() => {
            if (persistedSettings.enabled) {
              setEnabled(true);
              setActivated(true);
              setSaveError(null);
              return;
            }
            setEnabled(false);
            setSaveError(null);
          }}
          className="text-[13px] text-slate-400 transition hover:text-slate-700 dark:text-white/40 dark:hover:text-white/80"
        >
          &larr; Back
        </button>
        <button
          type="button"
          disabled={isSavingActivation || selectedFormats.size === 0}
          onClick={() => void handleActivate()}
          className="rounded-full bg-[#907AFF] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSavingActivation
            ? "Saving..."
            : persistedSettings.enabled
              ? "Save print on demand"
              : "Activate print on demand"}
        </button>
      </div>
    </div>
  );
}
