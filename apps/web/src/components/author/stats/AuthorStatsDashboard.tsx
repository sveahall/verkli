"use client";

import { useState, useEffect, useCallback } from "react";
import StatsOverviewCards from "./StatsOverviewCards";
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
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, revenueRes] = await Promise.all([
        fetch(`/api/author/stats?period=${period}`),
        fetch("/api/author/stats/revenue"),
      ]);

      if (statsRes.ok) {
        const json = await statsRes.json();
        setStats(json);
      }
      if (revenueRes.ok) {
        const json = await revenueRes.json();
        setRevenue(json);
      }

      // Fetch published books count
      const booksRes = await fetch("/api/author/stats?period=all");
      if (booksRes.ok) {
        const json = await booksRes.json();
        // Use views as a proxy; the real count comes from the books query
        setPublishedBooks(json.publishedBooks ?? 0);
      }
    } catch {
      // silent
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
