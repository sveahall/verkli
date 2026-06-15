"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { getLanguageLabel } from "@/lib/languages";
import { getAudiobookStatusLabel } from "../bookEditor.shared";
import { countWordsInContent } from "@/lib/tiptap-content";
import type { Tool } from "../BookEditorView.types";

type Chapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
  book_version_id: string;
};

type BookVersion = {
  id: string;
  language_code: string;
  status: string;
  published_at?: string | null;
  published_chapter_count?: number | null;
  error_message?: string | null;
};

type PrintOnDemandSettings = {
  enabled: boolean;
  formats: string[];
  editionLimit: "unlimited" | "limited";
  limitCount: number | null;
};

type MarketingCampaignRow = {
  id: string;
  channel: string;
  status: string;
  language: string;
};

export type ReviewPanelProps = {
  bookId: string;
  bookTitle: string;
  chapters: Chapter[];
  bookVersions: BookVersion[];
  activeVersion: BookVersion | null;
  coverImageUrl: string | null;
  audiobookStatus: string | null;
  isPublished: boolean;
  printOnDemandSettings: PrintOnDemandSettings | null;
  pricingModel: string;
  priceAmountMinor: number;
  priceCurrency: string;
  marketingCampaigns: MarketingCampaignRow[];
  onNavigate: (panel: Tool) => void;
  onPublish?: () => void;
};

/* ── Copy-to-clipboard helper ── */

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
    >
      {copied ? (
        <>
          <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
          Copy link
        </>
      )}
    </button>
  );
}

/* ── Helpers ── */

const countWords = countWordsInContent;

