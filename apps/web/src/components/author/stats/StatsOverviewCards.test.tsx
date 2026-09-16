import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StatsOverviewCards from "./StatsOverviewCards";
describe("legacy sales card", () => {
  it("displays every currency without pretending they have a single total", () => {
    const html = renderToStaticMarkup(<StatsOverviewCards views={2} reads={1} publishedBooks={1} revenue={null} currency={null} byCurrency={{ SEK: 150, EUR: 49 }} />);
    expect(html).toContain("150 SEK");
    expect(html).toContain("49 EUR");
    expect(html).toContain("Book sales");
  });
  it("shows unavailable instead of a financial zero when revenue failed", () => {
    const html = renderToStaticMarkup(<StatsOverviewCards views={2} reads={1} publishedBooks={1} revenue={null} currency={null} byCurrency={null} />);
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("0 SEK");
  });
});
