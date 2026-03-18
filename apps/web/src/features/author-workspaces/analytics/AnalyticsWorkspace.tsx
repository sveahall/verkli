"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";

const AnalyticsCharts = dynamic(
  () => import("@/features/author-workspaces/analytics/AnalyticsCharts"),
  {
    ssr: false,
    loading: () => <div className="h-[520px] animate-pulse rounded-3xl bg-slate-100 dark:bg-white/5" />,
  }
);

type Period = "7d" | "30d" | "all";

type DailyPoint = { date: string; views: number; reads: number; purchases: number };

type AuthorDashboardData = {
  stats: {
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
    currency: string;
  } | null;
  engagement: {
    reviews: number;
    averageRating: number;
    bookmarks: number;
    followers: number;
  } | null;
};

type ChapterSignal = {
  id: string;
  title: string;
  readerCount: number;
  highlightCount: number;
  completionRate: number;
  dropoffRate: number;
  highlightRate: number;
};

type BookStatsResponse = {
  chapterSignals?: ChapterSignal[];
};

type AnalyticsWorkspaceProps = {
  books: Array<{ id: string; title: string }>;
};

export default function AnalyticsWorkspace({
  books,
}: AnalyticsWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCurrentBookId, setContextPanelState, clearContextPanelState } = useAuthorWorkspace();
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AuthorDashboardData>({
    stats: null,
    revenue: null,
    engagement: null,
  });
  const [chapterSignals, setChapterSignals] = useState<ChapterSignal[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedBookId = searchParams.get("bookId") ?? searchParams.get("book") ?? books[0]?.id ?? null;
  const selectedBook = books.find((book) => book.id === selectedBookId) ?? books[0] ?? null;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const [statsRes, revenueRes, engagementRes, selectedBookRes] = await Promise.all([
          fetch(`/api/author/stats?period=${period}`),
          fetch("/api/author/stats/revenue"),
          fetch("/api/author/stats/engagement"),
          selectedBookId ? fetch(`/api/books/${selectedBookId}/stats?period=${period}`) : Promise.resolve(null),
        ]);

        const [stats, revenue, engagement, selectedBookStats] = await Promise.all([
          statsRes.ok ? statsRes.json() : Promise.resolve(null),
          revenueRes.ok ? revenueRes.json() : Promise.resolve(null),
          engagementRes.ok ? engagementRes.json() : Promise.resolve(null),
          selectedBookRes && "ok" in selectedBookRes && selectedBookRes.ok
            ? (selectedBookRes.json() as Promise<BookStatsResponse>)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setData({
          stats,
          revenue,
          engagement,
        });
        setChapterSignals(selectedBookStats?.chapterSignals ?? []);
      } catch {
        if (cancelled) return;
        setData({
          stats: null,
          revenue: null,
          engagement: null,
        });
        setChapterSignals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [period, selectedBookId]);

  const conversionRate = useMemo(() => {
    const views = data.stats?.views ?? 0;
    const reads = data.stats?.reads ?? 0;
    if (views === 0) return 0;
    return Math.round((reads / views) * 100);
  }, [data.stats?.reads, data.stats?.views]);

  const topAlerts = useMemo(() => {
    return [...chapterSignals]
      .sort((a, b) => b.dropoffRate - a.dropoffRate)
      .slice(0, 3);
  }, [chapterSignals]);

  useEffect(() => {
    setCurrentBookId(selectedBook?.id ?? null);
    setContextPanelState({
      kind: "analytics",
      payload: {
        bookTitle: selectedBook?.title ?? null,
        alerts: topAlerts,
      },
    });
    return clearContextPanelState;
  }, [
    clearContextPanelState,
    selectedBook?.id,
    selectedBook?.title,
    setContextPanelState,
    setCurrentBookId,
    topAlerts,
  ]);

  const updateQuery = (bookId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (bookId) params.set("bookId", bookId);
    else params.delete("bookId");
    const query = params.toString();
    router.replace(query ? `/author/analytics?${query}` : "/author/analytics", { scroll: false });
  };

  return (
    <WorkspaceLayout
      header={
        <PageHeader
          eyebrow="Analytics"
          title="Analytics overview"
          description="Monitor revenue, reader health, engagement, and conversion with chapter-level signals."
          actions={
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedBookId ?? ""}
                onChange={(event) => {
                  updateQuery(event.target.value || null);
                }}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-[14px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                {(["7d", "30d", "all"] as Period[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriod(value)}
                    className={`min-h-[44px] rounded-xl px-4 text-[14px] font-medium transition ${
                      period === value
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/65"
                    }`}
                  >
                    {value === "all" ? "All time" : value}
                  </button>
                ))}
              </div>
            </div>
          }
        />
      }
      main={
        loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-[120px] animate-pulse rounded-3xl bg-slate-100 dark:bg-white/5" />
              ))}
            </div>
            <div className="h-[520px] animate-pulse rounded-3xl bg-slate-100 dark:bg-white/5" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              {[
                { label: "Revenue", value: `${(data.revenue?.totalRevenue ?? 0).toLocaleString("sv-SE")} ${(data.revenue?.currency ?? "SEK").trim()}` },
                { label: "Readers", value: (data.stats?.reads ?? 0).toLocaleString("sv-SE") },
                { label: "Engagement", value: `${data.engagement?.bookmarks ?? 0} bookmarks` },
                { label: "Conversion", value: `${conversionRate}%` },
              ].map((metric) => (
                <Card key={metric.label}>
                  <CardContent>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
                      {metric.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">
                      {metric.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <AnalyticsCharts
              dailyChart={data.stats?.dailyChart ?? []}
              chapterSignals={chapterSignals}
            />
          </div>
        )
      }
    />
  );
}
