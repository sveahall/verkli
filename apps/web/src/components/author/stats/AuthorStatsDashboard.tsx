"use client";

import { useState, useEffect } from "react";
import StatsOverviewCards from "./StatsOverviewCards";
import StatsEngagementCards from "./StatsEngagementCards";
import StatsBookTable from "./StatsBookTable";
import { RevenueBreakdown } from "@/features/author-workspaces/analytics/AnalyticsCharts";
import type { RevenueData } from "@/features/author-workspaces/analytics/AnalyticsWorkspace";

type Period = "7d" | "30d" | "all";

type Stats = {
  views: number;
  reads: number;
  purchases: number;
  bookmarks: number;
  publishedBooks?: number;
  // Set when the route answered 200 but some figure inside it failed to load.
  partial?: boolean;
  period: string;
};

type Engagement = {
  reviews: number;
  averageRating: number;
  bookmarks: number;
  followers: number;
};

const periodLabels: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  all: "All",
};

export default function AuthorStatsDashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [stats, setStats] = useState<Stats | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [publishedBooks, setPublishedBooks] = useState(0);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    const run = async () => {
      try {
        const responses = await Promise.all([
          fetch(`/api/author/stats?period=${period}`, { signal }),
          fetch(`/api/author/stats/revenue?period=${period}`, { signal }),
          fetch("/api/author/stats/engagement", { signal }),
        ]);
        const [nextStats, nextRevenue, nextEngagement] = await Promise.all(
          responses.map((response) => response.ok ? response.json() : null)
        );
        if (signal.aborted) return;
        setStats(nextStats);
        setPublishedBooks(nextStats?.publishedBooks ?? 0);
        setRevenue(nextRevenue);
        setEngagement(nextEngagement);
        setLoadFailed(!nextStats || nextStats.partial || !nextRevenue || nextRevenue.partial || !nextEngagement);
      } catch (error) {
        if (signal.aborted) return;
        console.error("[AuthorStatsDashboard] stats load failed", error);
        setStats(null);
        setRevenue(null);
        setEngagement(null);
        setLoadFailed(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [period, retry]);

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="author-page-title text-foreground">
          Statistics
        </h1>
        <div className="flex gap-1 rounded-xl bg-muted p-1 dark:bg-card">
          {(["7d", "30d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`min-h-11 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
                period === p
                  ? "bg-card text-foreground shadow-sm dark:bg-card dark:text-foreground"
                  : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/*
        Shown instead of letting a failed load render as zeros. Uses the
        semantic --color-warning tokens from DESIGN.md rather than new colours,
        so light/dark come from globals.css. Warning rather than error on
        purpose: whatever did load is still displayed and still correct.
      */}
      {!loading && loadFailed && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-muted)] px-4 py-3 text-[13px] text-[var(--color-warning)]"
        >
          <p>Some figures could not be loaded. Unavailable figures are not zero activity.</p>
          <button type="button" className="btn-secondary mt-3 min-h-11" onClick={() => setRetry((value) => value + 1)}>Retry statistics</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-2xl border border-border/50 bg-muted dark:border-border dark:bg-card"
              />
            ))}
          </div>
          <div className="h-[300px] animate-pulse rounded-2xl border border-border/50 bg-muted dark:border-border dark:bg-card" />
        </div>
      ) : (
        <div className="space-y-6">
          <StatsOverviewCards
            views={stats?.views ?? 0}
            reads={stats?.reads ?? 0}
            revenue={revenue?.totalRevenue ?? null}
            publishedBooks={publishedBooks}
            currency={revenue?.currency ?? null}
            byCurrency={revenue?.byCurrency ?? null}
          />

          {engagement && (
            <>
              <h2 className="author-section-title text-[15px] font-medium text-foreground dark:text-foreground">
                Engagement
              </h2>
              <StatsEngagementCards
                reviews={engagement.reviews}
                averageRating={engagement.averageRating}
                bookmarks={engagement.bookmarks}
                followers={engagement.followers}
              />
            </>
          )}

          <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm dark:border-border dark:bg-card">
            <h2 className="author-section-title mb-4 text-[15px] font-medium text-foreground">Sales and subscriptions</h2>
            <RevenueBreakdown revenue={revenue} />
          </div>

          <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm dark:border-border dark:bg-card">
            <h2 className="author-section-title mb-4 text-[15px] font-medium text-foreground dark:text-foreground">
              By book
            </h2>
            <StatsBookTable key={`${period}-${retry}`} period={period} />
          </div>
        </div>
      )}
    </div>
  );
}