function formatPrice(minor: number, currency: string): string {
  if (minor === 0) return "Free";
  return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/* ── Section card ── */

function Section({
  title,
  children,
  status,
  action,
}: {
  title: string;
  children: React.ReactNode;
  status?: "ok" | "warning" | "missing";
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="flex items-center justify-between border-b border-black/[0.05] px-5 py-3 dark:border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          {status && (
            <span
              className={`h-2 w-2 rounded-full ${
                status === "ok"
                  ? "bg-emerald-500"
                  : status === "warning"
                    ? "bg-amber-400"
                    : "bg-slate-300 dark:bg-white/20"
              }`}
            />
          )}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
            {title}
          </h3>
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-[#907AFF] transition hover:bg-[#907AFF]/10"
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

/* ── Issue row ── */

function Issue({ text, onFix }: { text: string; onFix: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-2.5 dark:border-amber-500/15 dark:bg-amber-500/5">
      <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
        <span>{text}</span>
      </div>
      <button
        type="button"
        onClick={onFix}
        className="shrink-0 rounded-lg px-3 py-1 text-[11px] font-semibold text-[#907AFF] transition hover:bg-[#907AFF]/10"
      >
        Fix
      </button>
    </div>
  );
}

/* ── Main ── */

export default function ReviewPanel({
  bookId,
  bookTitle,
  chapters,
  bookVersions,
  activeVersion,
  coverImageUrl,
  audiobookStatus,
  isPublished,
  printOnDemandSettings,
  pricingModel,
  priceAmountMinor,
  priceCurrency,
  marketingCampaigns,
  onNavigate,
  onPublish,
}: ReviewPanelProps) {
  const totalWords = useMemo(
    () => chapters.reduce((sum, ch) => sum + countWords(ch.content), 0),
    [chapters],
  );

  const emptyChapters = useMemo(
    () => chapters.filter((ch) => countWords(ch.content) === 0),
    [chapters],
  );

  const languages = useMemo(
    () => bookVersions.map((v) => getLanguageLabel(v.language_code)),
    [bookVersions],
  );

  const publishedVersions = useMemo(
    () => bookVersions.filter((v) => v.published_at),
    [bookVersions],
  );

  const podSettings = printOnDemandSettings ?? { enabled: false, formats: [] as string[], editionLimit: "unlimited" as const, limitCount: 0 };
  const audioLabel = audiobookStatus ? getAudiobookStatusLabel(audiobookStatus) : "Not started";
  const audioReady = audiobookStatus === "generated" || audiobookStatus === "completed" || audiobookStatus === "published";
  const hasCover = Boolean(coverImageUrl);
  const hasContent = totalWords > 0 && chapters.length > 0;
  const campaignCount = marketingCampaigns.filter((c) => c.status === "generated" || c.status === "published").length;

  /* ── Issues ── */
  const issues: Array<{ text: string; panel: Tool }> = [];
  if (!hasContent) issues.push({ text: "No chapter content yet", panel: "edit" });
  if (emptyChapters.length > 0 && hasContent)
    issues.push({ text: `${emptyChapters.length} empty chapter${emptyChapters.length > 1 ? "s" : ""}`, panel: "edit" });
  if (!hasCover) issues.push({ text: "No cover image", panel: "cover" });
  if (priceAmountMinor === 0 && pricingModel === "book_only")
    issues.push({ text: "Book is set to free \u2014 set a price if you want to earn", panel: "publish" });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* ── Hero: Book identity ── */}
      <div className="grid items-start gap-6 rounded-2xl border border-black/[0.05] bg-white/60 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] sm:grid-cols-[140px_1fr]">
        <div className="relative mx-auto aspect-[3/4] w-[140px] overflow-hidden rounded-xl border border-black/[0.06] bg-slate-50 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02] sm:mx-0">
          {coverImageUrl ? (
            <Image src={coverImageUrl} alt="Book cover" fill sizes="140px" className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-white/15">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                isPublished
                  ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
              }`}
            >
              {isPublished ? "Published" : "Draft"}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {bookTitle}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
            <div>
              <span className="text-slate-400 dark:text-white/40">Chapters</span>
              <p className="font-semibold text-slate-800 dark:text-white/80">{chapters.length}</p>
            </div>
            <div>
              <span className="text-slate-400 dark:text-white/40">Words</span>
              <p className="font-semibold tabular-nums text-slate-800 dark:text-white/80">{totalWords.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-slate-400 dark:text-white/40">Languages</span>
              <p className="font-semibold text-slate-800 dark:text-white/80">{languages.length > 0 ? languages.join(", ") : "\u2014"}</p>
            </div>
            <div>
              <span className="text-slate-400 dark:text-white/40">Price</span>
              <p className="font-semibold text-slate-800 dark:text-white/80">{formatPrice(priceAmountMinor, priceCurrency)}</p>
            </div>
            <div>
              <span className="text-slate-400 dark:text-white/40">Audio</span>
              <p className={`font-semibold ${audioReady ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-white/80"}`}>
                {audioLabel}
              </p>
            </div>
            <div>
              <span className="text-slate-400 dark:text-white/40">Print</span>
              <p className="font-semibold text-slate-800 dark:text-white/80">
                {podSettings.enabled ? podSettings.formats.join(", ") : "Off"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      {isPublished && (
        <div className="flex flex-wrap gap-3">
          <a
            href={`/reader/books/${bookId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:bg-[#1E293B] hover:shadow-[0_4px_12px_rgba(15,23,42,0.35)] active:scale-[0.97]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            Preview as reader
          </a>
          <CopyLinkButton url={`${typeof window !== "undefined" ? window.location.origin : ""}/reader/books/${bookId}`} />
          <button
            type="button"
            onClick={() => onNavigate("market")}
            className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
            </svg>
            Promote
          </button>
        </div>
      )}

      {/* ── Issues ── */}
      {issues.length > 0 && (
        <div className="space-y-2">
          {issues.map((issue) => (
            <Issue key={issue.text} text={issue.text} onFix={() => onNavigate(issue.panel)} />
          ))}
        </div>
      )}

      {/* ── Content preview ── */}
      <Section
        title="Content"
        status={hasContent ? (emptyChapters.length > 0 ? "warning" : "ok") : "missing"}
        action={{ label: "Edit", onClick: () => onNavigate("edit") }}
      >
        <div className="max-h-[260px] overflow-y-auto">
          {chapters.map((ch, i) => {
            const words = countWords(ch.content);
            return (
              <div
                key={ch.id}
                className="flex items-center justify-between border-b border-black/[0.03] py-2 last:border-b-0 dark:border-white/[0.03]"
              >
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="w-5 text-right tabular-nums text-slate-400 dark:text-white/30">{i + 1}</span>
                  <span className="text-slate-700 dark:text-white/70">{ch.title}</span>
                </div>
                <span className={`text-[11px] tabular-nums ${words > 0 ? "text-slate-400 dark:text-white/35" : "text-amber-500"}`}>
                  {words > 0 ? `${words.toLocaleString()} words` : "empty"}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Translations ── */}
      {bookVersions.length > 1 && (
        <Section
          title="Translations"
          status={publishedVersions.length > 0 ? "ok" : "warning"}
          action={{ label: "Manage", onClick: () => onNavigate("translate") }}
        >
          <div className="space-y-2">
            {bookVersions.map((v) => {
              const isOriginal = v.id === activeVersion?.id;
              return (
                <div key={v.id} className="flex items-center justify-between text-[13px]">
                  <span className={isOriginal ? "font-semibold text-[#907AFF]" : "text-slate-700 dark:text-white/70"}>
                    {getLanguageLabel(v.language_code)}
                    {isOriginal && <span className="ml-1.5 text-[10px] font-normal text-slate-400 dark:text-white/30">(original)</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    {v.error_message && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">Error</span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        v.published_at
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
                      }`}
                    >
                      {v.published_at ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Assets ── */}
      <Section title="Assets">
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onNavigate("cover")}
            className="flex items-center gap-3 rounded-xl border border-black/[0.04] bg-slate-50/50 px-3 py-3 text-left transition-[border-color,transform] duration-150 ease-out hover:border-black/[0.08] active:scale-[0.97] dark:border-white/[0.04] dark:bg-white/[0.02] dark:hover:border-white/[0.08]"
          >
            {coverImageUrl ? (
              <div className="relative h-10 w-7 overflow-hidden rounded">
                <Image src={coverImageUrl} alt="" fill sizes="28px" className="object-cover" unoptimized />
              </div>
            ) : (
              <div className="flex h-10 w-7 items-center justify-center rounded bg-slate-200/50 dark:bg-white/[0.06]">
                <svg className="h-3.5 w-3.5 text-slate-400 dark:text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159" />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/70">Cover</p>
              <p className="text-[11px] text-slate-400 dark:text-white/35">{hasCover ? "Ready" : "Missing"}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("audiobook")}
            className="flex items-center gap-3 rounded-xl border border-black/[0.04] bg-slate-50/50 px-3 py-3 text-left transition-[border-color,transform] duration-150 ease-out hover:border-black/[0.08] active:scale-[0.97] dark:border-white/[0.04] dark:bg-white/[0.02] dark:hover:border-white/[0.08]"
          >
            <div className={`flex h-10 w-7 items-center justify-center rounded ${audioReady ? "bg-emerald-100/50 dark:bg-emerald-900/20" : "bg-slate-200/50 dark:bg-white/[0.06]"}`}>
              <svg className={`h-3.5 w-3.5 ${audioReady ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-white/25"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/70">Audiobook</p>
              <p className="text-[11px] text-slate-400 dark:text-white/35">{audioLabel}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("publish")}
            className="flex items-center gap-3 rounded-xl border border-black/[0.04] bg-slate-50/50 px-3 py-3 text-left transition-[border-color,transform] duration-150 ease-out hover:border-black/[0.08] active:scale-[0.97] dark:border-white/[0.04] dark:bg-white/[0.02] dark:hover:border-white/[0.08]"
          >
            <div className={`flex h-10 w-7 items-center justify-center rounded ${podSettings.enabled ? "bg-blue-100/50 dark:bg-blue-900/20" : "bg-slate-200/50 dark:bg-white/[0.06]"}`}>
              <svg className={`h-3.5 w-3.5 ${podSettings.enabled ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-white/25"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/70">Print</p>
              <p className="text-[11px] text-slate-400 dark:text-white/35">
                {podSettings.enabled ? podSettings.formats.join(", ") : "Not configured"}
              </p>
            </div>
          </button>
        </div>
      </Section>

      {/* ── Marketing ── */}
      <Section
        title="Marketing"
        status={campaignCount > 0 ? "ok" : "missing"}
        action={{ label: campaignCount > 0 ? "Manage" : "Create", onClick: () => onNavigate("market") }}
      >
        {campaignCount > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-white/60">
              {campaignCount} campaign{campaignCount > 1 ? "s" : ""} generated and ready.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("market")}
              className="flex items-center gap-2 text-xs font-semibold text-[#907AFF] transition hover:text-[#7c6ae6]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Generate more campaigns
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-white/50">
              No marketing campaigns yet. Generate social media posts, email copy, and more.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("market")}
              className="rounded-xl bg-[#907AFF]/10 px-4 py-2 text-xs font-semibold text-[#907AFF] transition-[background-color,transform] duration-150 ease-out hover:bg-[#907AFF]/20 active:scale-[0.97]"
            >
              Create first campaign
            </button>
          </div>
        )}
      </Section>

      {/* ── Primary action ── */}
      {!isPublished && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onPublish ?? (() => onNavigate("publish"))}
            disabled={!hasContent}
            className="w-full rounded-2xl bg-[#0F172A] px-6 py-4 text-base font-bold text-white shadow-[0_4px_20px_rgba(15,23,42,0.30),inset_0_1px_0_rgba(255,255,255,0.08)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:bg-[#1E293B] hover:shadow-[0_6px_28px_rgba(15,23,42,0.40)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Publish book
          </button>
        </div>
      )}
    </div>
  );
}
