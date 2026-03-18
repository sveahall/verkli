"use client";

import { useState, useEffect, useCallback, useId } from "react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "all";

type DailyPoint = { date: string; views: number; reads: number; purchases: number };

type AggregateStats = {
  views: number;
  reads: number;
  purchases: number;
  bookmarks: number;
  dailyChart: DailyPoint[];
};

type Revenue = {
  totalRevenue: number;
  orderRevenue: number;
  donationRevenue: number;
  currency: string;
};

type Engagement = {
  reviews: number;
  averageRating: number;
  bookmarks: number;
  followers: number;
};

type BookStat = {
  id: string;
  title: string;
  views: number;
  reads: number;
  purchases: number;
};

type DashboardData = {
  stats: AggregateStats | null;
  revenue: Revenue | null;
  engagement: Engagement | null;
  books: BookStat[];
};

// ─── Constants ───────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 dagar" },
  { value: "30d", label: "30 dagar" },
  { value: "all", label: "All tid" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("sv-SE");
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

/** Build smooth SVG path from points using monotone cubic interpolation */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
  }

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2.x},${p2.y}`;
  }
  return d;
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<DashboardData>({
    stats: null,
    revenue: null,
    engagement: null,
    books: [],
  });
  const [loading, setLoading] = useState(true);
  const [bookSort, setBookSort] = useState<"views" | "reads" | "purchases">("views");
  const [chartMetric, setChartMetric] = useState<"views" | "reads">("views");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, revenueRes, engagementRes, booksRes] = await Promise.all([
        fetch(`/api/author/stats?period=${period}`),
        fetch("/api/author/stats/revenue"),
        fetch("/api/author/stats/engagement"),
        fetch(`/api/author/stats/books?period=${period}`),
      ]);

      const [stats, revenue, engagement, booksJson] = await Promise.all([
        statsRes.ok ? (statsRes.json() as Promise<AggregateStats>) : null,
        revenueRes.ok ? (revenueRes.json() as Promise<Revenue>) : null,
        engagementRes.ok ? (engagementRes.json() as Promise<Engagement>) : null,
        booksRes.ok ? (booksRes.json() as Promise<{ books: BookStat[] }>) : null,
      ]);

      setData({
        stats,
        revenue,
        engagement,
        books: booksJson?.books ?? [],
      });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const sortedBooks = [...data.books].sort((a, b) => b[bookSort] - a[bookSort]);
  const totalViews = data.stats?.views ?? 0;
  const totalReads = data.stats?.reads ?? 0;
  const totalPurchases = data.stats?.purchases ?? 0;
  const totalBookmarks = data.stats?.bookmarks ?? 0;

  // Conversion rates
  const viewToReadRate = totalViews > 0 ? Math.round((totalReads / totalViews) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
      {/* ── Header with gradient accent ── */}
      <div className="mb-8">
        <div className="mb-1 flex items-center gap-2">
          <Link
            href="/author/home"
            className="text-[13px] text-slate-400 transition hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
          >
            Dashboard
          </Link>
          <span className="text-[13px] text-slate-300 dark:text-white/15">/</span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
              Analytics
            </h1>
            <p className="mt-1 text-[14px] text-slate-400 dark:text-white/35">
              Överblick av prestanda för alla dina böcker
            </p>
          </div>
          <div className="flex gap-0.5 rounded-xl bg-slate-100/80 p-0.5 dark:bg-white/5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-all ${
                  period === opt.value
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[120px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.03]" />
            ))}
          </div>
          <div className="h-[300px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.03]" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-[220px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.03]" />
            <div className="h-[220px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.03]" />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Hero KPI Cards ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Visningar"
              value={fmt(totalViews)}
              color="purple"
              iconPath="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
              iconPath2="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
            <KpiCard
              label="Läsningar"
              value={fmt(totalReads)}
              color="blue"
              iconPath="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
            />
            <KpiCard
              label="Köp"
              value={fmt(totalPurchases)}
              color="emerald"
              iconPath="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
            />
            <KpiCard
              label="Följare"
              value={fmt(data.engagement?.followers ?? 0)}
              color="amber"
              iconPath="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
            />
          </div>

          {/* ── Activity Chart ── */}
          <ActivityChart
            dailyData={data.stats?.dailyChart ?? []}
            metric={chartMetric}
            onMetricChange={setChartMetric}
          />

          {/* ── Conversion Funnel + Engagement ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Conversion Funnel */}
            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
              <h3 className="mb-5 text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
                Konverteringstratt
              </h3>
              <FunnelChart
                views={totalViews}
                reads={totalReads}
                purchases={totalPurchases}
                bookmarks={totalBookmarks}
              />
            </div>

            {/* Engagement */}
            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
              <h3 className="mb-5 text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
                Engagemang
              </h3>
              <div className="space-y-4">
                {/* Rating */}
                <div className="flex items-center gap-4 rounded-xl bg-slate-50/80 px-4 py-3 dark:bg-white/[0.03]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                    <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {data.engagement && data.engagement.averageRating > 0
                          ? data.engagement.averageRating.toFixed(1)
                          : "—"}
                      </span>
                      <span className="text-[13px] text-slate-400 dark:text-white/35">/ 5</span>
                      <Stars rating={data.engagement?.averageRating ?? 0} size={14} />
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-white/35">
                      Snittbetyg ({fmt(data.engagement?.reviews ?? 0)} recensioner)
                    </p>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3">
                  <EngagementStat
                    value={fmt(data.engagement?.bookmarks ?? 0)}
                    label="Bokmärken"
                    color="text-[#907AFF]"
                    bgColor="bg-[#907AFF]/10"
                    iconPath="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                  />
                  <EngagementStat
                    value={fmt(data.engagement?.followers ?? 0)}
                    label="Följare"
                    color="text-rose-500"
                    bgColor="bg-rose-500/10"
                    iconPath="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
                  />
                  <EngagementStat
                    value={`${viewToReadRate}%`}
                    label="Läsgrad"
                    color="text-blue-500"
                    bgColor="bg-blue-500/10"
                    iconPath="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Revenue ── */}
          <RevenueCard revenue={data.revenue} />

          {/* ── Per-book Performance ── */}
          <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
                  Per bok
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/25">
                  {sortedBooks.length} {sortedBooks.length === 1 ? "bok" : "böcker"} totalt
                </p>
              </div>
              <div className="flex gap-1 rounded-lg bg-slate-100/80 p-0.5 dark:bg-white/5">
                {(["views", "reads", "purchases"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setBookSort(s)}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
                      bookSort === s
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                        : "text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
                    }`}
                  >
                    {{ views: "Visningar", reads: "Läsningar", purchases: "Köp" }[s]}
                  </button>
                ))}
              </div>
            </div>

            {sortedBooks.length > 0 ? (
              <div className="space-y-1.5">
                {sortedBooks.map((book, idx) => {
                  const maxVal = Math.max(sortedBooks[0]?.[bookSort] ?? 1, 1);
                  const barWidth = (book[bookSort] / maxVal) * 100;
                  const isTop = idx === 0;
                  return (
                    <Link
                      key={book.id}
                      href={`/author/books/${book.id}?tool=statistics`}
                      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    >
                      {/* Rank badge */}
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                        isTop
                          ? "bg-gradient-to-br from-[#907AFF] to-[#7c6ae6] text-white"
                          : idx < 3
                            ? "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
                            : "text-slate-300 dark:text-white/15"
                      }`}>
                        {idx + 1}
                      </div>

                      {/* Title + bar */}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-medium text-slate-900 group-hover:text-[#907AFF] dark:text-white dark:group-hover:text-[#b8a9ff]">
                            {book.title}
                          </span>
                          <span className="shrink-0 text-[14px] font-bold tabular-nums text-slate-800 dark:text-white/85">
                            {fmt(book[bookSort])}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${barWidth}%`,
                              background: isTop
                                ? "linear-gradient(90deg, #907AFF, #E29ED5)"
                                : idx < 3
                                  ? "linear-gradient(90deg, #907AFF, #a88eff)"
                                  : "linear-gradient(90deg, #cbd5e1, #94a3b8)",
                            }}
                          />
                        </div>
                      </div>

                      {/* Secondary metrics */}
                      <div className="hidden gap-2 sm:flex">
                        <MetricPill
                          label="vis."
                          value={fmt(book.views)}
                          active={bookSort === "views"}
                        />
                        <MetricPill
                          label="läsn."
                          value={fmt(book.reads)}
                          active={bookSort === "reads"}
                        />
                        <MetricPill
                          label="köp"
                          value={fmt(book.purchases)}
                          active={bookSort === "purchases"}
                        />
                      </div>

                      {/* Arrow */}
                      <svg className="h-3.5 w-3.5 shrink-0 text-slate-200 transition group-hover:translate-x-0.5 group-hover:text-[#907AFF] dark:text-white/10" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/[0.04]">
                  <svg className="h-6 w-6 text-slate-300 dark:text-white/15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <p className="text-[13px] font-medium text-slate-500 dark:text-white/40">Inga böcker att visa</p>
                <Link href="/author/books" className="mt-2 text-[13px] font-medium text-[#907AFF] hover:underline">
                  Skapa din första bok
                </Link>
              </div>
            )}
          </div>

          {/* ── Quick Actions ── */}
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickLink
              href="/author/marketing"
              title="Marketing Portal"
              description="Trailers och marknadsföring"
              gradient="from-[#907AFF] to-[#7c6ae6]"
              iconPath="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
            />
            <QuickLink
              href="/author/books"
              title="Alla böcker"
              description="Hantera böcker och kapitel"
              gradient="from-slate-800 to-slate-900 dark:from-white/90 dark:to-white"
              darkText
              iconPath="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
            />
            <QuickLink
              href="/author/profile"
              title="Profil"
              description="Redigera din författarprofil"
              gradient="from-[#E29ED5] to-[#b87ecc]"
              iconPath="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
  iconPath,
  iconPath2,
}: {
  label: string;
  value: string;
  color: "purple" | "blue" | "emerald" | "amber";
  iconPath: string;
  iconPath2?: string;
}) {
  const styles = {
    purple: {
      border: "border-[#907AFF]/20 hover:border-[#907AFF]/40 dark:border-[#907AFF]/10 dark:hover:border-[#907AFF]/25",
      bg: "bg-[#907AFF]/5 dark:bg-[#907AFF]/10",
      icon: "text-[#907AFF]",
      glow: "from-[#907AFF]/[0.08] to-transparent",
    },
    blue: {
      border: "border-blue-500/20 hover:border-blue-500/40 dark:border-blue-500/10 dark:hover:border-blue-500/25",
      bg: "bg-blue-500/5 dark:bg-blue-500/10",
      icon: "text-blue-500",
      glow: "from-blue-500/[0.08] to-transparent",
    },
    emerald: {
      border: "border-emerald-500/20 hover:border-emerald-500/40 dark:border-emerald-500/10 dark:hover:border-emerald-500/25",
      bg: "bg-emerald-500/5 dark:bg-emerald-500/10",
      icon: "text-emerald-500",
      glow: "from-emerald-500/[0.08] to-transparent",
    },
    amber: {
      border: "border-amber-500/20 hover:border-amber-500/40 dark:border-amber-500/10 dark:hover:border-amber-500/25",
      bg: "bg-amber-500/5 dark:bg-amber-500/10",
      icon: "text-amber-500",
      glow: "from-amber-500/[0.08] to-transparent",
    },
  }[color];

  return (
    <div className={`group relative overflow-hidden rounded-2xl border bg-white/60 p-5 backdrop-blur-sm transition-all dark:bg-white/[0.02] ${styles.border}`}>
      {/* Subtle gradient glow top-right */}
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${styles.glow} opacity-0 transition-opacity group-hover:opacity-100`} />

      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.bg}`}>
          <svg className={`h-[18px] w-[18px] ${styles.icon}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
            {iconPath2 && <path strokeLinecap="round" strokeLinejoin="round" d={iconPath2} />}
          </svg>
        </div>
        <span className="text-[12px] font-medium uppercase tracking-wide text-slate-400 dark:text-white/35">{label}</span>
      </div>
      <p className="text-[28px] font-bold tabular-nums leading-none text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

// ─── Activity Chart (SVG) ────────────────────────────────────────────────

function ActivityChart({
  dailyData,
  metric,
  onMetricChange,
}: {
  dailyData: DailyPoint[];
  metric: "views" | "reads";
  onMetricChange: (m: "views" | "reads") => void;
}) {
  const gradientId = useId();
  const gradientIdSecondary = useId();

  if (dailyData.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="text-center">
          <svg className="mx-auto mb-2 h-6 w-6 text-slate-200 dark:text-white/10" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          <p className="text-[13px] text-slate-400 dark:text-white/30">Ingen aktivitetsdata ännu</p>
        </div>
      </div>
    );
  }

  const W = 800;
  const H = 200;
  const PAD = { top: 20, right: 16, bottom: 28, left: 40 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxViews = Math.max(...dailyData.map((d) => d.views), 1);
  const maxReads = Math.max(...dailyData.map((d) => d.reads), 1);
  const maxVal = metric === "views" ? maxViews : maxReads;

  const toPoints = (key: "views" | "reads") =>
    dailyData.map((d, i) => ({
      x: PAD.left + (dailyData.length === 1 ? chartW / 2 : (i / (dailyData.length - 1)) * chartW),
      y: PAD.top + chartH - (d[key] / maxVal) * chartH,
    }));

  const primaryPoints = toPoints(metric);
  const primaryPath = smoothPath(primaryPoints);
  const fillPath = primaryPath + `L${primaryPoints[primaryPoints.length - 1].x},${PAD.top + chartH}L${primaryPoints[0].x},${PAD.top + chartH}Z`;

  // Y-axis labels
  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const xLabelInterval = Math.max(1, Math.floor(dailyData.length / 6));

  return (
    <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
          Aktivitet över tid
        </h3>
        <div className="flex gap-1 rounded-lg bg-slate-100/80 p-0.5 dark:bg-white/5">
          {(["views", "reads"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMetricChange(m)}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition ${
                metric === m
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
              }`}
            >
              {m === "views" ? "Visningar" : "Läsningar"}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={metric === "views" ? "#907AFF" : "#3b82f6"} stopOpacity={0.3} />
            <stop offset="100%" stopColor={metric === "views" ? "#907AFF" : "#3b82f6"} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={gradientIdSecondary} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={metric === "views" ? "#907AFF" : "#3b82f6"} />
            <stop offset="100%" stopColor={metric === "views" ? "#E29ED5" : "#60a5fa"} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = PAD.top + chartH - (tick / maxVal) * chartH;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke="currentColor"
                strokeDasharray="4 4"
                className="text-slate-100 dark:text-white/[0.06]"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-300 text-[10px] dark:fill-white/20"
              >
                {fmt(tick)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {dailyData.map((d, i) => {
          if (i % xLabelInterval !== 0 && i !== dailyData.length - 1) return null;
          const x = PAD.left + (dailyData.length === 1 ? chartW / 2 : (i / (dailyData.length - 1)) * chartW);
          return (
            <text
              key={d.date}
              x={x}
              y={H - 4}
              textAnchor="middle"
              className="fill-slate-300 text-[10px] dark:fill-white/20"
            >
              {fmtDate(d.date)}
            </text>
          );
        })}

        {/* Area fill */}
        <path d={fillPath} fill={`url(#${gradientId})`} />

        {/* Line */}
        <path
          d={primaryPath}
          fill="none"
          stroke={`url(#${gradientIdSecondary})`}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {primaryPoints.map((pt, i) => (
          <circle
            key={dailyData[i].date}
            cx={pt.x}
            cy={pt.y}
            r={3}
            className={metric === "views"
              ? "fill-[#907AFF] stroke-white dark:stroke-slate-900"
              : "fill-blue-500 stroke-white dark:stroke-slate-900"}
            strokeWidth={2}
          />
        ))}
      </svg>
    </div>
  );
}

