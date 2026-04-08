"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { AnalyticsData, BookRow, ChapterSignal, DailyPoint, MarketingCampaign, Period } from "./AnalyticsWorkspace";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  return n.toLocaleString("sv-SE");
}

function fmtCurrency(n: number, currency = "SEK") {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${currency}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K ${currency}`;
  return `${fmtNum(n)} ${currency}`;
}

function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`;
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cpx = (x0 + x1) / 2;
    d += ` C ${cpx},${y0} ${cpx},${y1} ${x1},${y1}`;
  }
  return d;
}

function buildPoints(
  data: DailyPoint[],
  accessor: (d: DailyPoint) => number,
  maxVal: number,
  W: number,
  H: number
): Array<[number, number]> {
  if (data.length === 0) return [];
  return data.map((d, i) => {
    const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W;
    const y = H - (accessor(d) / maxVal) * H;
    return [x, y];
  });
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "purple" | "green" | "amber" | "blue" | "pink";
}) {
  const dot: Record<string, string> = {
    purple: "bg-[#907AFF]",
    green: "bg-emerald-400",
    amber: "bg-amber-400",
    blue: "bg-blue-400",
    pink: "bg-pink-400",
  };
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            dot[accent ?? "purple"] ?? dot.purple
          )}
        />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
          {label}
        </span>
      </div>
      <div className="mt-4">
        <p className="text-[28px] font-semibold leading-none tracking-tight text-slate-900 dark:text-white">
          {value}
        </p>
        {sub ? (
          <p className="mt-1.5 text-[13px] text-slate-500 dark:text-white/40">{sub}</p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Area Chart ──────────────────────────────────────────────────────────────

function AreaChart({ dailyChart }: { dailyChart: DailyPoint[] }) {
  const W = 800;
  const H = 200;
  const pad = 4;

  const maxVal = useMemo(
    () => Math.max(...dailyChart.flatMap((d) => [d.views, d.reads, d.purchases]), 1),
    [dailyChart]
  );

  const reachPts = buildPoints(dailyChart, (d) => d.views, maxVal, W, H - pad * 2);
  const readerPts = buildPoints(dailyChart, (d) => d.reads, maxVal, W, H - pad * 2);
  const purchasePts = buildPoints(dailyChart, (d) => d.purchases, maxVal, W, H - pad * 2);

  const reachLine = smoothPath(reachPts.map(([x, y]) => [x, y + pad]));
  const readerLine = smoothPath(readerPts.map(([x, y]) => [x, y + pad]));
  const purchaseLine = smoothPath(purchasePts.map(([x, y]) => [x, y + pad]));

  const reachArea =
    reachPts.length > 0
      ? `${reachLine} L ${W},${H} L 0,${H} Z`
      : "";
  const readerArea =
    readerPts.length > 0
      ? `${readerLine} L ${W},${H} L 0,${H} Z`
      : "";

  // X-axis labels (show up to 6)
  const labelIndices: number[] = [];
  if (dailyChart.length > 0) {
    const step = Math.max(1, Math.floor(dailyChart.length / 5));
    for (let i = 0; i < dailyChart.length; i += step) labelIndices.push(i);
    if (labelIndices[labelIndices.length - 1] !== dailyChart.length - 1) {
      labelIndices.push(dailyChart.length - 1);
    }
  }

  if (dailyChart.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-white/10">
        <p className="text-sm text-slate-400 dark:text-white/35">No data for this time window</p>
      </div>
    );
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[200px] w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="grad-reach" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#907AFF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#907AFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="grad-readers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E293B" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#1E293B" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={0}
            y1={H * frac}
            x2={W}
            y2={H * frac}
            stroke="currentColor"
            strokeWidth={0.8}
            strokeDasharray="4,4"
            className="text-slate-200/70 dark:text-white/8"
          />
        ))}

        {/* Reach area */}
        {reachArea ? <path d={reachArea} fill="url(#grad-reach)" /> : null}
        {/* Readers area */}
        {readerArea ? <path d={readerArea} fill="url(#grad-readers)" /> : null}

        {/* Lines */}
        {reachLine ? (
          <path d={reachLine} fill="none" stroke="#907AFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
        ) : null}
        {readerLine ? (
          <path d={readerLine} fill="none" stroke="#1E293B" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="dark:stroke-white" />
        ) : null}
        {purchaseLine ? (
          <path d={purchaseLine} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}

        {/* Purchase dots */}
        {purchasePts.map(([x, y], i) =>
          dailyChart[i]?.purchases > 0 ? (
            <circle key={i} cx={x} cy={y + pad} r={3.5} fill="#f59e0b" />
          ) : null
        )}
      </svg>

      {/* X-axis labels */}
      <div className="relative mt-2 h-5">
        {labelIndices.map((idx) => {
          const point = dailyChart[idx];
          const pct = dailyChart.length === 1 ? 50 : (idx / (dailyChart.length - 1)) * 100;
          const label = new Date(`${point.date}T00:00:00`).toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
          });
          return (
            <span
              key={idx}
              className="absolute -translate-x-1/2 text-[11px] text-slate-400 dark:text-white/30"
              style={{ left: `${pct}%` }}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Chapter Funnel ───────────────────────────────────────────────────────────

function ChapterFunnel({ signals }: { signals: ChapterSignal[] }) {
  const maxReaders = Math.max(...signals.map((s) => s.readerCount), 1);
  return (
    <div className="space-y-2.5">
      {signals.map((signal) => (
        <div key={signal.id}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-medium text-slate-700 dark:text-white/75">
              {signal.title}
            </p>
            <div className="flex shrink-0 gap-3 text-[12px] text-slate-400 dark:text-white/35">
              <span>{signal.readerCount} readers</span>
              <span className="text-[#907AFF]">{signal.completionRate}%</span>
            </div>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
            {/* Reach bar */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[#907AFF]/20"
              style={{ width: `${(signal.readerCount / maxReaders) * 100}%` }}
            />
            {/* Completion bar */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[#907AFF]"
              style={{ width: `${(signal.readerCount / maxReaders) * signal.completionRate}%` }}
            />
          </div>
          {signal.dropoffRate > 30 ? (
            <p className="mt-0.5 text-[11px] text-amber-500">
              {signal.dropoffRate}% drop-off — readers stall here
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ─── Books Comparison Table ───────────────────────────────────────────────────

function BooksTable({ rows }: { rows: BookRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400 dark:text-white/35">
        No book data yet for this period.
      </p>
    );
  }
  const maxViews = Math.max(...rows.map((r) => r.views), 1);
  return (
    <div className="divide-y divide-slate-100 dark:divide-white/8">
      <div className="grid grid-cols-[minmax(0,1fr)_80px_80px_80px] gap-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-white/30">
        <span>Book</span>
        <span className="text-right">Views</span>
        <span className="text-right">Readers</span>
        <span className="text-right">Sales</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[minmax(0,1fr)_80px_80px_80px] items-center gap-3 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-slate-800 dark:text-white">
              {row.title}
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
              <div
                className="h-full rounded-full bg-[#907AFF]/50"
                style={{ width: `${(row.views / maxViews) * 100}%` }}
              />
            </div>
          </div>
          <p className="text-right text-[13px] text-slate-700 dark:text-white/70">{fmtNum(row.views)}</p>
          <p className="text-right text-[13px] text-slate-700 dark:text-white/70">{fmtNum(row.reads)}</p>
          <p className="text-right text-[13px] font-medium text-slate-900 dark:text-white">{fmtNum(row.purchases)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Revenue Breakdown ────────────────────────────────────────────────────────

function RevenueBreakdown({
  orderRevenue,
  donationRevenue,
  currency,
}: {
  orderRevenue: number;
  donationRevenue: number;
  currency: string;
}) {
  const total = orderRevenue + donationRevenue;
  const orderPct = total > 0 ? Math.round((orderRevenue / total) * 100) : 0;
  const donationPct = 100 - orderPct;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-[13px]">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#907AFF]" />
            <span className="text-slate-600 dark:text-white/60">Book sales</span>
          </div>
          <div className="text-right">
            <span className="font-semibold text-slate-900 dark:text-white">
              {fmtCurrency(orderRevenue, currency)}
            </span>
            <span className="ml-2 text-[12px] text-slate-400 dark:text-white/30">{orderPct}%</span>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
          <div
            className="h-full rounded-full bg-[#907AFF]"
            style={{ width: `${orderPct}%` }}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[13px]">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-pink-400" />
            <span className="text-slate-600 dark:text-white/60">Donations</span>
          </div>
          <div className="text-right">
            <span className="font-semibold text-slate-900 dark:text-white">
              {fmtCurrency(donationRevenue, currency)}
            </span>
            <span className="ml-2 text-[12px] text-slate-400 dark:text-white/30">{donationPct}%</span>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
          <div
            className="h-full rounded-full bg-pink-400"
            style={{ width: `${donationPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Marketing Panel ─────────────────────────────────────────────────────────

function MarketingPanel({ campaigns }: { campaigns: MarketingCampaign[] }) {
  const channelCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of campaigns) {
      map.set(c.channel, (map.get(c.channel) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [campaigns]);

  const published = campaigns.filter((c) => c.status === "published").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/[0.03]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">
            Campaigns
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {campaigns.length}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/[0.03]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">
            Published
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {published}
          </p>
        </div>
      </div>

      {channelCounts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">
            Channels
          </p>
          {channelCounts.map(([channel, count]) => {
            const maxCount = channelCounts[0][1];
            return (
              <div key={channel} className="flex items-center gap-3">
                <p className="w-20 shrink-0 truncate text-[13px] capitalize text-slate-600 dark:text-white/60">
                  {channel}
                </p>
                <div className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
                  <div
                    className="h-1.5 rounded-full bg-[#907AFF]/60"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <p className="w-4 shrink-0 text-right text-[12px] font-medium text-slate-600 dark:text-white/55">
                  {count}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 dark:border-white/10">
        <p className="text-[12px] font-medium text-slate-500 dark:text-white/40">
          Ad spend tracking
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-white/30">
          Connect ad accounts to track spend, CPR, and ROAS automatically.
        </p>
      </div>
    </div>
  );
}

// ─── Main Dashboard Component ────────────────────────────────────────────────

type AnalyticsDashboardProps = {
  bookId: string;
  selectedBook: { id: string; title: string } | null;
  period: Period;
  data: AnalyticsData;
  loading: boolean;
};

export default function AnalyticsDashboard({
  bookId,
  selectedBook,
  data,
  loading,
}: AnalyticsDashboardProps) {
  const isAllBooks = bookId === "all";

  // Derive KPI values
  const reads = isAllBooks
    ? (data.overviewStats?.reads ?? 0)
    : (data.bookDetail?.readers.total ?? 0);
  const views = isAllBooks
    ? (data.overviewStats?.views ?? 0)
    : (data.bookDetail?.overview.views ?? 0);
  const purchases = isAllBooks
    ? (data.overviewStats?.purchases ?? 0)
    : (data.bookDetail?.overview.purchases ?? 0);
  const bookmarks = isAllBooks
    ? (data.engagement?.bookmarks ?? 0)
    : (data.bookDetail?.overview.bookmarks ?? 0);
  const totalRevenue = data.revenue?.totalRevenue ?? 0;
  const currency = data.revenue?.currency ?? "SEK";
  const avgRating = data.engagement?.averageRating ?? 0;
  const reviews = data.engagement?.reviews ?? 0;
  const completionRate = isAllBooks
    ? (data.bookDetail?.readers.completionRate ?? 0)
    : (data.bookDetail?.readers.completionRate ?? 0);
  const activeReaders = data.bookDetail?.readers.active ?? 0;
  const avgProgress = data.bookDetail?.readers.avgProgress ?? 0;

  const dailyChart = isAllBooks
    ? (data.overviewStats?.dailyChart ?? [])
    : (data.bookDetail?.dailyChart ?? []);
  const chapterSignals = data.bookDetail?.chapterSignals ?? [];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array<number>(4)].map((_, i) => (
            <div key={i} className="h-[110px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
        <div className="h-[280px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[260px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          <div className="h-[260px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KPICard
          label="Readers"
          value={fmtNum(reads)}
          sub={!isAllBooks && activeReaders > 0 ? `${activeReaders} active this week` : undefined}
          accent="purple"
        />
        <KPICard
          label="Views"
          value={fmtNum(views)}
          accent="blue"
        />
        <KPICard
          label="Revenue"
          value={fmtCurrency(totalRevenue, currency)}
          sub={purchases > 0 ? `${purchases} sales` : "No sales yet"}
          accent="green"
        />
        <KPICard
          label={isAllBooks ? "Bookmarks" : "Avg progress"}
          value={isAllBooks ? fmtNum(bookmarks) : `${avgProgress}%`}
          sub={!isAllBooks && completionRate > 0 ? `${completionRate}% completed` : undefined}
          accent="amber"
        />
        <KPICard
          label={isAllBooks ? "Rating" : "Completion"}
          value={
            isAllBooks
              ? avgRating > 0
                ? `${avgRating.toFixed(1)} / 5`
                : "No reviews"
              : `${completionRate}%`
          }
          sub={isAllBooks && reviews > 0 ? `${reviews} reviews` : undefined}
          accent="pink"
        />
      </div>

      {/* ── Main Chart ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
              {isAllBooks ? "All books" : selectedBook?.title}
            </p>
            <h2 className="mt-1.5 text-[18px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Reading over time
            </h2>
          </div>
          <div className="flex flex-wrap gap-4 text-[12px] text-slate-500 dark:text-white/40">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#907AFF]/70" />
              Reach
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-800 dark:bg-white/70" />
              Readers
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Revenue events
            </span>
          </div>
        </div>
        <AreaChart dailyChart={dailyChart} />
      </div>

      {/* ── Second Row ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: Chapter funnel (single book) or Books table (all) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
          {isAllBooks ? (
            <>
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
                  Performance
                </p>
                <h3 className="mt-1.5 text-[16px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  Books breakdown
                </h3>
              </div>
              <BooksTable rows={data.booksTable} />
            </>
          ) : (
            <>
              <div className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
                  Reading behavior
                </p>
                <h3 className="mt-1.5 text-[16px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  Chapter funnel
                </h3>
              </div>
              {chapterSignals.length === 0 ? (
                <p className="py-4 text-sm text-slate-400 dark:text-white/35">
                  Chapter data appears once readers start reading.
                </p>
              ) : (
                <ChapterFunnel signals={chapterSignals} />
              )}
            </>
          )}
        </div>

        {/* Right: Revenue + Marketing */}
        <div className="space-y-4">
          {/* Revenue breakdown */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
                  Revenue
                </p>
                <h3 className="mt-1.5 text-[16px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  Income breakdown
                </h3>
              </div>
              <span className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
                {fmtCurrency(totalRevenue, currency)}
              </span>
            </div>
            <RevenueBreakdown
              orderRevenue={data.revenue?.orderRevenue ?? 0}
              donationRevenue={data.revenue?.donationRevenue ?? 0}
              currency={currency}
            />
          </div>

          {/* Marketing activity */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
                Marketing
              </p>
              <h3 className="mt-1.5 text-[16px] font-semibold tracking-tight text-slate-900 dark:text-white">
                Campaigns &amp; spend
              </h3>
            </div>
            <MarketingPanel campaigns={data.marketingCampaigns} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Kept for backward compatibility with existing tests
export function buildLinePath(
  points: Array<{ date: string; views: number; reads: number; purchases: number }>,
  accessor: (point: { date: string; views: number; reads: number; purchases: number }) => number,
  maxValue: number
): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 100 - (accessor(point) / maxValue) * 100;
      return `${x},${y}`;
    })
    .join(" ");
}
