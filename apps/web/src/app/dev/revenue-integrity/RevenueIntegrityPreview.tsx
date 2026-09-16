"use client";

import { useEffect, useRef, useState } from "react";
import AnalyticsDashboard from "@/features/author-workspaces/analytics/AnalyticsCharts";
import type { AnalyticsData, Period, RevenueData } from "@/features/author-workspaces/analytics/AnalyticsWorkspace";
import AuthorStatsDashboard from "@/components/author/stats/AuthorStatsDashboard";
import styles from "@/features/author-shell/AuthorAppShell.module.css";

type Scenario = "healthy" | "empty" | "orders-failed" | "subscriptions-failed" | "books-failed" | "network-failed";
function revenueFor(period: Period, selected: boolean, scenario: Scenario): RevenueData {
  const factor = period === "7d" ? 1 : period === "30d" ? 3 : 6;
  return {
    partial: scenario.endsWith("failed"),
    totalRevenue: null, orderRevenue: null, donationRevenue: 0, currency: null,
    byCurrency: scenario === "orders-failed" ? null : scenario === "empty" ? {} : selected ? { EUR: 49 * factor } : { SEK: 150 * factor, EUR: 49 * factor },
    subscriptionMRR: 99, activeSubscriberCount: scenario === "subscriptions-failed" ? null : scenario === "empty" ? 0 : 1,
    subscriptionByCurrency: scenario === "subscriptions-failed" ? null : scenario === "empty" ? {} : { SEK: 99 },
    subscriptionScope: "author",
  };
}
const books = [{ id: "book-1", title: "Northern lights", views: 24, reads: 12, purchases: 3 }, { id: "book-2", title: "A second chapter", views: 8, reads: 4, purchases: 1 }];

export default function RevenueIntegrityPreview() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("analytics");
  const [period, setPeriod] = useState<Period>("7d");
  const [selected, setSelected] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("healthy");
  const scenarioRef = useRef(scenario);
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.toString(), window.location.origin);
      if (url.origin !== window.location.origin || (init?.method ?? "GET") !== "GET") {
        throw new Error("Revenue fixture blocks external requests and mutations.");
      }
      if (!url.pathname.startsWith("/api/")) return original(input, init);
      if (scenarioRef.current === "network-failed") throw new Error("Simulated statistics network failure");
      const requestedPeriod = url.searchParams.get("period") as Period || "30d";
      if (url.pathname === "/api/author/stats/revenue") return Response.json(revenueFor(requestedPeriod, false, scenarioRef.current));
      if (url.pathname === "/api/author/stats/books") {
        return scenarioRef.current === "books-failed" ? Response.json({ error: "Statistics unavailable" }, { status: 500 }) : Response.json({ books: scenarioRef.current === "empty" ? [] : books });
      }
      if (url.pathname === "/api/author/stats") return Response.json({ views: 32, reads: 16, purchases: 4, bookmarks: 3, publishedBooks: 2, period: requestedPeriod });
      if (url.pathname === "/api/author/stats/engagement") return Response.json({ reviews: 0, averageRating: 0, bookmarks: 3, followers: 2 });
      return Response.json({ error: "Not provided by this fixture" }, { status: 404 });
    };
    const frame = requestAnimationFrame(() => setReady(true));
    return () => { cancelAnimationFrame(frame); window.fetch = original; };
  }, []);
  const revenue = scenario === "network-failed" ? null : revenueFor(period, selected, scenario);
  const data: AnalyticsData = {
    revenue, overviewStats: { views: 32, reads: 16, purchases: 4, bookmarks: 3, dailyChart: [] },
    engagement: null, booksTable: scenario === "empty" ? [] : books, booksFailed: scenario === "books-failed",
    bookDetail: selected ? { overview: { views: 8, reads: 4, purchases: 1, bookmarks: 1, revenue: 9999, currency: "SEK" }, readers: { total: 4, active: 1, avgProgress: 50, completionRate: 25 }, reviews: { count: 0, averageRating: 0 }, dailyChart: [], chapterSignals: [] } : null,
    marketingCampaigns: [],
  };
  return (
    <main className={`${styles.shell} min-h-screen bg-background p-4 text-foreground sm:p-8`}>
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="author-page-title">Revenue integrity preview</h1>
          <p className="mt-2 text-sm text-muted-foreground">Synthetic local data. No Stripe account, real money or provider requests. The analytics view checks presentation; the statistics view exercises its real fetch and retry states.</p>
        </header>
        <div className="flex flex-wrap gap-4 rounded-2xl border border-border bg-card p-4">
          <label className="space-y-2 text-sm">View<select className="input-base block" value={view} onChange={(e) => setView(e.target.value)}><option value="analytics">Analytics</option><option value="statistics">Statistics</option></select></label>
          <label className="space-y-2 text-sm">Scenario<select className="input-base block" value={scenario} onChange={(e) => { scenarioRef.current = e.target.value as Scenario; setScenario(e.target.value as Scenario); }}>
            <option value="healthy">Mixed currencies</option><option value="empty">No paid orders</option><option value="orders-failed">Order page failure</option><option value="subscriptions-failed">Subscription failure</option><option value="books-failed">Book statistics failure</option><option value="network-failed">Network failure</option>
          </select></label>
          {view === "analytics" && <>
            <label className="space-y-2 text-sm">Period<select className="input-base block" value={period} onChange={(e) => setPeriod(e.target.value as Period)}><option value="7d">7 days</option><option value="30d">30 days</option><option value="all">All time</option></select></label>
            <label className="space-y-2 text-sm">Book<select className="input-base block" value={selected ? "book-2" : "all"} onChange={(e) => setSelected(e.target.value !== "all")}><option value="all">All books</option><option value="book-2">A second chapter</option></select></label>
          </>}
        </div>
        {!ready ? <p>Preparing local preview…</p> : view === "analytics" ? (
          <AnalyticsDashboard bookId={selected ? "book-2" : "all"} selectedBook={selected ? books[1] : null} period={period} data={data} loading={false} />
        ) : <AuthorStatsDashboard />}
      </div>
    </main>
  );
}
