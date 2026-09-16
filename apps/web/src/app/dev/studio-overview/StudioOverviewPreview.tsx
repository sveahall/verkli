"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import AuthorAppShell from "@/features/author-shell/AuthorAppShell";
import HomeWorkspace from "@/features/author-workspaces/home/HomeWorkspace";
import LibraryWorkspace from "@/features/author-workspaces/library/LibraryWorkspace";
import AnalyticsWorkspace, { type AnalyticsData, type RevenueData } from "@/features/author-workspaces/analytics/AnalyticsWorkspace";
import type { LibraryBook } from "@/features/author-workspaces/library/library-model";

const BOOKS: LibraryBook[] = [
  { id: "studio-ferry", title: "The Last Ferry", description: "A quiet town. A final crossing. Some goodbyes change everything.",
    status: "DRAFT", updatedAt: "2026-09-16T12:00:00Z", coverImageUrl: "/demo-assets/covers/01.jpg", audiobookStatus: null, chapterCount: 6, translationCount: 0 },
  { id: "studio-light", title: "The Light We Keep", description: "A story about the people who help us find our way home.",
    status: "PUBLISHED", updatedAt: "2026-09-14T12:00:00Z", coverImageUrl: "/demo-assets/covers/03.jpg", audiobookStatus: "ready", chapterCount: 12, translationCount: 2 },
];
type Scenario = "quiet" | "activity" | "empty" | "error" | "loading";
type View = "home" | "library" | "analytics";
const PREVIEW_MESSAGE = "Local preview only. No changes are saved and no provider requests are sent.";

function dataFor(scenario: Scenario, bookId: string | null, period: string): AnalyticsData {
  const active = scenario === "activity" || scenario === "error";
  const factor = period === "7d" ? 1 : period === "30d" ? 3 : 6;
  const views = active ? (bookId ? 8 : 32) * factor : 0;
  const reads = active ? (bookId ? 4 : 16) * factor : 0;
  const purchases = active ? (bookId ? 1 : 4) * factor : 0;
  const dailyChart = active ? [
    { date: "2026-09-14", views: views / 4, reads: reads / 4, purchases: 0 },
    { date: "2026-09-15", views: views / 4, reads: reads / 4, purchases: 0 },
    { date: "2026-09-16", views: views / 2, reads: reads / 2, purchases },
  ] : [{ date: "2026-09-16", views: 0, reads: 0, purchases: 0 }];
  const revenue: RevenueData = { totalRevenue: null, orderRevenue: null, donationRevenue: 0, currency: null,
    byCurrency: active ? (bookId ? { EUR: 49 * factor } : { SEK: 150 * factor, EUR: 49 * factor }) : {},
    subscriptionMRR: null, activeSubscriberCount: active ? 3 : 0,
    subscriptionByCurrency: active ? { SEK: 99, KWD: 1.005 } : {}, subscriptionScope: "author" };
  return {
    overviewStats: { views, reads, purchases, bookmarks: active ? 3 : 0, dailyChart }, revenue,
    engagement: { reviews: active ? 2 : 0, averageRating: active ? 4.5 : 0, bookmarks: active ? 3 : 0, followers: active ? 2 : 0 },
    booksTable: active ? BOOKS.map((book) => ({ id: book.id, title: book.title, views: views / 2, reads: reads / 2, purchases: purchases / 2 })) : [],
    bookDetail: { overview: { views, reads, purchases, bookmarks: active ? 1 : 0, revenue: 0, currency: "SEK" },
      readers: { total: reads, active: active ? 1 : 0, avgProgress: active ? 50 : 0, completionRate: active ? 25 : 0 },
      reviews: { count: active ? 2 : 0, averageRating: active ? 4.5 : 0 }, dailyChart,
      chapterSignals: active ? [{ id: "first-chapter", title: "The crossing", readerCount: reads, highlightCount: 2, completionRate: 75, dropoffRate: 25, highlightRate: 20 }] : [] },
    marketingCampaigns: active ? [{ id: "sample-campaign", channel: "newsletter", status: "published", created_at: "2026-09-14T12:00:00Z" }] : [],
  };
}

