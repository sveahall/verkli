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
    <section className="flex w-full flex-col gap-6">
      <header>
        <p className="text-eyebrow">Distribute</p>
        <h2 className="text-page-title flex items-center gap-2">
          <Globe className="h-7 w-7 text-[var(--brand-violet)]" aria-hidden />
          Launch globally
        </h2>
        <p className="text-body mt-1 max-w-xl">
          Native posts on TikTok, Instagram, X, and YouTube Shorts — in every
          language you produced — all in parallel.
        </p>
      </header>

      <PrintOnDemandToggle disabled={isLaunching} />

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">
        <div>
          <p className="text-label text-slate-700">Ready when you are</p>
          <p className="text-helper">
            {DEMO_CHANNELS.length} channels × {DEMO_DISTRIBUTION_LANGUAGES.length} languages — façade
            demo, no real APIs hit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDone ? (
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-label text-slate-600 hover:bg-slate-50"
            >
              Reset
            </button>
          ) : null}
          <button
            type="button"
            onClick={start}
            disabled={isLaunching}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-violet)] px-5 py-2.5 text-label font-semibold text-white shadow-sm transition hover:bg-[var(--brand-violet-hover)] active:bg-[var(--brand-violet-active)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Globe className="h-4 w-4" aria-hidden />
            Launch globally
          </button>
        </div>
      </div>

      {state.status !== "idle" ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-section-title">
              {isDone ? "12 live posts" : `Launching ${readyCount}/12 posts…`}
            </p>
            {isDone ? <CheckmarkPop /> : null}
          </div>

          <div className="space-y-4">
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <label
        className={`flex cursor-pointer items-start gap-3 ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--brand-violet)] focus:ring-[var(--brand-violet)]"
          checked={enabled}
          onChange={handleToggle}
          disabled={disabled}
        />
        <span>
          <span className="flex items-center gap-2 text-label text-slate-800">
            <Printer className="h-4 w-4" aria-hidden />
            Enable global print
          </span>
          <span className="text-helper">
            Send the manuscript to {POD_PARTNERS.length} print partners. Hardcover
            and paperback live in 24 h.
          </span>
        </span>
      </label>
      {showModal ? (
        <PodModal onClose={() => setShowModal(false)} />
      ) : null}
    </div>
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-violet)] text-white"
      style={{ animation: "demoCheckPop 200ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
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
