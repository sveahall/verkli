"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Period = "7d" | "30d" | "all";

type Overview = {
  views: number;
  reads: number;
  purchases: number;
  bookmarks: number;
  revenue: number;
  currency: string;
};

type Readers = {
  total: number;
  active: number;
  avgProgress: number;
  completionRate: number;
};

type ReviewEntry = {
  rating: number;
  content: string | null;
  created_at: string;
};

type Reviews = {
  count: number;
  averageRating: number;
  recent: ReviewEntry[];
};

type DailyPoint = {
  date: string;
  views: number;
  reads: number;
};

type StatsData = {
  overview: Overview;
  readers: Readers;
  reviews: Reviews;
  dailyChart: DailyPoint[];
};

export type StatisticsPanelProps = {
  bookId: string;
  isPublished: boolean;
};

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 dagar",
  "30d": "30 dagar",
  all: "Alla",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("sv-SE");
}

// ─── Sub-components ──────────────────────────────────────────────────────

function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  color = "#907AFF",
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-100 dark:stroke-white/[0.08]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          strokeLinecap="round"
          stroke={color}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">
        {pct}%
      </span>
    </div>
  );
}

function MiniBarChart({ data }: { data: DailyPoint[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.views + d.reads), 1);

  return (
    <div className="flex items-end gap-[3px]" style={{ height: 72 }}>
      {data.map((d) => {
        const total = d.views + d.reads;
        const h = (total / max) * 100;
        const readsPct = total > 0 ? (d.reads / total) * h : 0;
        const viewsPct = h - readsPct;
        return (
          <div
            key={d.date}
            className="group relative flex flex-1 flex-col justify-end"
            style={{ minWidth: 3, maxWidth: 18, height: "100%" }}
          >
            <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-medium text-white shadow-lg group-hover:block dark:bg-white dark:text-slate-900">
              {d.date.slice(5)} &middot; {d.views} visn. &middot; {d.reads} läsn.
            </div>
            <div
              className="w-full rounded-t-sm bg-[#907AFF]/40"
              style={{ height: `${readsPct}%`, minHeight: readsPct > 0 ? 2 : 0 }}
            />
            <div
              className="w-full bg-[#907AFF] transition-all group-hover:bg-[#7c6ae6]"
              style={{
                height: `${viewsPct}%`,
                minHeight: viewsPct > 0 ? 2 : 0,
                borderRadius: readsPct > 0 ? 0 : "2px 2px 0 0",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={s <= rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
          className={s <= rating ? "text-amber-400" : "text-slate-200 dark:text-white/10"}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
          />
        </svg>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────

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
      setData(
        json ?? {
          overview: { views: 0, reads: 0, purchases: 0, bookmarks: 0, revenue: 0, currency: "SEK" },
          readers: { total: 0, active: 0, avgProgress: 0, completionRate: 0 },
          reviews: { count: 0, averageRating: 0, recent: [] },
          dailyChart: [],
        },
      );
    } catch {
      setData({
        overview: { views: 0, reads: 0, purchases: 0, bookmarks: 0, revenue: 0, currency: "SEK" },
        readers: { total: 0, active: 0, avgProgress: 0, completionRate: 0 },
        reviews: { count: 0, averageRating: 0, recent: [] },
        dailyChart: [],
      });
    } finally {
      setLoading(false);
    }
  }, [bookId, period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── Not published ──
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
              Publicera boken för att se statistik
            </h2>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
              Statistik samlas in när din bok är publicerad och läsare interagerar med den.
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
    <div className="mx-auto max-w-3xl space-y-5">
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
          {/* ── Hero metrics row ── */}
          <div className="rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="grid grid-cols-2 divide-x divide-black/[0.04] dark:divide-white/[0.04] sm:grid-cols-4">
              <HeroStat label="Visningar" value={fmt(data.overview.views)} />
              <HeroStat label="Läsningar" value={fmt(data.overview.reads)} />
              <HeroStat label="Bokmärken" value={fmt(data.overview.bookmarks)} />
              <HeroStat
                label="Intäkter"
                value={
                  data.overview.revenue > 0
                    ? `${data.overview.revenue.toLocaleString("sv-SE")} kr`
                    : "—"
                }
              />
            </div>
          </div>

          {/* ── Activity chart ── */}
          {data.dailyChart.length > 1 && (
            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-slate-700 dark:text-white/70">
                  Aktivitet
                </span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-white/30">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#907AFF]" />
                    Visningar
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-white/30">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#907AFF]/40" />
                    Läsningar
                  </span>
                </div>
              </div>
              <MiniBarChart data={data.dailyChart} />
            </div>
          )}

          {/* ── Reader funnel ── */}
          <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <span className="mb-4 block text-[12px] font-semibold text-slate-700 dark:text-white/70">
              Läsare
            </span>

            {data.readers.total > 0 ? (
              <div className="grid grid-cols-3 gap-6">
                {/* Reading progress ring */}
                <div className="flex flex-col items-center gap-1">
                  <ProgressRing value={data.readers.avgProgress} color="#907AFF" />
                  <span className="mt-1 text-[11px] font-medium text-slate-500 dark:text-white/40">
                    Snittläsning
                  </span>
                </div>

                {/* Completion ring */}
                <div className="flex flex-col items-center gap-1">
                  <ProgressRing value={data.readers.completionRate} color="#10b981" />
                  <span className="mt-1 text-[11px] font-medium text-slate-500 dark:text-white/40">
                    Slutfört
                  </span>
                </div>

                {/* Reader counts */}
                <div className="flex flex-col justify-center gap-3">
                  <div>
                    <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {data.readers.total}
                    </span>
                    <span className="ml-1.5 text-[11px] text-slate-400 dark:text-white/40">
                      totalt
                    </span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {data.readers.active}
                    </span>
                    <span className="ml-1.5 text-[11px] text-slate-400 dark:text-white/40">
                      aktiva (7d)
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
                  Inga läsare ännu — dela din bok för att komma igång.
                </span>
              </div>
            )}
          </div>

          {/* ── Reviews ── */}
          <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-slate-700 dark:text-white/70">
                Recensioner
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
                  Inga recensioner ännu.
                </span>
              </div>
            )}
          </div>

          {/* ── Contextual insight ── */}
          {hasAnyActivity ? (
            <InsightCard data={data} />
          ) : (
            <div className="rounded-2xl border border-dashed border-black/[0.06] bg-slate-50/40 px-5 py-6 text-center dark:border-white/[0.06] dark:bg-white/[0.01]">
              <p className="text-[13px] text-slate-400 dark:text-white/40">
                Ingen aktivitet ännu under {PERIOD_LABELS[period].toLowerCase()}.
                Dela boken via <span className="font-medium text-slate-500 dark:text-white/50">Market</span>-fliken
                för att nå läsare.
              </p>
            </div>
          )}

          {/* ── Link to full analytics ── */}
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
                <p className="text-[11px] text-slate-400 dark:text-white/40">Se statistik för alla böcker, trender och djupanalys</p>
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

// ─── Helpers ─────────────────────────────────────────────────────────────

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4 text-center">
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-400 dark:text-white/35">
        {label}
      </p>
    </div>
  );
}

function InsightCard({ data }: { data: StatsData }) {
  // Pick the single most interesting insight to show
  const insights: { icon: string; text: string; color: string }[] = [];

  if (data.reviews.averageRating >= 4 && data.reviews.count >= 2) {
    insights.push({
      icon: "star",
      text: `Snittbetyg ${data.reviews.averageRating}/5 baserat på ${data.reviews.count} recensioner.`,
      color: "amber",
    });
  }

  if (data.readers.total >= 5 && data.readers.completionRate >= 50) {
    insights.push({
      icon: "check",
      text: `${data.readers.completionRate}% av läsarna slutför boken — stark retention.`,
      color: "emerald",
    });
  }

  if (data.readers.active > 0) {
    insights.push({
      icon: "user",
      text: `${data.readers.active} aktiv${data.readers.active === 1 ? "" : "a"} läsare den senaste veckan.`,
      color: "blue",
    });
  }

  if (data.overview.bookmarks >= 3) {
    insights.push({
      icon: "bookmark",
      text: `${data.overview.bookmarks} läsare har sparat boken.`,
      color: "purple",
    });
  }

  if (data.readers.total >= 5 && data.readers.completionRate < 25) {
    insights.push({
      icon: "info",
      text: `${data.readers.completionRate}% slutförda — överväg att se över de första kapitlen.`,
      color: "amber",
    });
  }

  if (insights.length === 0) return null;

  const colorMap: Record<string, string> = {
    emerald: "border-emerald-200/50 bg-emerald-50/50 dark:border-emerald-500/15 dark:bg-emerald-500/5",
    amber: "border-amber-200/50 bg-amber-50/50 dark:border-amber-500/15 dark:bg-amber-500/5",
    blue: "border-blue-200/50 bg-blue-50/50 dark:border-blue-500/15 dark:bg-blue-500/5",
    purple: "border-[#907AFF]/15 bg-[#907AFF]/[0.04] dark:border-[#907AFF]/15 dark:bg-[#907AFF]/5",
  };

  const textColor: Record<string, string> = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
    blue: "text-blue-700 dark:text-blue-400",
    purple: "text-[#6C5CE7] dark:text-[#b8a9ff]",
  };

  // Show top 2 insights max
  return (
    <div className="space-y-2">
      {insights.slice(0, 2).map((ins, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${colorMap[ins.color]}`}
        >
          <svg
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${textColor[ins.color]}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            {ins.icon === "star" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
            )}
            {ins.icon === "check" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            )}
            {ins.icon === "user" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            )}
            {ins.icon === "bookmark" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            )}
            {ins.icon === "info" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            )}
          </svg>
          <span className={`text-[13px] leading-snug ${textColor[ins.color]}`}>
            {ins.text}
          </span>
        </div>
      ))}
    </div>
  );
}