/** Actual workspace components, mounted only after synthetic request handlers. */
export default function StudioOverviewPreview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: View = searchParams.get("view") === "home" ? "home" : searchParams.get("view") === "library" ? "library" : "analytics";
  const [scenario, setScenario] = useState<Scenario>("quiet");
  const [ready, setReady] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState("");
  const scenarioRef = useRef(scenario);
  const books = scenario === "empty" ? [] : BOOKS;

  useEffect(() => {
    const originalFetch = window.fetch;
    const wasDark = document.documentElement.classList.contains("dark");
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        setBlockedMessage(PREVIEW_MESSAGE);
        return Response.json({ error: "PREVIEW_ONLY", message: PREVIEW_MESSAGE }, { status: 403 });
      }
      if (url.pathname === "/api/notifications/unread-count") return Response.json({ count: 0 });
      if (url.pathname === "/api/notifications") return Response.json({ notifications: [], total: 0 });
      if (url.pathname === "/api/books/imports") return Response.json({ imports: [] });
      if (url.pathname === "/rest/v1/books") return Response.json((scenarioRef.current === "empty" ? [] : BOOKS).map((book) => ({ id: book.id, title: book.title, status: book.status, updated_at: book.updatedAt })));
      const isStats = url.pathname.startsWith("/api/author/stats") || url.pathname.endsWith("/stats") || url.pathname === "/api/author/marketing/campaigns";
      if (isStats) {
        if (scenarioRef.current === "loading") {
          const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
          return new Promise<Response>((_, reject) => {
            if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
            else signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
          });
        }
        if (scenarioRef.current === "error") return Response.json({ error: "Simulated statistics failure" }, { status: 503 });
        const bookId = url.searchParams.get("bookId") ?? url.pathname.match(/^\/api\/books\/([^/]+)\/stats$/)?.[1] ?? null;
        const data = dataFor(scenarioRef.current, bookId, url.searchParams.get("period") ?? "30d");
        if (url.pathname === "/api/author/stats") return Response.json(data.overviewStats);
        if (url.pathname === "/api/author/stats/revenue") return Response.json(data.revenue);
        if (url.pathname === "/api/author/stats/books") return Response.json({ books: data.booksTable });
        if (url.pathname === "/api/author/stats/engagement") return Response.json(data.engagement);
        if (url.pathname === "/api/author/marketing/campaigns") return Response.json({ campaigns: data.marketingCampaigns });
        if (url.pathname.startsWith("/api/books/")) return Response.json(data.bookDetail);
      }
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return Response.json({ error: "PREVIEW_ONLY", message: PREVIEW_MESSAGE }, { status: 403 });
      return originalFetch(input, init);
    };
    const preventNativeWrite = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement) || event.target.method.toLowerCase() === "get") return;
      event.preventDefault();
      setBlockedMessage(PREVIEW_MESSAGE);
    };
    const containNavigation = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor) return;
      const url = new URL(anchor.href, location.origin);
      if (url.pathname.startsWith("/dev/studio-overview") || url.hash) return;
      event.preventDefault();
      event.stopPropagation();
      const workspace = url.pathname === "/author" ? "home" : url.pathname === "/author/library" ? "library" : url.pathname === "/author/analytics" ? "analytics" : null;
      if (workspace) {
        url.searchParams.set("view", workspace);
        router.replace(`/dev/studio-overview?${url.searchParams}`, { scroll: false });
      } else setBlockedMessage(`Preview link: ${url.pathname}${url.search}. ${PREVIEW_MESSAGE}`);
    };
    document.addEventListener("submit", preventNativeWrite, true);
    document.addEventListener("click", containNavigation, true);
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(frame);
      window.fetch = originalFetch;
      document.documentElement.classList.toggle("dark", wasDark);
      document.removeEventListener("submit", preventNativeWrite, true);
      document.removeEventListener("click", containNavigation, true);
    };
  }, [router]);

  return <>
    <section aria-label="Local studio preview controls" className="border-b border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">View<select className="min-h-11 rounded-xl border border-border bg-background px-3 text-base text-foreground" value={view} onChange={(event) => router.replace(`/dev/studio-overview?view=${event.target.value}`, { scroll: false })}><option value="home">Home</option><option value="library">Library</option><option value="analytics">Analytics</option></select></label>
        <label className="flex items-center gap-2">Data<select className="min-h-11 rounded-xl border border-border bg-background px-3 text-base text-foreground" value={scenario} onChange={(event) => { const next = event.target.value as Scenario; scenarioRef.current = next; setScenario(next); setBlockedMessage(""); }}><option value="quiet">No activity</option><option value="activity">Synthetic activity</option><option value="empty">No books</option><option value="error">Request failure</option><option value="loading">Loading</option></select></label>
        <button type="button" className="min-h-11 rounded-full border border-border px-4 text-foreground" onClick={() => document.documentElement.classList.toggle("dark")}>Toggle theme</button>
        {scenario === "error" && <button type="button" className="min-h-11 rounded-full border border-border px-4 text-foreground" onClick={() => { scenarioRef.current = "activity"; setBlockedMessage("Requests restored. Choose Retry statistics to load the data."); }}>Restore requests</button>}
        <p>Synthetic data · {PREVIEW_MESSAGE}</p>
      </div>
      {blockedMessage && <p role="status" className="mt-2 text-foreground">{blockedMessage}</p>}
    </section>
    {ready ? <NextIntlClientProvider locale="en" messages={messages}>
      <AuthorAppShell>
        {view === "analytics" ? <AnalyticsWorkspace key={scenario} books={books} />
          : view === "library" ? <LibraryWorkspace key={scenario} books={books} />
          : <HomeWorkspace stats={{ sales: 0, salesCurrency: "SEK", readers: 0, subscribers: 0, comments: 0, reviews: 0 }} books={books.map((book) => ({ id: book.id, title: book.title, status: book.status, readers: 0, updatedAt: book.updatedAt!, coverUrl: book.coverImageUrl }))} activity={[]} countrySales={[]} />}
      </AuthorAppShell>
    </NextIntlClientProvider> : <p role="status" className="p-6 text-sm text-muted-foreground">Preparing local studio…</p>}
  </>;
}
