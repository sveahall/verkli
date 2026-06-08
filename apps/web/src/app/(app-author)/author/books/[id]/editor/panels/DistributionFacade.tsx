"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  AtSign,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Heart,
  MessageCircle,
  Music2,
  Play,
  Printer,
  Repeat2,
  Sparkles,
  Twitter,
  X as XIcon,
  Youtube,
} from "lucide-react";
import { SEEDED_DEMO_BOOK_ID } from "@/features/author-shell/useDemoHotkeys";
import {
  cellKey,
  DEMO_CHANNELS,
  DEMO_DISTRIBUTION_LANGUAGES,
  useDemoDistribution,
  type DemoChannel,
  type DemoDistributionLanguage,
} from "../hooks/useDemoDistribution";
import {
  CHANNEL_META,
  DEMO_POST_COUNT,
  formatMetric,
  getDemoSocialPost,
  type DemoSocialPost,
} from "@/lib/demo-social-posts";
import { POD_MODAL_EVENT } from "@/features/author-shell/useDemoHotkeys";
import type { MarketingCampaignRow } from "../BookEditorView.types";

interface DistributionFacadeProps {
  bookId: string;
  marketingCampaigns: MarketingCampaignRow[];
}

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
    case "threads":
      return <AtSign className={className} aria-hidden />;
    case "youtube":
      return <Youtube className={className} aria-hidden />;
  }
}

