"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Globe,
  Music2,
  Play,
  Printer,
  Sparkles,
  Twitter,
  Youtube,
} from "lucide-react";
import {
  cellKey,
  DEMO_CHANNELS,
  DEMO_DISTRIBUTION_LANGUAGES,
  useDemoDistribution,
  type DemoChannel,
  type DemoDistributionLanguage,
} from "../hooks/useDemoDistribution";
import type { MarketingCampaignRow } from "../BookEditorView.types";

interface DistributionFacadeProps {
  bookId: string;
  marketingCampaigns: MarketingCampaignRow[];
}

const CHANNEL_LABEL: Record<DemoChannel, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  youtube: "YouTube Shorts",
};

const CHANNEL_ASPECT: Record<DemoChannel, "vertical" | "square" | "wide"> = {
  tiktok: "vertical",
  instagram: "square",
  x: "wide",
  youtube: "vertical",
};

const ASPECT_CLASS: Record<"vertical" | "square" | "wide", string> = {
  vertical: "aspect-[9/16]",
  square: "aspect-square",
  wide: "aspect-[16/9]",
};

const LANGUAGE_FLAGS: Record<DemoDistributionLanguage, string> = {
  sv: "🇸🇪",
  en: "🇬🇧",
  fr: "🇫🇷",
};

function ChannelIcon({ channel }: { channel: DemoChannel }) {
  const className = "h-4 w-4 text-slate-700";
  switch (channel) {
    case "tiktok":
      return <Music2 className={className} aria-hidden />;
    case "instagram":
      return <Sparkles className={className} aria-hidden />;
    case "x":
      return <Twitter className={className} aria-hidden />;
    case "youtube":
      return <Youtube className={className} aria-hidden />;
  }
}

interface CampaignByKey {
  byKey: Record<string, MarketingCampaignRow | undefined>;
}

function indexCampaigns(rows: MarketingCampaignRow[]): CampaignByKey {
  const byKey: Record<string, MarketingCampaignRow | undefined> = {};
  for (const r of rows) {
    if (
      DEMO_CHANNELS.includes(r.channel as DemoChannel) &&
      DEMO_DISTRIBUTION_LANGUAGES.includes(r.language as DemoDistributionLanguage)
    ) {
      byKey[cellKey(r.channel as DemoChannel, r.language as DemoDistributionLanguage)] = r;
    }
  }
  return { byKey };
}

