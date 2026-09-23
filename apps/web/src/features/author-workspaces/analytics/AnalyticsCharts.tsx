"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { getMarketingEnabled } from "@/lib/flags";
import { stripeAmountFractionDigits } from "@/lib/payments/stripe-currency";
import type { AnalyticsData, BookRow, ChapterSignal, DailyPoint, MarketingCampaign, Period, RevenueData } from "./AnalyticsWorkspace";
import styles from "./AnalyticsWorkspace.module.css";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  return n.toLocaleString("sv-SE");
}

function fmtCurrency(n: number, currency = "SEK") {
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: stripeAmountFractionDigits(currency) })} ${currency}`;
}

function SalesValue({ revenue }: { revenue: RevenueData | null }) {
  if (!revenue?.byCurrency) return <>Unavailable</>;
  const amounts = Object.entries(revenue.byCurrency);
  if (amounts.length === 0) return <>No paid orders</>;
  return <>{amounts.map(([currency, value]) => (
    <span className="block break-words tabular-nums" key={currency}>{fmtCurrency(value, currency)}</span>
  ))}</>;
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
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {sub ? <p>{sub}</p> : null}
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

  if (!dailyChart.some((point) => point.views > 0 || point.reads > 0 || point.purchases > 0)) {
    return (
      <div className={styles.chartEmpty}>
        <p>No reading activity in this period</p>
        <span>Try a longer period, or return after readers start exploring your book.</span>
      </div>
    );
  }

  return (
    <div>
      <svg role="img" aria-label="Daily views, reading events and purchases" viewBox={`0 0 ${W} ${H}`} className="h-[200px] w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="grad-reach" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#907AFF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#907AFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="grad-readers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
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
            className="text-muted-foreground/70 dark:text-muted-foreground"
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
          <path d={readerLine} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
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
      <div className="relative mx-4 mt-2 h-5">
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
              className="absolute -translate-x-1/2 text-[11px] text-muted-foreground dark:text-muted-foreground"
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
            <p className="truncate text-[13px] font-medium text-foreground dark:text-foreground">
              {signal.title}
            </p>
            <div className="flex shrink-0 gap-3 text-[12px] text-muted-foreground dark:text-muted-foreground">
              <span>{signal.readerCount} readers</span>
              <span className="text-accent-foreground">{signal.completionRate}%</span>
            </div>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted dark:bg-card">
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
      <p className="py-6 text-center text-sm text-muted-foreground dark:text-muted-foreground">
        No book data yet for this period.
      </p>
    );
  }
  const maxViews = Math.max(...rows.map((r) => r.views), 1);
  return (
    <div className={styles.bookTable}>
      <div className={styles.bookTableHeader}>
        <span>Book</span>
        <span className="text-right">Views</span>
        <span className="text-right" title="Reading events">Reads</span>
        <span className="text-right">Sales</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className={styles.bookTableRow}
        >
          <div className="min-w-0">
            <Link className={styles.bookLink} href={`/author/analytics?bookId=${encodeURIComponent(row.id)}`}>
              {row.title}
            </Link>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted dark:bg-card">
              <div
                className="h-full rounded-full bg-[#907AFF]/50"
                style={{ width: `${(row.views / maxViews) * 100}%` }}
              />
            </div>
          </div>
          <p className="text-right text-[13px] text-foreground dark:text-foreground">{fmtNum(row.views)}</p>
          <p className="text-right text-[13px] text-foreground dark:text-foreground">{fmtNum(row.reads)}</p>
          <p className="text-right text-[13px] font-medium text-foreground dark:text-foreground">{fmtNum(row.purchases)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Revenue Breakdown ────────────────────────────────────────────────────────

export function RevenueBreakdown({ revenue }: { revenue: RevenueData | null }) {
  return (
    <div className="space-y-5 text-sm">
      <div>
        <p className="font-medium text-foreground">Paid book orders</p>
        {!revenue?.byCurrency ? (
          <p role="alert" className="mt-2 text-muted-foreground">Sales data unavailable. Please retry.</p>
        ) : (
          <p className="mt-2 font-semibold text-foreground"><SalesValue revenue={revenue} /></p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Selected period, by order creation date. Order amounts before fee and royalty allocation; not your payout balance.
        </p>
      </div>
      <div className="border-t border-border pt-4">
        <p className="font-medium text-foreground">Current subscriptions <span className="font-normal text-muted-foreground">· All books</span></p>
        {!revenue?.subscriptionByCurrency ? (
          <p role="alert" className="mt-2 text-muted-foreground">Subscription data unavailable. Please retry.</p>
        ) : (
          <>
            {Object.keys(revenue.subscriptionByCurrency).length === 0 ? (
              <p className="mt-2 text-muted-foreground">No active subscriptions</p>
            ) : (
              <div className="mt-2 space-y-1 font-semibold tabular-nums text-foreground">
                {Object.entries(revenue.subscriptionByCurrency).map(([currency, value]) => (
                  <p key={currency}>{fmtCurrency(value, currency)} / month</p>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {revenue.activeSubscriberCount} active subscribers. Monthly recurring amount (MRR), separate from period sales and collected payments.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Marketing Panel ─────────────────────────────────────────────────────────

function MarketingPanel({ campaigns }: { campaigns: MarketingCampaign[] }) {
  const marketingEnabled = getMarketingEnabled();
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
        <div className="rounded-xl bg-background px-4 py-3 dark:bg-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-muted-foreground">
            Campaigns
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground dark:text-foreground">
            {campaigns.length}
          </p>
        </div>
        <div className="rounded-xl bg-background px-4 py-3 dark:bg-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-muted-foreground">
            Published
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {published}
          </p>
        </div>
      </div>

      {channelCounts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-muted-foreground">
            Channels
          </p>
          {channelCounts.map(([channel, count]) => {
            const maxCount = channelCounts[0][1];
            return (
              <div key={channel} className="flex items-center gap-3">
                <p className="w-20 shrink-0 truncate text-[13px] capitalize text-muted-foreground dark:text-muted-foreground">
                  {channel}
                </p>
                <div className="flex-1 overflow-hidden rounded-full bg-muted dark:bg-card">
                  <div
                    className="h-1.5 rounded-full bg-[#907AFF]/60"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <p className="w-4 shrink-0 text-right text-[12px] font-medium text-muted-foreground dark:text-muted-foreground">
                  {count}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="text-sm leading-relaxed text-muted-foreground">
        {marketingEnabled
          ? campaigns.length === 0 ? "No campaigns yet. Plan how you will introduce your story to readers." : "Campaign activity across your books. Open marketing to manage your campaigns."
          : campaigns.length === 0 ? "No recorded campaigns." : "Recorded campaign activity across your books."}
      </p>
      {marketingEnabled && <Link href="/author/marketing" className={styles.textLink}>Open marketing <span aria-hidden="true">↗</span></Link>}
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
  period,
  data,
  loading,
}: AnalyticsDashboardProps) {
  const isAllBooks = bookId === "all";
  const readingAvailable = isAllBooks ? Boolean(data.overviewStats) : Boolean(data.bookDetail);
  const engagementAvailable = Boolean(data.engagement);
  const reads = isAllBooks ? (data.overviewStats?.reads ?? 0) : (data.bookDetail?.readers.total ?? 0);
  const periodReads = isAllBooks ? (data.overviewStats?.reads ?? 0) : (data.bookDetail?.overview.reads ?? 0);
  const views = isAllBooks ? (data.overviewStats?.views ?? 0) : (data.bookDetail?.overview.views ?? 0);
  const purchases = isAllBooks ? (data.overviewStats?.purchases ?? 0) : (data.bookDetail?.overview.purchases ?? 0);
  const bookmarks = isAllBooks ? (data.engagement?.bookmarks ?? 0) : (data.bookDetail?.overview.bookmarks ?? 0);
  const avgRating = data.engagement?.averageRating ?? 0;
  const reviews = data.engagement?.reviews ?? 0;
  const completionRate = data.bookDetail?.readers.completionRate ?? 0;
  const activeReaders = data.bookDetail?.readers.active ?? 0;
  const avgProgress = data.bookDetail?.readers.avgProgress ?? 0;
  const dailyChart = isAllBooks ? (data.overviewStats?.dailyChart ?? []) : (data.bookDetail?.dailyChart ?? []);
  const chapterSignals = data.bookDetail?.chapterSignals ?? [];
  const periodLabel = period === "all" ? "All time" : period === "7d" ? "Last 7 days" : "Last 30 days";
  const hasActivity = periodReads > 0 || views > 0 || purchases > 0;
  const summaryTitle = !readingAvailable ? "Reading activity is unavailable"
    : periodReads > 0 ? "Your stories are finding readers"
    : hasActivity ? "Your stories are being discovered"
    : "Your next reader starts with a story";

  if (loading) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        <p>Loading analytics…</p>
        <div aria-hidden="true" className="h-40 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        <div aria-hidden="true" className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <section className={styles.summary} aria-labelledby="analytics-summary-title">
        <div>
          <p className={styles.summaryScope}>{selectedBook?.title ?? "All books"} <span aria-hidden="true">·</span> {periodLabel}</p>
          <h2 id="analytics-summary-title">{summaryTitle}</h2>
          <p className={styles.summaryCopy}>
            {!readingAvailable ? "Retry statistics to see this period. Sales and subscriptions remain available below when their data loads."
              : hasActivity ? `${fmtNum(periodReads)} ${periodReads === 1 ? "reading event" : "reading events"}, ${fmtNum(views)} ${views === 1 ? "view" : "views"} and ${fmtNum(purchases)} ${purchases === 1 ? "purchase" : "purchases"} in this period. Explore the details to see how your stories are doing.`
              : "There is no recorded reading activity for this selection yet. Open your library to continue a story, check its publishing details, or choose a longer period."}
          </p>
        </div>
        <Link href={selectedBook ? `/author/books/${selectedBook.id}` : "/author/library"} className={styles.summaryAction}>
          {selectedBook ? "Open book" : "Open library"}<span aria-hidden="true">↗</span>
        </Link>
      </section>

      <dl className={styles.metrics} aria-label="Key statistics">
        <KPICard label={isAllBooks ? "Reading events" : "Readers"} value={readingAvailable ? fmtNum(reads) : "Unavailable"}
          sub={isAllBooks ? "Selected period" : readingAvailable ? `All time · ${activeReaders} active this week` : "All time"} />
        <KPICard label="Views" value={readingAvailable ? fmtNum(views) : "Unavailable"} />
        <KPICard label="Book sales" value={<SalesValue revenue={data.revenue} />} sub="Paid orders in selected period" />
        <KPICard label={isAllBooks ? "Bookmarks" : "Avg progress"}
          value={isAllBooks ? (engagementAvailable ? fmtNum(bookmarks) : "Unavailable") : (readingAvailable ? `${avgProgress}%` : "Unavailable")}
          sub="All time" />
        <KPICard label={isAllBooks ? "Rating" : "Completion"}
          value={isAllBooks ? (!engagementAvailable ? "Unavailable" : avgRating > 0 ? `${avgRating.toFixed(1)} / 5` : "No reviews") : (readingAvailable ? `${completionRate}%` : "Unavailable")}
          sub={isAllBooks && reviews > 0 ? `${reviews} reviews · All time` : "All time"} />
      </dl>

      <section className={styles.panel} aria-labelledby="analytics-reading-title">
        <div className={styles.panelHeading}>
          <div><h2 id="analytics-reading-title">Reading over time</h2><p>Daily activity · {periodLabel}</p></div>
          {hasActivity && <div className={styles.legend}>
            <span><i className="bg-[#907AFF]" />Views</span>
            <span><i className="bg-foreground" />Reading events</span>
            <span><i className="bg-amber-500" />Purchases</span>
          </div>}
        </div>
        {readingAvailable ? <AreaChart dailyChart={dailyChart} /> : <p className={styles.unavailable}>Reading data could not be loaded for this selection.</p>}
      </section>

      <div className={styles.detailsGrid}>
        <div className={styles.detailColumn}>
          <section className={styles.panel} aria-labelledby="analytics-breakdown-title">
            <div className={styles.panelHeading}>
              <div><h2 id="analytics-breakdown-title">{isAllBooks ? "Books breakdown" : "Chapter funnel"}</h2><p>{isAllBooks ? "Explore a book’s reader activity." : "Where readers continue and where they pause."}</p></div>
            </div>
            {isAllBooks ? (data.booksFailed ? <p role="alert" className={styles.unavailable}>Book statistics unavailable. Please retry.</p> : <BooksTable rows={data.booksTable} />)
              : !readingAvailable ? <p className={styles.unavailable}>Chapter data could not be loaded.</p>
              : chapterSignals.length === 0 ? <p className={styles.unavailable}>Chapter data appears once readers start reading.</p>
              : <ChapterFunnel signals={chapterSignals} />}
          </section>
          {(getMarketingEnabled() || data.marketingCampaigns.length > 0) && <section className={styles.panel} aria-labelledby="analytics-marketing-title">
            <div className={styles.panelHeading}><div><h2 id="analytics-marketing-title">Marketing activity</h2><p>Campaigns across all books · All time</p></div></div>
            {data.marketingFailed ? <p role="alert" className={styles.unavailable}>Campaign data unavailable. Please retry.</p> : <MarketingPanel campaigns={data.marketingCampaigns} />}
          </section>}
        </div>
        <section className={styles.panel} aria-labelledby="analytics-sales-title">
          <div className={styles.panelHeading}><div><h2 id="analytics-sales-title">Sales and subscriptions</h2><p>Order amounts and current recurring subscriptions.</p></div></div>
          <RevenueBreakdown revenue={data.revenue} />
        </section>
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
