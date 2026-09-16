"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import { cn } from "@/lib/utils";
import { getMarketingEnabled } from "@/lib/flags";
import styles from "./AnalyticsWorkspace.module.css";

const AnalyticsDashboard = dynamic(
  () => import("@/features/author-workspaces/analytics/AnalyticsCharts"),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-live="polite" className="space-y-4">
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
        <div aria-hidden="true" className="h-40 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
    ),
  }
);

export type Period = "7d" | "30d" | "all";

export type DailyPoint = {
  date: string;
  views: number;
  reads: number;
  purchases: number;
};

export type ChapterSignal = {
  id: string;
  title: string;
  readerCount: number;
  highlightCount: number;
  completionRate: number;
  dropoffRate: number;
  highlightRate: number;
};

export type BookRow = {
  id: string;
  title: string;
  views: number;
  reads: number;
  purchases: number;
};

export type RevenueData = {
  partial?: boolean;
  totalRevenue: number | null;
  orderRevenue: number | null;
  donationRevenue: number;
  subscriptionMRR: number | null;
  activeSubscriberCount: number | null;
  currency: string | null;
  byCurrency: Record<string, number> | null;
  subscriptionByCurrency: Record<string, number> | null;
  subscriptionScope: "author";
};

export type AnalyticsData = {
  overviewStats: {
    views: number;
    reads: number;
    purchases: number;
    bookmarks: number;
    dailyChart: DailyPoint[];
  } | null;
  revenue: RevenueData | null;
  booksFailed?: boolean;
  marketingFailed?: boolean;
  engagement: {
    reviews: number;
    averageRating: number;
    bookmarks: number;
    followers: number;
  } | null;
  booksTable: BookRow[];
  bookDetail: {
    overview: {
      views: number;
      reads: number;
      purchases: number;
      bookmarks: number;
      revenue: number;
      currency: string;
    };
    readers: {
      total: number;
      active: number;
      avgProgress: number;
      completionRate: number;
    };
    reviews: {
      count: number;
      averageRating: number;
    };
    dailyChart: DailyPoint[];
    chapterSignals: ChapterSignal[];
  } | null;
  marketingCampaigns: MarketingCampaign[];
};

export type MarketingCampaign = {
  id: string;
  channel: string;
  status: string;
  created_at: string;
};

type AnalyticsWorkspaceProps = {
  books: Array<{ id: string; title: string }>;
};