// ─── Conversion Funnel ───────────────────────────────────────────────────

function FunnelChart({
  views,
  reads,
  purchases,
  bookmarks,
}: {
  views: number;
  reads: number;
  purchases: number;
  bookmarks: number;
}) {
  const maxVal = Math.max(views, 1);
  const steps = [
    { label: "Visningar", value: views, color: "#907AFF", width: 100 },
    { label: "Läsningar", value: reads, color: "#3b82f6", width: maxVal > 0 ? (reads / maxVal) * 100 : 0 },
    { label: "Bokmärken", value: bookmarks, color: "#E29ED5", width: maxVal > 0 ? (bookmarks / maxVal) * 100 : 0 },
    { label: "Köp", value: purchases, color: "#10b981", width: maxVal > 0 ? (purchases / maxVal) * 100 : 0 },
  ];

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const barWidth = Math.max(step.width, 3);
        const rate = i > 0 && steps[i - 1].value > 0
          ? Math.round((step.value / steps[i - 1].value) * 100)
          : null;

        return (
          <div key={step.label}>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ background: step.color }} />
                <span className="text-[12px] font-medium text-slate-600 dark:text-white/60">{step.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {rate !== null && (
                  <span className="text-[10px] text-slate-400 dark:text-white/25">
                    {rate}%
                  </span>
                )}
                <span className="text-[13px] font-bold tabular-nums text-slate-800 dark:text-white/80">
                  {fmt(step.value)}
                </span>
              </div>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${barWidth}%`,
                  background: `linear-gradient(90deg, ${step.color}, ${step.color}88)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Revenue Card ────────────────────────────────────────────────────────

function RevenueCard({ revenue }: { revenue: Revenue | null }) {
  const total = revenue?.totalRevenue ?? 0;
  const orders = revenue?.orderRevenue ?? 0;
  const donations = revenue?.donationRevenue ?? 0;
  const hasRevenue = total > 0;

  return (
    <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      <h3 className="mb-5 text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
        Intäkter
      </h3>

      {hasRevenue ? (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* Donut chart */}
          <div className="flex shrink-0 items-center justify-center">
            <DonutChart
              orderPct={total > 0 ? orders / total : 0}
              donationPct={total > 0 ? donations / total : 0}
              total={total}
              currency={revenue?.currency ?? "SEK"}
            />
          </div>

          {/* Breakdown */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50/60 px-4 py-3 dark:bg-emerald-500/[0.06]">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <div className="flex-1">
                <p className="text-[12px] font-medium text-slate-500 dark:text-white/50">Bokförsäljning</p>
              </div>
              <p className="text-[15px] font-bold tabular-nums text-slate-800 dark:text-white/80">
                {orders.toLocaleString("sv-SE")} <span className="text-[12px] font-medium text-slate-400">kr</span>
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[#907AFF]/[0.04] px-4 py-3 dark:bg-[#907AFF]/[0.06]">
              <div className="h-3 w-3 rounded-full bg-[#907AFF]" />
              <div className="flex-1">
                <p className="text-[12px] font-medium text-slate-500 dark:text-white/50">Donationer</p>
              </div>
              <p className="text-[15px] font-bold tabular-nums text-slate-800 dark:text-white/80">
                {donations.toLocaleString("sv-SE")} <span className="text-[12px] font-medium text-slate-400">kr</span>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-xl bg-slate-50/80 px-5 py-4 dark:bg-white/[0.02]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06]">
            <svg className="h-5 w-5 text-slate-300 dark:text-white/20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-medium text-slate-500 dark:text-white/50">Inga intäkter ännu</p>
            <p className="text-[11px] text-slate-400 dark:text-white/30">
              Sätt prissättning via Pricing-fliken i bokeditorn
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Donut Chart ─────────────────────────────────────────────────────────

function DonutChart({
  orderPct,
  donationPct,
  total,
  currency,
}: {
  orderPct: number;
  donationPct: number;
  total: number;
  currency: string;
}) {
  const size = 140;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const orderLen = circumference * orderPct;
  const donationLen = circumference * donationPct;

  return (
    <div className="relative">
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-slate-100 dark:text-white/[0.06]"
        />
        {/* Orders segment */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#10b981"
          strokeWidth={stroke}
          strokeDasharray={`${orderLen} ${circumference - orderLen}`}
          strokeLinecap="round"
        />
        {/* Donations segment */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#907AFF"
          strokeWidth={stroke}
          strokeDasharray={`${donationLen} ${circumference - donationLen}`}
          strokeDashoffset={-orderLen - 4}
          strokeLinecap="round"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[18px] font-bold tabular-nums text-slate-900 dark:text-white">
          {total >= 1000 ? fmt(total) : total.toLocaleString("sv-SE")}
        </span>
        <span className="text-[10px] font-medium text-slate-400 dark:text-white/30">{currency}</span>
      </div>
    </div>
  );
}

// ─── Small Components ────────────────────────────────────────────────────

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={s <= Math.round(rating) ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
          className={s <= Math.round(rating) ? "text-amber-400" : "text-slate-200 dark:text-white/10"}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
      ))}
    </div>
  );
}

function EngagementStat({
  value,
  label,
  color,
  bgColor,
  iconPath,
}: {
  value: string;
  label: string;
  color: string;
  bgColor: string;
  iconPath: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-slate-50/80 px-3 py-3 dark:bg-white/[0.03]">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bgColor}`}>
        <svg className={`h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
        </svg>
      </div>
      <span className="text-[15px] font-bold tabular-nums text-slate-800 dark:text-white/80">{value}</span>
      <span className="text-[10px] text-slate-400 dark:text-white/30">{label}</span>
    </div>
  );
}

function MetricPill({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className={`flex flex-col items-end rounded-lg px-2 py-1 ${active ? "bg-slate-50 dark:bg-white/[0.04]" : ""}`}>
      <span className={`text-[12px] font-semibold tabular-nums ${active ? "text-slate-700 dark:text-white/70" : "text-slate-400 dark:text-white/25"}`}>
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-slate-300 dark:text-white/15">{label}</span>
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
  gradient,
  darkText,
  iconPath,
}: {
  href: string;
  title: string;
  description: string;
  gradient: string;
  darkText?: boolean;
  iconPath: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-black/[0.05] bg-white/60 px-5 py-4 backdrop-blur-sm transition hover:border-[#907AFF]/20 hover:shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-[#907AFF]/20"
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-sm ${darkText ? "text-white dark:text-slate-900" : "text-white"}`}>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{title}</p>
        <p className="text-[11px] text-slate-400 dark:text-white/35">{description}</p>
      </div>
      <svg className="h-3.5 w-3.5 shrink-0 text-slate-200 transition group-hover:translate-x-0.5 group-hover:text-[#907AFF] dark:text-white/10" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  );
}
