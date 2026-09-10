"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import { cn } from "@/lib/utils";

const AnalyticsDashboard = dynamic(
  () => import("@/features/author-workspaces/analytics/AnalyticsCharts"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array<number>(4)].map((_, i) => (
            <div key={i} className="h-[110px] animate-pulse rounded-2xl bg-muted dark:bg-card" />
          ))}
        </div>
        <div className="h-[320px] animate-pulse rounded-2xl bg-muted dark:bg-card" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[260px] animate-pulse rounded-2xl bg-muted dark:bg-card" />
          <div className="h-[260px] animate-pulse rounded-2xl bg-muted dark:bg-card" />
        </div>
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

export type AnalyticsData = {
  overviewStats: {
    views: number;
    reads: number;
    purchases: number;
    bookmarks: number;
    dailyChart: DailyPoint[];
  } | null;
  revenue: {
    totalRevenue: number;
    orderRevenue: number;
    donationRevenue: number;
    subscriptionMRR: number;
    activeSubscriberCount: number;
    currency: string;
  } | null;
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

function BookTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-all",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground dark:bg-card dark:text-muted-foreground dark:ring-white/10 dark:hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function PeriodSelector({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1 rounded-xl bg-muted p-1 dark:bg-card">
      {(["7d", "30d", "all"] as Period[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "min-h-10 rounded-lg px-3 py-1.5 text-[12px] font-semibold tracking-wide transition-all",
            period === p
              ? "bg-card text-foreground shadow-sm dark:bg-card dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          )}
        >
          {p === "all" ? "All time" : p.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function AnalyticsWorkspace({ books }: AnalyticsWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCurrentBookId } = useAuthorWorkspace();

  const [period, setPeriod] = useState<Period>("30d");
  const [loading, setLoading] = useState(true);
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
    setLoading(true);

    const run = async () => {
      try {
        if (bookId === "all") {
          const [statsRes, revenueRes, booksRes, engRes, campaignsRes] = await Promise.all([
            fetch(`/api/author/stats?period=${period}`),
            fetch("/api/author/stats/revenue"),
            fetch(`/api/author/stats/books?period=${period}`),
            fetch("/api/author/stats/engagement"),
            fetch("/api/author/marketing/campaigns"),
          ]);

          const [stats, revenue, booksData, engagement, campaigns] = await Promise.all([
            statsRes.ok ? statsRes.json() : null,
            revenueRes.ok ? revenueRes.json() : null,
            booksRes.ok ? booksRes.json() : null,
            engRes.ok ? engRes.json() : null,
            campaignsRes.ok ? campaignsRes.json() : null,
          ]);

          if (!cancelled) {
            setData({
              overviewStats: stats,
              revenue,
              engagement,
              booksTable: (booksData?.books as BookRow[]) ?? [],
              bookDetail: null,
              marketingCampaigns: (campaigns?.campaigns as MarketingCampaign[]) ?? [],
            });
          }
        } else {
          const [bookRes, revenueRes, engRes, campaignsRes] = await Promise.all([
            fetch(`/api/books/${bookId}/stats?period=${period}`),
            fetch("/api/author/stats/revenue"),
            fetch("/api/author/stats/engagement"),
            fetch("/api/author/marketing/campaigns"),
          ]);

          const [bookDetail, revenue, engagement, campaigns] = await Promise.all([
            bookRes.ok ? bookRes.json() : null,
            revenueRes.ok ? revenueRes.json() : null,
            engRes.ok ? engRes.json() : null,
            campaignsRes.ok ? campaignsRes.json() : null,
          ]);

          if (!cancelled) {
            setData({
              overviewStats: null,
              revenue,
              engagement,
              booksTable: [],
              bookDetail,
              marketingCampaigns: (campaigns?.campaigns as MarketingCampaign[]) ?? [],
            });
          }
        }
      } catch {
        // continue with empty data
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [bookId, period]);

  const updateBookId = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "all") {
      params.delete("bookId");
    } else {
      params.set("bookId", id);
    }
    const query = params.toString();
    router.replace(query ? `/author/analytics?${query}` : "/author/analytics", { scroll: false });
  };

  return (
    <WorkspaceLayout
      header={
        <h1 className="author-page-title">
          Analytics
        </h1>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
              <BookTab
                label="All books"
                active={bookId === "all"}
                onClick={() => updateBookId("all")}
              />
              {books.map((book) => (
                <BookTab
                  key={book.id}
                  label={book.title}
                  active={bookId === book.id}
                  onClick={() => updateBookId(book.id)}
                />
              ))}
            </div>
            <PeriodSelector period={period} onChange={setPeriod} />
          </div>

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
