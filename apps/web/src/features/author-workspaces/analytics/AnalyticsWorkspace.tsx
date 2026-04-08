"use client";

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
            <div key={i} className="h-[110px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
        <div className="h-[320px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[260px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          <div className="h-[260px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
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
        "shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-all",
        active
          ? "bg-[#907AFF] text-white shadow-sm shadow-[#907AFF]/20"
          : "bg-white text-slate-500 ring-1 ring-slate-200/80 hover:text-slate-800 dark:bg-white/[0.06] dark:text-white/50 dark:ring-white/10 dark:hover:text-white/80"
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
    <div className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
      {(["7d", "30d", "all"] as Period[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[12px] font-semibold tracking-wide transition-all",
            period === p
              ? "bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white"
              : "text-slate-500 hover:text-slate-700 dark:text-white/45 dark:hover:text-white/70"
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
        <h1 className="text-[17px] font-medium uppercase tracking-[0.14em] text-[#8B92A5] dark:text-white/50">
          Analytics
        </h1>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
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
            <div className="rounded-2xl bg-white p-10 text-center dark:bg-white/[0.04]">
              <h2 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white">
                Story signals appear once readers have something to read
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-500 dark:text-white/45">
                Create and publish a book, then return here to understand how readers move through your story.
              </p>
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