export default function DistributionFacade({ bookId, marketingCampaigns }: DistributionFacadeProps) {
  void bookId;
  // Display content is sourced from the shared demo-social-posts module so the
  // grid, the generated artwork, and the preview modal stay in lockstep. The
  // seeded marketing_campaigns rows are no longer needed for rendering.
  void marketingCampaigns;
  const { state, start, reset } = useDemoDistribution();
  const [preview, setPreview] = useState<DemoSocialPost | null>(null);

  const isLaunching = state.status === "launching";
  const isDone = state.status === "done";

  const readyCount = useMemo(
    () => Object.values(state.cells).filter(Boolean).length,
    [state.cells]
  );
  const showSummary = isDone;

  return (
    <section
      aria-label="Demo distribution façade"
      className="relative isolate overflow-hidden rounded-3xl ring-1 ring-slate-200/70 dark:ring-white/[0.08]"
    >
      <div className="relative flex flex-col gap-6 p-6 sm:p-10">
        {/* ── Hero header ─────────────────────────────────────────── */}
        <header className="relative flex flex-col items-center gap-3 text-center">
          <h2 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-slate-900 sm:text-[32px]">
            Launch globally.
          </h2>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-slate-500">
            Native posts on TikTok, Instagram, X, Threads, and YouTube
            Shorts — video, image, and text — in every language you produced,
            all in parallel.
          </p>
          {isDone ? (
            <button
              type="button"
              onClick={reset}
              className="absolute right-0 top-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
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
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-[#0F172A] px-6 py-3 text-[14px] font-medium text-white transition-colors duration-200 hover:bg-[#1E293B] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
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
          <p className="text-[11px] font-medium text-slate-400">
            <span className="text-slate-300 line-through">Traditional ad-spend: ~$8,500/launch</span>
            <span className="ml-2 text-[var(--brand-violet)]">→ $0 · ~380M reach</span>
          </p>
        </div>

        {/* ── Live status + grid ──────────────────────────────────── */}
        {state.status !== "idle" ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <span
                  key={readyCount}
                  className={`tabular-nums text-[28px] font-semibold leading-none tracking-[-0.02em] sm:text-[32px] ${
                    isDone ? "text-[var(--brand-violet)]" : "text-slate-900"
                  }`}
                  style={{
                    animation: "demoCountPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                >
                  {readyCount}
                </span>
                <span className="text-[18px] font-medium text-slate-400">/ {DEMO_POST_COUNT}</span>
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
                  onOpen={setPreview}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {preview ? (
        <PostPreviewModal post={preview} onClose={() => setPreview(null)} />
      ) : null}
      {showSummary ? <SummaryOverlay /> : null}
    </section>
  );
}

const POST_TYPE_LABEL: Record<DemoSocialPost["type"], string> = {
  video: "Video",
  image: "Image",
  text: "Text",
};

function ChannelRow({
  channel,
  state,
  onOpen,
}: {
  channel: DemoChannel;
  state: Record<string, boolean>;
  onOpen: (post: DemoSocialPost) => void;
}) {
  const meta = CHANNEL_META[channel];
  const aspect = meta.aspect;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
          <ChannelIcon channel={channel} />
        </span>
        <span className="text-label text-slate-800">{meta.label}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {POST_TYPE_LABEL[meta.type]}
        </span>
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
          return (
            <ThumbnailCard
              key={`${channel}:${language}`}
              channel={channel}
              language={language}
              ready={ready}
              onOpen={onOpen}
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
  onOpen,
}: {
  channel: DemoChannel;
  language: DemoDistributionLanguage;
  ready: boolean;
  onOpen: (post: DemoSocialPost) => void;
}) {
  const post = getDemoSocialPost(channel, language);
  const meta = CHANNEL_META[channel];
  const aspect = meta.aspect;
  const thumbnailUrl = `/demo-assets/social/${language}-${channel}.svg`;
  const primaryMetric =
    post.metrics.views != null
      ? `${formatMetric(post.metrics.views)} views`
      : `${formatMetric(post.metrics.likes)} likes`;

  // Snap-card sizing per channel aspect: vertical formats are narrower,
  // wide formats wider, so the row reads at a glance.
  const widthClass =
    aspect === "vertical" ? "w-[180px]" : aspect === "square" ? "w-[260px]" : "w-[360px]";

  return (
    <button
      type="button"
      onClick={() => ready && onOpen(post)}
      disabled={!ready}
      aria-label={`Preview ${post.title} — ${meta.label} (${language.toUpperCase()})`}
      className={`group relative shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-100 bg-white text-left transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 ${widthClass} ${
        ready ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(15,23,42,0.3)]" : "cursor-default"
      }`}
      style={{ opacity: ready ? 1 : 0.4 }}
    >
      <div className={`relative ${ASPECT_CLASS[aspect]} bg-slate-100`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG thumbnails are
            tiny static demo assets we ship; next/image+SVG would require
            dangerouslyAllowSVG and adds no real perf win at this scale. */}
        <img
          src={thumbnailUrl}
          alt={`${post.title} — ${meta.label} (${language.toUpperCase()})`}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          loading="lazy"
        />
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium text-white">
          {LANGUAGE_FLAGS[language]} {language.toUpperCase()}
        </span>
        {ready ? (
          <span className="absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-violet)] text-white">
            <Check className="h-3 w-3" aria-hidden />
          </span>
        ) : null}
        {ready ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-slate-900/85 to-transparent px-2.5 py-1.5 text-[10px] font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="truncate">{post.handle}</span>
            <span className="inline-flex items-center gap-1">
              Preview <ExternalLink className="h-3 w-3 flex-shrink-0" aria-hidden />
            </span>
          </span>
        ) : null}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-label text-slate-900">{post.caption}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="line-clamp-1 text-[10px] text-slate-400">
            {post.hashtags.slice(0, 2).join(" ")}
          </span>
          <span className="inline-flex flex-shrink-0 items-center gap-1 text-[10px] font-medium text-[var(--brand-violet)]">
            <Heart className="h-3 w-3" aria-hidden /> {primaryMetric}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Post preview modal (native-platform chrome) ───────────────────────────

function PostPreviewModal({
  post,
  onClose,
}: {
  post: DemoSocialPost;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = CHANNEL_META[post.channel];
  const thumbnailUrl = `/demo-assets/social/${post.language}-${post.channel}.svg`;
  const fullCaption = `${post.caption}\n\n${post.hashtags.join(" ")}`;
  const artWidthClass =
    meta.aspect === "vertical"
      ? "w-[260px]"
      : meta.aspect === "square"
        ? "w-[360px]"
        : "w-full sm:w-[460px]";

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(fullCaption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // best-effort — clipboard may be unavailable
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-900/55 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${post.label} post preview`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col gap-6 overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 sm:flex-row sm:p-7"
        style={{ animation: "demoPopIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes demoPopIn {
            0% { transform: scale(0.9); opacity: 0; }
            80% { transform: scale(1.02); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
        {/* Native artwork */}
        <div className={`mx-auto flex-shrink-0 ${artWidthClass}`}>
          <div
            className={`overflow-hidden rounded-2xl border border-slate-100 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.35)] ${ASPECT_CLASS[meta.aspect]}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static demo SVG */}
            <img
              src={thumbnailUrl}
              alt={`${post.title} — ${post.label}`}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {/* Meta panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                <ChannelIcon channel={post.channel} />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-label text-slate-900">{post.label}</span>
                <span className="text-[11px] text-slate-400">
                  {post.handle} · {LANGUAGE_FLAGS[post.language]} {post.language.toUpperCase()}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <XIcon className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {post.type === "text" ? (
              <MessageCircle className="h-3 w-3" aria-hidden />
            ) : post.type === "image" ? (
              <Sparkles className="h-3 w-3" aria-hidden />
            ) : (
              <Play className="h-3 w-3" aria-hidden />
            )}
            {POST_TYPE_LABEL[post.type]} post
            {post.durationLabel ? ` · ${post.durationLabel}` : ""}
          </span>

          <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-slate-800">
            {post.caption}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.hashtags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--brand-violet)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--brand-violet)]"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-slate-500">
            {post.metrics.views != null ? (
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" aria-hidden /> {formatMetric(post.metrics.views)}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5" aria-hidden /> {formatMetric(post.metrics.likes)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden /> {formatMetric(post.metrics.comments)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Repeat2 className="h-3.5 w-3.5" aria-hidden /> {formatMetric(post.metrics.shares)}
            </span>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
            <Link
              href={`/reader/books/${SEEDED_DEMO_BOOK_ID}`}
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--brand-violet)] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_22px_-6px_rgba(124,92,252,0.55)] transition hover:scale-[1.02] hover:bg-[var(--brand-violet-hover)] active:scale-[0.98]"
            >
              {post.cta}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={copyCaption}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[var(--brand-violet)]" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copied" : "Copy caption"}
            </button>
          </div>
        </div>
      </div>
    </div>
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

  // Hotkey 3 dispatches POD_MODAL_EVENT after navigating to /distribute.
  // Honor it: enable + open modal so the presenter never has to fumble.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = () => {
      setEnabled(true);
      setShowModal(true);
    };
    window.addEventListener(POD_MODAL_EVENT, onOpen);
    return () => window.removeEventListener(POD_MODAL_EVENT, onOpen);
  }, []);

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
      className={`group mx-auto flex max-w-md cursor-pointer items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 transition-colors ${
        enabled
          ? "border-[var(--brand-violet)]/30"
          : "border-slate-100 hover:border-slate-200"
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
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
          enabled
            ? "bg-[var(--brand-violet)] text-white"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        <Printer className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-900">
          Enable global print
          {enabled ? (
            <Check className="h-3 w-3 text-[var(--brand-violet)]" aria-hidden />
          ) : null}
        </span>
        <span className="text-[11px] text-slate-500">
          {POD_PARTNERS.length} print partners · live in 24 h
        </span>
      </span>
      {showModal ? <PodModal onClose={() => setShowModal(false)} /> : null}
    </label>
  );
}

function PodModal({ onClose }: { onClose: () => void }) {
  // Backdrop click + Esc both dismiss — the live presenter needs to be
  // able to recover instantly if they hit the Launch CTA next.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Print on demand — partners notified"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6"
        style={{ animation: "demoPopIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        onClick={(e) => e.stopPropagation()}
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
            className="rounded-md bg-[#0F172A] px-4 py-2 text-label font-medium text-white hover:bg-[#1E293B]"
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
    // Auto-fade after 6s — investor needs time to read the headline.
    // Click anywhere or press Esc to dismiss earlier.
    const id = window.setTimeout(() => setVisible(false), 6000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisible(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[1500] flex cursor-pointer items-center justify-center bg-slate-900/10 backdrop-blur-[2px]"
      aria-live="polite"
      onClick={() => setVisible(false)}
    >
      <div
        className="rounded-3xl border border-slate-200 bg-white px-12 py-10 text-center shadow-[0_24px_72px_-12px_rgba(15,23,42,0.25)]"
        style={{ animation: "demoSummaryPop 360ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          Live · 35 seconds end-to-end
        </p>
        <p className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[32px]">
          10 languages · audiobook · {DEMO_POST_COUNT} native posts
        </p>
        <p className="mt-2 text-[14px] font-medium text-[var(--brand-violet)]">
          $0 ad-budget · ~380M global reach
        </p>
        <Link
          href={`/reader/books/${SEEDED_DEMO_BOOK_ID}`}
          className="group mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--brand-violet)] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_22px_-6px_rgba(124,92,252,0.55)] transition hover:scale-[1.02] hover:bg-[var(--brand-violet-hover)] active:scale-[0.98]"
        >
          See it live in the reader
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-slate-400">
          Press 5 · click anywhere · Esc to close
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-violet)] text-white"
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
