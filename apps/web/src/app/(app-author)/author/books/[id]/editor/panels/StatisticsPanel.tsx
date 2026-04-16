"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  HeroStat,
  InsightCard,
  MiniBarChart,
  ProgressRing,
  Stars,
  type StatsData,
} from "./StatisticsPanel.components";

type Period = "7d" | "30d" | "all";

export type StatisticsPanelProps = {
  bookId: string;
  isPublished: boolean;
};

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  all: "All",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("sv-SE");
}

const EMPTY_STATS: StatsData = {
  overview: { views: 0, reads: 0, purchases: 0, bookmarks: 0, revenue: 0, currency: "SEK" },
  readers: { total: 0, active: 0, avgProgress: 0, completionRate: 0 },
  reviews: { count: 0, averageRating: 0, recent: [] },
  dailyChart: [],
};

export default function StatisticsPanel({
  bookId,
  isPublished,
}: StatisticsPanelProps) {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/stats?period=${period}`);
      const json = (await res.json().catch(() => null)) as StatsData | null;
      setData(json ?? EMPTY_STATS);
    } catch {
      setData(EMPTY_STATS);
    } finally {
      setLoading(false);
    }
  }, [bookId, period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (!isPublished) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/[0.05] bg-white/60 p-12 text-center backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="rounded-2xl bg-gradient-to-br from-[#907AFF]/10 to-[#907AFF]/5 p-4">
            <svg className="h-8 w-8 text-[#907AFF]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Publish your book to see statistics
            </h2>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
              Statistics are collected once your book is published and readers interact with it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasAnyActivity =
    data &&
    (data.overview.views > 0 ||
      data.overview.reads > 0 ||
      data.readers.total > 0 ||
      data.overview.bookmarks > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Period selector */}
      <div className="flex items-center justify-end">
        <div className="flex gap-0.5 rounded-xl bg-slate-100/80 p-0.5 dark:bg-white/5">
          {(["7d", "30d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition-all ${
                period === p
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-[120px] animate-pulse rounded-2xl bg-slate-50 dark:bg-white/[0.02]" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[80px] animate-pulse rounded-2xl bg-slate-50 dark:bg-white/[0.02]" />
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          {/* Hero metrics row */}
          <div className="rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="grid grid-cols-2 divide-x divide-black/[0.04] dark:divide-white/[0.04] sm:grid-cols-4">
              <HeroStat label="Views" value={fmt(data.overview.views)} />
              <HeroStat label="Reads" value={fmt(data.overview.reads)} />
              <HeroStat label="Bookmarks" value={fmt(data.overview.bookmarks)} />
              <HeroStat
                label="Revenue"
                value={
                  data.overview.revenue > 0
                    ? `${data.overview.revenue.toLocaleString("sv-SE")} kr`
                    : "—"
                }
              />
            </div>
          </div>

          {/* Activity chart */}
          {data.dailyChart.length > 1 && (
            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-slate-700 dark:text-white/70">
                  Activity
                </span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-white/30">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#907AFF]" />
                    Views
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-white/30">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#907AFF]/40" />
                    Reads
                  </span>
                </div>
              </div>
              <MiniBarChart data={data.dailyChart} />
            </div>
          )}

          {/* Reader funnel */}
          <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <span className="mb-4 block text-[12px] font-semibold text-slate-700 dark:text-white/70">
              Readers
            </span>

            {data.readers.total > 0 ? (
              <div className="grid grid-cols-3 gap-6">
                <div className="flex flex-col items-center gap-1">
                  <ProgressRing value={data.readers.avgProgress} color="#907AFF" />
                  <span className="mt-1 text-[11px] font-medium text-slate-500 dark:text-white/40">
                    Avg. progress
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <ProgressRing value={data.readers.completionRate} color="#10b981" />
                  <span className="mt-1 text-[11px] font-medium text-slate-500 dark:text-white/40">
                    Completed
                  </span>
                </div>

                <div className="flex flex-col justify-center gap-3">
                  <div>
                    <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {data.readers.total}
                    </span>
                    <span className="ml-1.5 text-[11px] text-slate-400 dark:text-white/40">
                      total
                    </span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {data.readers.active}
                    </span>
                    <span className="ml-1.5 text-[11px] text-slate-400 dark:text-white/40">
                      active (7d)
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 px-4 py-3 dark:bg-white/[0.02]">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.06]">
                  <svg className="h-4 w-4 text-slate-300 dark:text-white/20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                </div>
                <span className="text-[13px] text-slate-400 dark:text-white/40">
                  No readers yet — share your book to get started.
                </span>
              </div>
            )}
          </div>

          {/* Reviews */}
          <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-slate-700 dark:text-white/70">
                Reviews
              </span>
              {data.reviews.count > 0 && (
                <div className="flex items-center gap-2">
                  <Stars rating={Math.round(data.reviews.averageRating)} />
                  <span className="text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">
                    {data.reviews.averageRating}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-white/30">
                    ({data.reviews.count})
                  </span>
                </div>
              )}
            </div>

            {data.reviews.recent.length > 0 ? (
              <div className="space-y-2.5">
                {data.reviews.recent.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-slate-50/80 px-4 py-3 dark:bg-white/[0.02]"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <Stars rating={r.rating} size={12} />
                      <span className="text-[10px] tabular-nums text-slate-400 dark:text-white/25">
                        {new Date(r.created_at).toLocaleDateString("sv-SE", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    {r.content && (
                      <p className="text-[13px] leading-relaxed text-slate-600 dark:text-white/55">
                        {r.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 px-4 py-3 dark:bg-white/[0.02]">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.06]">
                  <svg className="h-4 w-4 text-slate-300 dark:text-white/20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                  </svg>
                </div>
                <span className="text-[13px] text-slate-400 dark:text-white/40">
                  No reviews yet.
                </span>
              </div>
            )}
          </div>

          {/* Contextual insight */}
          {hasAnyActivity ? (
            <InsightCard data={data} />
          ) : (
            <div className="rounded-2xl border border-dashed border-black/[0.06] bg-slate-50/40 px-5 py-6 text-center dark:border-white/[0.06] dark:bg-white/[0.01]">
              <p className="text-[13px] text-slate-400 dark:text-white/40">
                No activity yet for the {PERIOD_LABELS[period].toLowerCase()} period.
                Share your book via the <span className="font-medium text-slate-500 dark:text-white/50">Market</span> tab
                to reach readers.
              </p>
            </div>
          )}

          {/* Link to full analytics */}
          <Link
            href="/author/analytics"
            className="group flex items-center justify-between rounded-2xl border border-black/[0.05] bg-white/60 px-5 py-4 backdrop-blur-sm transition hover:border-[#907AFF]/30 hover:shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-[#907AFF]/30"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#907AFF]/10 to-[#907AFF]/5">
                <svg className="h-4 w-4 text-[#907AFF]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Analytics Dashboard</p>
                <p className="text-[11px] text-slate-400 dark:text-white/40">View statistics for all books, trends, and in-depth analysis</p>
              </div>
            </div>
            <svg className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#907AFF] dark:text-white/20" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </>
      ) : null}
    </div>
  );
}
