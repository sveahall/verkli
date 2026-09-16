import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AnalyticsDashboard from "./AnalyticsCharts";
import type { AnalyticsData } from "./AnalyticsWorkspace";
function data(revenue: Record<string, unknown> | null): AnalyticsData {
  return { overviewStats: null, revenue, engagement: null, booksTable: [], bookDetail: null, marketingCampaigns: [] } as AnalyticsData;
}
const revenue = {
  totalRevenue: null, orderRevenue: null, donationRevenue: 0, currency: null,
  byCurrency: { SEK: 150, EUR: 49 }, subscriptionMRR: 99, subscriptionCurrency: "SEK",
  subscriptionByCurrency: { SEK: 99 }, subscriptionScope: "author", activeSubscriberCount: 1,
};
describe("analytics revenue presentation", () => {
  it("shows every sales currency and separates current all-author MRR", () => {
    const html = renderToStaticMarkup(<AnalyticsDashboard bookId="all" selectedBook={null} period="7d" loading={false} data={data(revenue)} />);
    expect(html).toContain("150 SEK");
    expect(html).toContain("49 EUR");
    expect(html).toContain("99 SEK");
    expect(html).toContain("Current subscriptions");
    expect(html).toContain("All books");
    expect(html).not.toContain("Donations");
    expect(html).not.toContain("249 SEK");
  });
  it("uses scoped revenue for a selected book rather than author-wide or dominant overview amounts", () => {
    const scoped = data({ ...revenue, totalRevenue: 49, orderRevenue: 49, currency: "EUR", byCurrency: { EUR: 49 } });
    scoped.bookDetail = { overview: { revenue: 9876, currency: "SEK" }, readers: {}, reviews: {}, dailyChart: [], chapterSignals: [] } as unknown as NonNullable<AnalyticsData["bookDetail"]>;
    const html = renderToStaticMarkup(<AnalyticsDashboard bookId="book-2" selectedBook={{ id: "book-2", title: "Selected" }} period="7d" loading={false} data={scoped} />);
    expect(html).toContain("49 EUR");
    expect(html).not.toContain("9.9K");
    expect(html).not.toContain("9,876 SEK");
    expect(html).toContain("All books");
  });
  it("shows missing sales as unavailable without inventing a zero or subtotal", () => {
    const html = renderToStaticMarkup(<AnalyticsDashboard bookId="all" selectedBook={null} period="7d" loading={false} data={data({ ...revenue, partial: true, byCurrency: null })} />);
    expect(html).toContain("Sales data unavailable");
    expect(html).not.toContain("0 SEK");
    expect(html).not.toContain("No sales yet");
  });
  it("keeps subscription data failures separate from successfully loaded sales", () => {
    const html = renderToStaticMarkup(<AnalyticsDashboard bookId="all" selectedBook={null} period="7d" loading={false} data={data({ ...revenue, partial: true, subscriptionByCurrency: null, activeSubscriberCount: null })} />);
    expect(html).toContain("150 SEK");
    expect(html).toContain("Subscription data unavailable");
    expect(html).not.toContain("No active subscribers");
  });
});