export default function DistributionFacade({ bookId, marketingCampaigns }: DistributionFacadeProps) {
  void bookId;
  const { state, start, reset } = useDemoDistribution();

  const isLaunching = state.status === "launching";
  const isDone = state.status === "done";

  const campaigns = useMemo(() => indexCampaigns(marketingCampaigns), [marketingCampaigns]);
  const readyCount = useMemo(
    () => Object.values(state.cells).filter(Boolean).length,
    [state.cells]
  );
  const showSummary = isDone;

  return (
    <section
      aria-label="Demo distribution façade"
      className="relative isolate overflow-hidden rounded-[28px] border border-slate-200/80 bg-[#FDFAF4] shadow-[0_24px_72px_-32px_rgba(124,92,252,0.18)]"
    >
      {/* Ambient brand orbs — same atmospheric language as Production + Reader */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-24 -top-32 h-[360px] w-[360px] rounded-full opacity-25 blur-3xl"
          style={{ background: "var(--brand-violet)" }}
        />
        <div
          className="absolute -right-20 top-32 h-[300px] w-[300px] rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--brand-rose)" }}
        />
        <div
          className="absolute -bottom-32 left-1/3 h-[340px] w-[340px] rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--brand-amber)" }}
        />
      </div>

      <div className="relative flex flex-col gap-7 p-6 sm:p-10">
        {/* ── Hero header ─────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-[var(--brand-violet)]/20 bg-white/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-violet)] backdrop-blur">
              <Globe className="h-2.5 w-2.5" aria-hidden />
              Distribute
            </span>
            <h2
              className="text-balance text-[36px] font-bold leading-[1.05] tracking-[-0.02em] text-slate-900 sm:text-[44px]"
              style={{ fontFamily: 'var(--font-montserrat-alternates), "Inter", ui-sans-serif, system-ui, sans-serif' }}
            >
              Launch{" "}
              <span className="bg-gradient-to-r from-[var(--brand-violet)] via-[var(--brand-rose)] to-[var(--brand-amber)] bg-clip-text text-transparent">
                globally
              </span>
            </h2>
            <p className="text-body max-w-xl text-slate-600">
              Native posts on TikTok, Instagram, X, and YouTube Shorts — in
              every language you produced — all in parallel.
            </p>
          </div>
          {isDone ? (
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[12px] font-medium text-slate-600 backdrop-blur hover:bg-white"
            >
              Reset
            </button>
          ) : null}
        </header>

        {/* ── POD toggle ──────────────────────────────────────────── */}
        <PrintOnDemandToggle disabled={isLaunching} />

        {/* ── Hero CTA ────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={start}
            disabled={isLaunching}
            className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-[var(--brand-violet)] px-8 py-3.5 text-[15px] font-semibold text-white shadow-[0_18px_40px_-12px_rgba(124,92,252,0.65)] transition-all duration-300 hover:bg-[var(--brand-violet-hover)] hover:shadow-[0_24px_48px_-12px_rgba(124,92,252,0.75)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <Globe className="relative h-4 w-4" aria-hidden />
            <span className="relative">
              {isLaunching ? "Launching…" : "Launch globally"}
            </span>
          </button>
          <p className="text-[12px] text-slate-500">
            {DEMO_CHANNELS.length} channels × {DEMO_DISTRIBUTION_LANGUAGES.length} languages · 17 seconds end-to-end
          </p>
        </div>

        {/* ── Live status + grid ──────────────────────────────────── */}
        {state.status !== "idle" ? (
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <span
                  key={readyCount}
                  className={`tabular-nums text-[36px] font-bold leading-none tracking-[-0.02em] sm:text-[44px] ${
                    isDone
                      ? "bg-gradient-to-r from-[var(--brand-violet)] via-[var(--brand-rose)] to-[var(--brand-amber)] bg-clip-text text-transparent"
                      : "text-slate-900"
                  }`}
                  style={{
                    fontFamily: 'var(--font-montserrat-alternates), "Inter", ui-sans-serif, system-ui, sans-serif',
                    animation: "demoCountPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                >
                  {readyCount}
                </span>
                <span className="text-[18px] font-medium text-slate-400">/ 12</span>
                <div className="ml-3 flex flex-col gap-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-violet)]">
                    {isDone ? "Live" : "Launching"}
                  </p>
                  <p className="text-[14px] font-medium text-slate-700">
                    {isDone ? "posts live" : "posts going out"}
                  </p>
                </div>
              </div>
              {isDone ? <CheckmarkPop /> : null}
            </div>
            <style>{`
              @keyframes demoCountPop {
                0% { transform: scale(0.8); opacity: 0.4; }
                60% { transform: scale(1.08); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>

            <div className="mt-5 space-y-5">
              {DEMO_CHANNELS.map((channel) => (
                <ChannelRow
                  key={channel}
                  channel={channel}
                  state={state.cells}
                  campaigns={campaigns}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {showSummary ? <SummaryOverlay /> : null}
    </section>
  );
}

function ChannelRow({
  channel,
  state,
  campaigns,
}: {
  channel: DemoChannel;
  state: Record<string, boolean>;
  campaigns: CampaignByKey;
}) {
  const aspect = CHANNEL_ASPECT[channel];
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
          <ChannelIcon channel={channel} />
        </span>
        <span className="text-label text-slate-800">{CHANNEL_LABEL[channel]}</span>
        <span className="text-caption text-slate-400">
          {aspect === "vertical" ? "9:16" : aspect === "square" ? "1:1" : "16:9"}
        </span>
      </div>
      <div
        // overflow-x-auto so smaller viewports get a horizontal scroller; on
        // desktop the 3 cards already fit so it stays a static row.
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      >
        {DEMO_DISTRIBUTION_LANGUAGES.map((language) => {
          const ready = Boolean(state[cellKey(channel, language)]);
          const campaign = campaigns.byKey[cellKey(channel, language)];
          return (
            <ThumbnailCard
              key={`${channel}:${language}`}
              channel={channel}
              language={language}
              ready={ready}
              campaign={campaign}
            />
          );
        })}
      </div>
    </div>
  );
}

function ThumbnailCard({
  channel,
  language,
  ready,
  campaign,
}: {
  channel: DemoChannel;
  language: DemoDistributionLanguage;
  ready: boolean;
  campaign: MarketingCampaignRow | undefined;
}) {
  const aspect = CHANNEL_ASPECT[channel];
  const thumbnailUrl = `/demo-assets/social/${language}-${channel}.svg`;
  const headline = campaign?.headline ?? "—";
  const caption = campaign?.caption ?? "";
  const hashtags = campaign?.hashtags ?? "";
  const cta = campaign?.cta ?? "Listen now";

  // Snap-card sizing per channel aspect: vertical formats are narrower,
  // wide formats wider, so the row reads at a glance.
  const widthClass =
    aspect === "vertical" ? "w-[180px]" : aspect === "square" ? "w-[260px]" : "w-[360px]";

  return (
    <article
      className={`group relative shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 ${widthClass}`}
      style={{
        opacity: ready ? 1 : 0.35,
        transform: ready ? "translateY(0) scale(1)" : "translateY(6px) scale(0.97)",
      }}
    >
      <div
        className={`relative ${ASPECT_CLASS[aspect]} bg-slate-100`}
        // Scale-up + soft shadow on hover. Spec: 1.0 → 1.03, no click handler.
        // Tailwind's group-hover handles the wrapper, transition is on inner
        // `<img>` for clarity.
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG thumbnails are
            tiny static demo assets we ship; next/image+SVG would require
            dangerouslyAllowSVG and adds no real perf win at this scale. */}
        <img
          src={thumbnailUrl}
          alt={`${headline} — ${CHANNEL_LABEL[channel]} (${language.toUpperCase()})`}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          loading="lazy"
        />
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {LANGUAGE_FLAGS[language]} {language.toUpperCase()}
        </span>
        {ready ? (
          <span className="absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-violet)] text-white">
            <Check className="h-3 w-3" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="space-y-1 p-3 transition-shadow duration-300 group-hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        <p className="line-clamp-2 text-label text-slate-900">{headline}</p>
        <p className="line-clamp-2 text-caption text-slate-500">{caption}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="line-clamp-1 text-[10px] text-slate-400">{hashtags}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--brand-violet)]">
            <Play className="h-3 w-3" aria-hidden /> {cta}
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── Print-on-Demand toggle (sub-section above Launch) ─────────────────────

const POD_PARTNERS = [
  "Amazon KDP Print",
  "IngramSpark",
  "Lulu Direct",
  "Blurb",
  "BookBaby",
  "Barnes & Noble Press",
  "Kobo Plus",
  "Draft2Digital Print",
  "Apple Books for Authors",
  "Tolino Media",
] as const;

function PrintOnDemandToggle({ disabled }: { disabled: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [showModal, setShowModal] = useState(false);

  function handleToggle() {
    if (disabled) return;
    if (!enabled) {
      setEnabled(true);
      setShowModal(true);
    } else {
      setEnabled(false);
    }
  }

  return (
    <label
      className={`group flex cursor-pointer items-start gap-3 rounded-2xl border bg-white/85 p-4 shadow-sm backdrop-blur transition-all ${
        enabled
          ? "border-[var(--brand-violet)]/30 ring-2 ring-[var(--brand-violet)]/15"
          : "border-slate-200 hover:border-slate-300"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={enabled}
        onChange={handleToggle}
        disabled={disabled}
      />
      <span
        className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
          enabled
            ? "bg-[var(--brand-violet)] text-white shadow-[0_6px_16px_-6px_rgba(124,92,252,0.55)]"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        <Printer className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-slate-900">
          Enable global print
          {enabled ? (
            <Check className="h-3.5 w-3.5 text-[var(--brand-violet)]" aria-hidden />
          ) : null}
        </span>
        <span className="text-[12px] text-slate-500">
          Send the manuscript to {POD_PARTNERS.length} print partners. Hardcover and paperback live in 24 h.
        </span>
      </span>
      {showModal ? <PodModal onClose={() => setShowModal(false)} /> : null}
    </label>
  );
}

function PodModal({ onClose }: { onClose: () => void }) {
  // No backdrop click outside the modal closes it — the demo is short, the
  // user can dismiss with the explicit Close button.
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Print on demand — partners notified"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        style={{ animation: "demoPopIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-violet)]/10 text-[var(--brand-violet)]">
            <Printer className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-eyebrow">Global print</p>
            <h3 className="text-section-title">
              Sent to {POD_PARTNERS.length} print partners globally
            </h3>
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-2 text-label text-slate-700">
          {POD_PARTNERS.map((partner) => (
            <li key={partner} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[var(--brand-violet)]" aria-hidden />
              {partner}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[var(--brand-violet)] px-4 py-2 text-label font-medium text-white hover:bg-[var(--brand-violet-hover)]"
          >
            Got it
          </button>
        </div>
      </div>
      <style>{`
        @keyframes demoPopIn {
          0% { transform: scale(0.9); opacity: 0; }
          80% { transform: scale(1.02); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Summary overlay (post-distribution transition cue) ─────────────────────

function SummaryOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Auto-fade after 3s. Day 5 will replace this with a hand-off into the
    // reader-finale view; for now it just tells the audience we're done.
    const id = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(id);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1500] flex items-center justify-center"
      aria-live="polite"
    >
      <div
        className="rounded-3xl border border-white/30 bg-gradient-to-br from-[var(--brand-violet)]/95 via-[var(--brand-rose)]/95 to-[var(--brand-amber)]/95 px-12 py-10 text-center text-white shadow-[0_24px_72px_rgba(15,23,42,0.35)]"
        style={{ animation: "demoSummaryPop 360ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      >
        <p className="text-[12px] font-semibold uppercase tracking-[0.3em] text-white/80">
          Live
        </p>
        <p className="mt-2 text-[36px] font-bold leading-tight tracking-tight">
          10 languages · audiobook · 12 live posts
        </p>
      </div>
      <style>{`
        @keyframes demoSummaryPop {
          0% { transform: scale(0.85); opacity: 0; }
          70% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function CheckmarkPop() {
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-violet)] text-white shadow-[0_8px_20px_-6px_rgba(124,92,252,0.5)]"
      style={{ animation: "demoCheckPop 220ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      aria-label="distribution complete"
    >
      <Check className="h-5 w-5" aria-hidden />
      <style>{`
        @keyframes demoCheckPop {
          0% { transform: scale(0.5); }
          70% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `}</style>
    </span>
  );
}
