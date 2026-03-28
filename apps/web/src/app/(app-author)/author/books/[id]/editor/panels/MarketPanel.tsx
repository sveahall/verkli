"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { LANGUAGE_OPTIONS, type SupportedLanguage } from "@/lib/languages";

type MarketingChannel = "generic" | "tiktok" | "instagram" | "x";

const CHANNELS: { value: MarketingChannel; label: string; icon: React.ReactNode }[] = [
  {
    value: "generic",
    label: "General",
    icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>,
  },
  {
    value: "tiktok",
    label: "TikTok",
    icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.7a8.16 8.16 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.13Z" /></svg>,
  },
  {
    value: "instagram",
    label: "Instagram",
    icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>,
  },
  {
    value: "x",
    label: "X",
    icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
  },
];

type MarketingCampaignRow = {
  id: string;
  book_id: string;
  language: string;
  channel: string;
  status: string;
  headline: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string | null;
  share_url: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketPanelProps = {
  bookId: string;
  isPublished: boolean;
  marketingCampaigns: MarketingCampaignRow[];
  isProLocked: boolean;
  proLockMessage: string;
  billingLoading: boolean;
  onGenerateCopy: (channel: MarketingChannel, language: string) => Promise<void>;
  isGenerating: boolean;
};

function statusLabel(status: string): string {
  if (status === "generated" || status === "published") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "pending" || status === "generating") return "Generating...";
  return "Draft";
}

function statusColor(status: string): string {
  if (status === "generated" || status === "published")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (status === "failed")
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  if (status === "pending" || status === "generating")
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  return "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/50";
}