function PeriodSelector({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div role="group" aria-label="Analytics period" className="flex shrink-0 gap-1 rounded-xl border border-border bg-muted/50 p-1">
      {(["7d", "30d", "all"] as Period[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={period === p}
          className={cn(
            "min-h-11 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
            period === p
              ? "bg-card text-foreground shadow-sm dark:bg-card dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          )}
        >
          {p === "all" ? "All time" : p === "7d" ? "7 days" : "30 days"}
        </button>
      ))}
    </div>
  );
}

export default function AnalyticsWorkspace({ books }: AnalyticsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setCurrentBookId } = useAuthorWorkspace();

  const [period, setPeriod] = useState<Period>("30d");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<AnalyticsData>({
    overviewStats: null,
    revenue: null,
    engagement: null,
    booksTable: [],
    bookDetail: null,
    marketingCampaigns: [],
  });

  const bookId = searchParams.get("bookId") ?? "all";
  const selectedBook = bookId === "all" ? null : (books.find((b) => b.id === bookId) ?? null);

  useEffect(() => {
    setCurrentBookId(selectedBook?.id ?? null);
  }, [selectedBook?.id, setCurrentBookId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const marketingEnabled = getMarketingEnabled();
    setLoading(true);
    const read = (url: string) => fetch(url, { signal: controller.signal });
    const revenueUrl = `/api/author/stats/revenue?period=${period}${bookId === "all" ? "" : `&bookId=${encodeURIComponent(bookId)}`}`;

    const run = async () => {
      try {
        if (bookId === "all") {
          const [statsRes, revenueRes, booksRes, engRes, campaignsRes] = await Promise.all([
            read(`/api/author/stats?period=${period}`),
            read(revenueUrl),
            read(`/api/author/stats/books?period=${period}`),
            read("/api/author/stats/engagement"),
            marketingEnabled ? read("/api/author/marketing/campaigns") : null,
          ]);

          const [stats, revenue, booksData, engagement, campaigns] = await Promise.all([
            statsRes.ok ? statsRes.json() : null,
            revenueRes.ok ? revenueRes.json() : null,
            booksRes.ok ? booksRes.json() : null,
            engRes.ok ? engRes.json() : null,
            campaignsRes?.ok ? campaignsRes.json() : null,
          ]);

          if (!cancelled) {
            setLoadFailed(!stats || stats.partial || !revenue || revenue.partial || !booksData || booksData.partial || !engagement || (marketingEnabled && !campaigns));
            setData({
              overviewStats: stats,
              revenue,
              engagement,
              booksTable: (booksData?.books as BookRow[]) ?? [],
              booksFailed: !booksData || Boolean(booksData.partial),
              bookDetail: null,
              marketingCampaigns: (campaigns?.campaigns as MarketingCampaign[]) ?? [],
              marketingFailed: marketingEnabled && !campaigns,
            });
          }
        } else {
          const [bookRes, revenueRes, engRes, campaignsRes] = await Promise.all([
            read(`/api/books/${bookId}/stats?period=${period}`),
            read(revenueUrl),
            read("/api/author/stats/engagement"),
            marketingEnabled ? read("/api/author/marketing/campaigns") : null,
          ]);

          const [bookDetail, revenue, engagement, campaigns] = await Promise.all([
            bookRes.ok ? bookRes.json() : null,
            revenueRes.ok ? revenueRes.json() : null,
            engRes.ok ? engRes.json() : null,
            campaignsRes?.ok ? campaignsRes.json() : null,
          ]);

          if (!cancelled) {
            setLoadFailed(!bookDetail || bookDetail.partial || !revenue || revenue.partial || !engagement || (marketingEnabled && !campaigns));
            setData({
              overviewStats: null,
              revenue,
              engagement,
              booksTable: [],
              bookDetail,
              marketingCampaigns: (campaigns?.campaigns as MarketingCampaign[]) ?? [],
              marketingFailed: marketingEnabled && !campaigns,
            });
          }
        }
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          // Never retain another book's or period's figures after a failed load.
          setData({ overviewStats: null, revenue: null, engagement: null, booksTable: [],
            booksFailed: true, bookDetail: null, marketingCampaigns: [], marketingFailed: marketingEnabled });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bookId, period, retry]);

  const updateBookId = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "all") {
      params.delete("bookId");
    } else {
      params.set("bookId", id);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <WorkspaceLayout
      className={styles.workspace}
      header={
        <header>
          <h1 className="author-page-title">Analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">Understand how readers discover and follow your stories.</p>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <>
          <div className={styles.filters}>
            <label className={styles.bookFilter}>
              Book
              <select value={bookId} onChange={(event) => updateBookId(event.target.value)} aria-label="Analytics book">
                <option value="all">All books</option>
                {books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
              </select>
            </label>
            <div className={styles.periodFilter}>
              <p>Time period</p>
              <PeriodSelector period={period} onChange={setPeriod} />
            </div>
          </div>

          {!loading && loadFailed && (
            <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
              <p>Some statistics could not be loaded. Unavailable figures are not zero activity.</p>
              <button type="button" className="btn-secondary min-h-11" onClick={() => setRetry((value) => value + 1)}>Retry statistics</button>
            </div>
          )}
          {books.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
              <h2 className="author-section-title text-[26px] font-medium tracking-tight text-foreground dark:text-foreground">
                Story signals appear once readers have something to read
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground dark:text-muted-foreground">
                Create and publish a book, then return here to understand how readers move through your story.
              </p>
              <Link href="/author/library" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Open your library</Link>
            </div>
          ) : (
            <AnalyticsDashboard
              bookId={bookId}
              selectedBook={selectedBook}
              period={period}
              data={data}
              loading={loading}
            />
          )}
        </>
      }
    />
  );
}
