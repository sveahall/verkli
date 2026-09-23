import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnalyticsDashboard from "./AnalyticsCharts";
import type { AnalyticsData } from "./AnalyticsWorkspace";

afterEach(() => vi.unstubAllEnvs());

function emptyData(): AnalyticsData {
  return {
    overviewStats: { views: 0, reads: 0, purchases: 0, bookmarks: 0, dailyChart: [] },
    revenue: { totalRevenue: 0, orderRevenue: 0, donationRevenue: 0, subscriptionMRR: 0,
      activeSubscriberCount: 0, currency: null, byCurrency: {}, subscriptionByCurrency: {}, subscriptionScope: "author" },
    engagement: { reviews: 0, averageRating: 0, bookmarks: 0, followers: 0 },
    booksTable: [], bookDetail: null, marketingCampaigns: [],
  };
}

function render(data = emptyData(), loading = false) {
  return renderToStaticMarkup(<AnalyticsDashboard bookId="all" selectedBook={null} period="7d" data={data} loading={loading} />);
}

describe("analytics activity states", () => {
  it("gives no activity a useful library action and keeps financial definitions", () => {
    const html = render();
    expect(html).toContain("Your next reader starts with a story");
    expect(html).toContain('href="/author/library"');
    expect(html).toContain("Last 7 days");
    expect(html).toContain("not your payout balance");
    expect(html).toContain("Current subscriptions");
  });

  it("does not draw an empty graph for dates with zero activity", () => {
    const data = emptyData();
    data.overviewStats!.dailyChart = [{ date: "2026-09-16", views: 0, reads: 0, purchases: 0 }];
    const html = render(data);
    expect(html).not.toContain("<svg");
    expect(html).toContain("No reading activity in this period");
  });

  it("does not describe missing statistics as zero activity", () => {
    const data = emptyData();
    data.overviewStats = null;
    data.engagement = null;
    const html = render(data);
    expect(html).toContain("Reading activity is unavailable");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("Your next reader starts with a story");
    expect(html).not.toContain("No reading activity in this period");
    expect(html).not.toContain("No reviews");
  });

  it("shows a reading summary and the chart for actual activity", () => {
    const data = emptyData();
    data.overviewStats = { views: 12, reads: 4, purchases: 1, bookmarks: 0,
      dailyChart: [{ date: "2026-09-16", views: 12, reads: 4, purchases: 1 }] };
    const html = render(data);
    expect(html).toContain("Your stories are finding readers");
    expect(html).toContain("4 reading events");
    expect(html).toContain("<svg");
  });

  it("announces loading without showing stale figures", () => {
    const html = render(emptyData(), true);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading analytics");
    expect(html).not.toContain("No paid orders");
  });

  it("keeps a selected book’s lifetime readers separate from period reading events", () => {
    const data = emptyData();
    data.bookDetail = { overview: { views: 12, reads: 2, purchases: 1, bookmarks: 0, revenue: 0, currency: "SEK" },
      readers: { total: 345, active: 4, avgProgress: 50, completionRate: 25 },
      reviews: { count: 0, averageRating: 0 }, dailyChart: [], chapterSignals: [] };
    const html = renderToStaticMarkup(<AnalyticsDashboard bookId="selected" selectedBook={{ id: "selected", title: "Selected" }} period="7d" data={data} loading={false} />);
    expect(html).toContain("2 reading events, 12 views and 1 purchase in this period");
    expect(html).not.toContain("345 readers,");
    expect(html).toContain("345");
    expect(html).toContain("All time · 4 active this week");

    data.bookDetail.overview = { ...data.bookDetail.overview, views: 0, reads: 0, purchases: 0 };
    const quiet = renderToStaticMarkup(<AnalyticsDashboard bookId="selected" selectedBook={{ id: "selected", title: "Selected" }} period="7d" data={data} loading={false} />);
    expect(quiet).toContain("There is no recorded reading activity for this selection yet");
    expect(quiet).not.toContain("Your stories are finding readers");
  });

  it("keeps historical campaigns without offering disabled marketing tools", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_ENABLED", "false");
    const data = emptyData();
    data.marketingCampaigns = [{ id: "historic", channel: "newsletter", status: "published", created_at: "2026-09-01" }];
    const html = render(data);
    expect(html).toContain("newsletter");
    expect(html).not.toContain('href="/author/marketing"');
    expect(html).not.toContain("Open marketing");
    expect(render()).not.toContain("Plan how you will introduce");
  });

  it("offers the marketing action when its feature is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_ENABLED", "true");
    expect(render()).toContain('href="/author/marketing"');
  });

  it("omits the disabled marketing panel when there is no historical campaign data", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_ENABLED", "false");
    const data = emptyData();
    data.marketingFailed = true;
    const html = render(data);
    expect(html).not.toContain("Marketing activity");
    expect(html).not.toContain("Campaign data unavailable");
  });

  it("shows genuine campaign failures when marketing is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_ENABLED", "true");
    const data = emptyData();
    data.marketingFailed = true;
    expect(render(data)).toContain("Campaign data unavailable. Please retry.");
  });
});
