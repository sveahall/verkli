"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import {
  WorkspaceMetric,
  WorkspaceSurface,
} from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";

const AnalyticsCharts = dynamic(
  () => import("@/features/author-workspaces/analytics/AnalyticsCharts"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[520px] animate-pulse rounded-3xl bg-slate-100 dark:bg-white/5" />
    ),
  }
);

type AnalyticsSection = "overview" | "reading-behavior" | "revenue";
type Period = "7d" | "30d" | "all";

type DailyPoint = {
  date: string;
  views: number;
  reads: number;
  purchases: number;
};

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

const ANALYTICS_SECTION_META: Record<
  AnalyticsSection,
  { title: string; description: string }
> = {
  overview: {
    title: "Overview",
    description: "Review the current story and the core outcome metrics in one place.",
  },
  "reading-behavior": {
    title: "Reading behavior",
    description: "See how readers move through chapters and where attention drops.",
  },
  revenue: {
    title: "Revenue",
    description: "Keep revenue totals and breakdowns visible without extra widgets.",
  },
};

function normalizeSection(value: string | null | undefined): AnalyticsSection {
  if (value === "reading-behavior") return "reading-behavior";
  if (value === "revenue") return "revenue";
  return "overview";
}

export default function AnalyticsWorkspace({
  books,
}: AnalyticsWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCurrentBookId } = useAuthorWorkspace();
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AuthorDashboardData>({
    stats: null,
    revenue: null,
  });
  const [chapterSignals, setChapterSignals] = useState<ChapterSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const section = normalizeSection(searchParams.get("section"));
  const sectionMeta = ANALYTICS_SECTION_META[section];
  const selectedBookId =
    searchParams.get("bookId") ?? searchParams.get("book") ?? books[0]?.id ?? null;
  const selectedBook =
    books.find((book) => book.id === selectedBookId) ?? books[0] ?? null;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const [statsRes, revenueRes, selectedBookRes] = await Promise.all([
          fetch(`/api/author/stats?period=${period}`),
          fetch("/api/author/stats/revenue"),
          selectedBookId
            ? fetch(`/api/books/${selectedBookId}/stats?period=${period}`)
            : Promise.resolve(null),
        ]);

        const [stats, revenue, selectedBookStats] = await Promise.all([
          statsRes.ok ? statsRes.json() : Promise.resolve(null),
          revenueRes.ok ? revenueRes.json() : Promise.resolve(null),
          selectedBookRes && "ok" in selectedBookRes && selectedBookRes.ok
            ? (selectedBookRes.json() as Promise<BookStatsResponse>)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setData({
          stats,
          revenue,
        });
        setChapterSignals(selectedBookStats?.chapterSignals ?? []);
      } catch {
        if (cancelled) return;
        setData({
          stats: null,
          revenue: null,
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
  }, [period, refreshNonce, selectedBookId]);

  const totalHighlights = useMemo(
    () => chapterSignals.reduce((sum, signal) => sum + signal.highlightCount, 0),
    [chapterSignals]
  );

  const averageCompletion = useMemo(() => {
    if (chapterSignals.length === 0) return 0;
    const total = chapterSignals.reduce(
      (sum, signal) => sum + signal.completionRate,
      0
    );
    return Math.round(total / chapterSignals.length);
  }, [chapterSignals]);

  useEffect(() => {
    setCurrentBookId(selectedBook?.id ?? null);
  }, [selectedBook?.id, setCurrentBookId]);

  const updateQuery = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    const query = params.toString();
    router.replace(query ? `/author/analytics?${query}` : "/author/analytics", {
      scroll: false,
    });
  };

  const revenueLabel = `${(data.revenue?.totalRevenue ?? 0).toLocaleString("sv-SE")} ${(
    data.revenue?.currency ?? "SEK"
  ).trim()}`;

  const renderOverview = () => (
    <div className="space-y-8">
      <section>
        <p className="text-eyebrow">Story</p>
        <h2 className="mt-3 text-[32px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {selectedBook?.title ?? "All books"}
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-500 dark:text-white/45">
          Track how attention turns into reading and revenue.
        </p>
      </section>

      <section className="border-y border-slate-200/80 py-4 dark:border-white/10">
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <WorkspaceMetric
            label="Readers"
            value={(data.stats?.reads ?? 0).toLocaleString("sv-SE")}
          />
          <WorkspaceMetric label="Revenue" value={revenueLabel} />
          <WorkspaceMetric label="Completion" value={`${averageCompletion}%`} />
          <WorkspaceMetric
            label="Highlights"
            value={totalHighlights.toLocaleString("sv-SE")}
          />
        </dl>
      </section>

      <WorkspaceSurface className="p-6 sm:p-7">
        <AnalyticsCharts dailyChart={data.stats?.dailyChart ?? []} />
      </WorkspaceSurface>
    </div>
  );

  const renderReadingBehavior = () => (
    <WorkspaceSurface className="p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-eyebrow">Reading behavior</p>
          <h2 className="mt-2 text-section-title">Chapter signals</h2>
        </div>
        <div className="flex gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {(["7d", "30d", "all"] as Period[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${
                period === value
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/80"
              }`}
            >
              {value === "all" ? "All time" : value}
            </button>
          ))}
        </div>
      </div>

      {chapterSignals.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500 dark:text-white/45">
          Reading behavior appears once this book has chapter-level data.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-slate-200/80 dark:divide-white/10">
          {chapterSignals.map((signal) => (
            <div key={signal.id} className="grid gap-4 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-start">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  {signal.title}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-white/45">
                  {signal.readerCount.toLocaleString("sv-SE")} readers
                </p>
              </div>
              <div className="text-sm text-slate-600 dark:text-white/55">
                Completion {signal.completionRate}%
              </div>
              <div className="text-sm text-slate-600 dark:text-white/55">
                Drop-off {signal.dropoffRate}%
              </div>
              <div className="text-sm text-slate-600 dark:text-white/55">
                Highlights {signal.highlightCount}
              </div>
            </div>
          ))}
        </div>
      )}
    </WorkspaceSurface>
  );

  const renderRevenue = () => (
    <div className="space-y-8">
      <WorkspaceSurface className="p-6 sm:p-7">
        <p className="text-eyebrow">Revenue</p>
        <h2 className="mt-2 text-section-title">Total revenue</h2>
        <p className="mt-4 text-[32px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {revenueLabel}
        </p>
      </WorkspaceSurface>

      <WorkspaceSurface className="p-6 sm:p-7">
        <p className="text-eyebrow">Breakdown</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
              Book sales
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {(data.revenue?.orderRevenue ?? 0).toLocaleString("sv-SE")} {data.revenue?.currency ?? "SEK"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
              Donations
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {(data.revenue?.donationRevenue ?? 0).toLocaleString("sv-SE")} {data.revenue?.currency ?? "SEK"}
            </dd>
          </div>
        </dl>
      </WorkspaceSurface>
    </div>
  );

  return (
    <WorkspaceLayout
      header={
        <PageHeader
          eyebrow="Analytics"
          title={sectionMeta.title}
          description={sectionMeta.description}
          actions={
            <>
              {books.length > 0 ? (
                <select
                  value={selectedBookId ?? ""}
                  onChange={(event) => updateQuery({ bookId: event.target.value || null })}
                  className="input-base min-h-[40px] w-auto min-w-[160px] text-[14px]"
                  aria-label="Select book"
                >
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </select>
              ) : null}
              <Button onClick={() => setRefreshNonce((current) => current + 1)}>
                Refresh analytics
              </Button>
            </>
          }
        />
      }
      main={
        loading ? (
          <div className="space-y-4">
            <div className="h-[120px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
            <div className="h-[72px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
            <div className="h-[360px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          </div>
        ) : books.length === 0 ? (
          <WorkspaceSurface className="border-dashed p-8 text-center sm:p-10">
            <p className="text-eyebrow">Analytics</p>
            <h2 className="mt-4 text-[30px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Story signals appear once readers have something to read
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500 dark:text-white/45">
              Create and publish a book, then return here to understand how readers move through the story.
            </p>
          </WorkspaceSurface>
        ) : section === "overview" ? (
          renderOverview()
        ) : section === "reading-behavior" ? (
          renderReadingBehavior()
        ) : (
          renderRevenue()
        )
      }
    />
  );
}