export default function MarketPanel({
  bookId,
  isPublished,
  marketingCampaigns,
  isProLocked,
  proLockMessage,
  billingLoading,
  onGenerateCopy,
  isGenerating,
}: MarketPanelProps) {
  const [selectedChannel, setSelectedChannel] = useState<MarketingChannel>("generic");
  const [language, setLanguage] = useState<SupportedLanguage>("en");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Find campaign for current channel + language
  const currentCampaign = useMemo(
    () => marketingCampaigns.find((c) => c.channel === selectedChannel && c.language === language) ?? null,
    [marketingCampaigns, selectedChannel, language],
  );

  // Group all campaigns by channel
  const campaignsByChannel = useMemo(() => {
    const map = new Map<string, MarketingCampaignRow[]>();
    for (const c of marketingCampaigns) {
      const arr = map.get(c.channel) ?? [];
      arr.push(c);
      map.set(c.channel, arr);
    }
    return map;
  }, [marketingCampaigns]);

  const handleCopy = useCallback(async () => {
    if (!currentCampaign) return;
    const parts: string[] = [];
    if (currentCampaign.caption) parts.push(currentCampaign.caption);
    if (currentCampaign.hashtags) parts.push(currentCampaign.hashtags);
    if (currentCampaign.share_url) {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      parts.push(`${baseUrl}${currentCampaign.share_url}`);
    }
    const text = parts.join("\n\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback(null);
    }
  }, [currentCampaign]);

  const readerUrl = `/reader/books/${bookId}`;

  // Not published gate
  if (!isPublished) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/[0.05] bg-white/60 p-10 text-center backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="rounded-full bg-slate-100 p-4 dark:bg-white/[0.06]">
            <svg className="h-8 w-8 text-slate-400 dark:text-white/30" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Publish first to start marketing</h2>
          <p className="max-w-md text-sm text-slate-500 dark:text-white/50">
            Your book needs to be published before you can generate marketing copy or create trailers. Go to the Publish tab to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Two paths: Quick copy + Trailer studio ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Trailer studio card */}
        <Link
          href={`/author/marketing?bookId=${bookId}`}
          className="group flex flex-col gap-3 rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm transition hover:border-[#907AFF]/30 hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-[#907AFF]/30"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-[#907AFF] to-[#7c6ae6] p-2.5 text-white shadow-sm">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">AI Trailer Studio</h3>
              <p className="text-[11px] text-slate-400 dark:text-white/40">Create a book trailer with AI</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-white/50">
            Generate AI-powered video trailers for TikTok, Instagram Reels, and more.
          </p>
          <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-[#907AFF] transition group-hover:gap-2">
            Open studio
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
          </span>
        </Link>

        {/* Reader link card */}
        <div className="flex flex-col gap-3 rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white shadow-sm dark:bg-white dark:text-slate-900">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Share link</h3>
              <p className="text-[11px] text-slate-400 dark:text-white/40">Direct reader link</p>
            </div>
          </div>
          <a
            href={readerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate rounded-lg border border-black/[0.06] bg-slate-50 px-3 py-2 text-xs font-mono text-[#5c4bb8] transition hover:bg-slate-100 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-[#b8a9ff] dark:hover:bg-white/[0.06]"
          >
            {typeof window !== "undefined" ? window.location.origin : ""}{readerUrl}
          </a>
          <button
            type="button"
            onClick={async () => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}${readerUrl}`;
              await navigator.clipboard.writeText(url);
              setCopyFeedback("Link copied!");
              setTimeout(() => setCopyFeedback(null), 2000);
            }}
            className="mt-auto rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
          >
            {copyFeedback === "Link copied!" ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>

      {/* ── Channel selector ── */}
      <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
            Launch copy
          </h3>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Channel tabs */}
        <div className="mb-5 flex gap-2">
          {CHANNELS.map((ch) => {
            const isActive = selectedChannel === ch.value;
            const hasCampaign = campaignsByChannel.has(ch.value);
            return (
              <button
                key={ch.value}
                type="button"
                onClick={() => setSelectedChannel(ch.value)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-white/[0.04] dark:text-white/60 dark:hover:bg-white/[0.08]"
                }`}
              >
                <span className={isActive ? "text-white dark:text-slate-900" : "text-slate-400 dark:text-white/30"}>
                  {ch.icon}
                </span>
                {ch.label}
                {hasCampaign && !isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Campaign content */}
        {currentCampaign ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor(currentCampaign.status)}`}>
                {statusLabel(currentCampaign.status)}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-white/30">
                Updated {new Date(currentCampaign.updated_at).toLocaleDateString("en", { month: "short", day: "numeric" })}
              </span>
            </div>

            <div className="space-y-3">
              {currentCampaign.headline && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">Headline</p>
                  <p className="whitespace-pre-wrap rounded-lg border border-black/[0.06] bg-slate-50 px-3 py-2.5 text-sm text-slate-800 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white/90">
                    {currentCampaign.headline}
                  </p>
                </div>
              )}
              {currentCampaign.caption && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">Caption</p>
                  <p className="whitespace-pre-wrap rounded-lg border border-black/[0.06] bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-800 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white/90">
                    {currentCampaign.caption}
                  </p>
                </div>
              )}
              {currentCampaign.cta && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">Call to action</p>
                  <p className="rounded-lg border border-black/[0.06] bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white/90">
                    {currentCampaign.cta}
                  </p>
                </div>
              )}
              {currentCampaign.hashtags && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">Hashtags</p>
                  <p className="rounded-lg border border-black/[0.06] bg-slate-50 px-3 py-2.5 text-sm text-[#5c4bb8] dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-[#b8a9ff]">
                    {currentCampaign.hashtags}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
              >
                {copyFeedback === "Copied!" ? "Copied!" : "Copy all to clipboard"}
              </button>
              <button
                type="button"
                onClick={() => void onGenerateCopy(selectedChannel, language)}
                disabled={isGenerating || isProLocked}
                className="rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
              >
                {isGenerating ? "Regenerating..." : "Regenerate"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-black/[0.08] bg-slate-50/50 py-8 dark:border-white/[0.08] dark:bg-white/[0.01]">
              <svg className="h-8 w-8 text-slate-300 dark:text-white/20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
              <p className="text-sm text-slate-500 dark:text-white/50">
                No copy generated yet for <span className="font-medium">{CHANNELS.find((c) => c.value === selectedChannel)?.label}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onGenerateCopy(selectedChannel, language)}
              disabled={isGenerating || isProLocked}
              className="w-full rounded-xl bg-gradient-to-b from-[#907AFF] to-[#7c6ae6] px-4 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(144,122,255,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:shadow-[0_4px_12px_rgba(144,122,255,0.35)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating
                ? "Generating..."
                : isProLocked
                  ? billingLoading ? "Checking subscription..." : "Generate copy (Pro)"
                  : "Generate launch copy"}
            </button>
          </div>
        )}

        {isProLocked && (
          <div className="mt-4 rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/5">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {proLockMessage}{" "}
              {!billingLoading && (
                <Link href="/author/billing" className="font-medium underline">
                  Manage subscription
                </Link>
              )}
            </p>
          </div>
        )}
      </div>

      {/* ── Existing campaigns overview ── */}
      {marketingCampaigns.length > 0 && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
            Generated campaigns
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {marketingCampaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedChannel(c.channel as MarketingChannel);
                  setLanguage(c.language as SupportedLanguage);
                }}
                className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
                  c.channel === selectedChannel && c.language === language
                    ? "border-[#907AFF]/40 bg-[#907AFF]/[0.06] dark:border-[#907AFF]/30 dark:bg-[#907AFF]/10"
                    : "border-black/[0.06] bg-white hover:border-black/[0.12] dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.12]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 dark:text-white/30">
                    {CHANNELS.find((ch) => ch.value === c.channel)?.icon}
                  </span>
                  <div>
                    <span className="text-[13px] font-medium text-slate-700 dark:text-white/80">
                      {CHANNELS.find((ch) => ch.value === c.channel)?.label ?? c.channel}
                    </span>
                    <span className="ml-2 text-[11px] text-slate-400 dark:text-white/30">
                      {LANGUAGE_OPTIONS.find((l) => l.value === c.language)?.label ?? c.language}
                    </span>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(c.status)}`}>
                  {statusLabel(c.status)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
