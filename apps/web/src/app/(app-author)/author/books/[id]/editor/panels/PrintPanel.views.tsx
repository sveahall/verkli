"use client";

import type { BookFormat, PrintOnDemandSettings } from "./PrintPanel.helpers";

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

// ── Pitch view (not yet enabled) ──────────────────────────────────────────────

export function PrintPanelPitch({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-6">
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

      <div className="mt-12 text-center">
        <button
          type="button"
          onClick={onGetStarted}
          className="rounded-full bg-[#907AFF] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6]"
        >
          Get started
        </button>
      </div>
    </div>
  );
}

// ── Activated view ────────────────────────────────────────────────────────────

interface PrintPanelActivatedProps {
  selectedFormats: Set<BookFormat>;
  editionLimit: "unlimited" | "limited";
  limitCount: string;
  persistedSettings: PrintOnDemandSettings;
  onGoToSettings: () => void;
}

export function PrintPanelActivated({
  selectedFormats,
  editionLimit,
  limitCount,
  persistedSettings,
  onGoToSettings,
}: PrintPanelActivatedProps) {
  const formatLabels = Array.from(selectedFormats).map((f) => FORMAT_INFO[f].label);

  const hasMissingPrices = Array.from(selectedFormats).some((fmt) =>
    fmt === "softcover" ? !persistedSettings.softcoverPriceMinor : !persistedSettings.hardcoverPriceMinor
  );

  return (
    <div className="space-y-6">
      <h2 className="text-[clamp(20px,2.5vw,24px)] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
        Print on demand
      </h2>

      <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
        {/* Status */}
        <div className="mb-4 flex items-center gap-2.5">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400">
            Active
          </span>
          <span className="text-xs text-slate-400 dark:text-white/40">
            Readers can order a physical copy
          </span>
        </div>

        {/* Detail rows */}
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-slate-500 dark:text-white/50">Format</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {formatLabels.join(" & ")}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-slate-500 dark:text-white/50">Edition</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {editionLimit === "limited" ? `Limited — ${limitCount} copies` : "Unlimited"}
            </span>
          </div>
          {persistedSettings.softcoverPriceMinor && selectedFormats.has("softcover") ? (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-500 dark:text-white/50">Softcover price</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {(persistedSettings.softcoverPriceMinor / 100).toFixed(0)} {persistedSettings.priceCurrency}
              </span>
            </div>
          ) : null}
          {persistedSettings.hardcoverPriceMinor && selectedFormats.has("hardcover") ? (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-500 dark:text-white/50">Hardcover price</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {(persistedSettings.hardcoverPriceMinor / 100).toFixed(0)} {persistedSettings.priceCurrency}
              </span>
            </div>
          ) : null}
          {persistedSettings.isbn && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-500 dark:text-white/50">ISBN</span>
              <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                {persistedSettings.isbn}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Warning: missing prices */}
      {hasMissingPrices && (
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 p-5 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Price not set — readers cannot order yet
              </span>
            </div>
            <button
              type="button"
              onClick={onGoToSettings}
              className="shrink-0 text-sm font-semibold text-amber-800 transition hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200"
            >
              Set price &rarr;
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onGoToSettings}
        className="text-sm font-semibold text-[#907AFF] transition hover:text-[#7c6ae6]"
      >
        Edit print settings &rarr;
      </button>
    </div>
  );
}
