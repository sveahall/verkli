"use client";

import { useState, useEffect, useCallback } from "react";
import StatsOverviewCards from "./StatsOverviewCards";
import StatsEngagementCards from "./StatsEngagementCards";
import StatsBookTable from "./StatsBookTable";

type Period = "7d" | "30d" | "all";

type Stats = {
  views: number;
  reads: number;
  purchases: number;
  bookmarks: number;
  period: string;
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

const periodLabels: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  all: "All",
};

export default function AuthorStatsDashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [stats, setStats] = useState<Stats | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [publishedBooks, setPublishedBooks] = useState(0);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, revenueRes, engagementRes] = await Promise.all([
        fetch(`/api/author/stats?period=${period}`),
        fetch("/api/author/stats/revenue"),
        fetch("/api/author/stats/engagement"),
      ]);

      // A failed response used to be skipped in silence, which rendered as a
      // confident dashboard of zeros — indistinguishable from an author who had
      // genuinely sold nothing. Zero is a claim about their work; refusing to
      // make it when we do not know is the point of this flag.
      let anyFailed = false;

      if (statsRes.ok) {
        const json = await statsRes.json();
        setStats(json);
        // Comes from this same response now. It used to be read off a SECOND
        // request to the identical endpoint, which never returned the field, so
        // the figure was always 0 and the round trip bought nothing.
        setPublishedBooks(json.publishedBooks ?? 0);
      } else {
        anyFailed = true;
      }
      if (revenueRes.ok) {
        setRevenue(await revenueRes.json());
      } else {
        anyFailed = true;
      }
      if (engagementRes.ok) {
        setEngagement(await engagementRes.json());
      } else {
        anyFailed = true;
      }

      setLoadFailed(anyFailed);
    } catch (error) {
      // Previously an empty catch. A thrown fetch left every figure at its
      // previous value with nothing on screen to say so.
      console.error("[AuthorStatsDashboard] stats load failed", error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Statistics
        </h1>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {(["7d", "30d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
                period === p
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/80"
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
          Some figures could not be loaded, so the numbers below may be
          incomplete. They are not a report of zero activity. Try again shortly.
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-2xl border border-slate-200/50 bg-slate-100 dark:border-white/10 dark:bg-white/5"
              />
            ))}
          </div>
          <div className="h-[300px] animate-pulse rounded-2xl border border-slate-200/50 bg-slate-100 dark:border-white/10 dark:bg-white/5" />
        </div>
      ) : (
        <div className="space-y-6">
          <StatsOverviewCards
            views={stats?.views ?? 0}
            reads={stats?.reads ?? 0}
            revenue={revenue?.totalRevenue ?? 0}
            publishedBooks={publishedBooks}
            currency={revenue?.currency ?? "SEK"}
          />

          {engagement && (
            <>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
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

          {revenue && (revenue.orderRevenue > 0 || revenue.donationRevenue > 0) && (
            <div className="rounded-2xl border border-slate-200/50 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <h2 className="mb-4 text-[15px] font-semibold text-slate-900 dark:text-white">
                Revenue breakdown
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[12px] font-medium text-slate-500 dark:text-white/50">Book sales</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {revenue.orderRevenue.toLocaleString("en-US")} {revenue.currency}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] font-medium text-slate-500 dark:text-white/50">Donations</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {revenue.donationRevenue.toLocaleString("en-US")} {revenue.currency}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200/50 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h2 className="mb-4 text-[15px] font-semibold text-slate-900 dark:text-white">
              By book
            </h2>
            <StatsBookTable period={period} />
          </div>
        </div>
      )}
    </div>
  );
}
