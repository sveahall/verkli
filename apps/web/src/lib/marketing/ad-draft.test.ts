import { describe, expect, it } from "vitest";
import { adDraftSchema, calculateAdBudget, isAdDraftConfig } from "./ad-draft";
const draft = { name: "Ocean launch", channel: "My chosen placement", objective: "Book visits", audience: "People interested in ocean stories", headline: "Ocean", copy: "A family crosses the sea.", destinationUrl: "https://example.com/book", currency: "SEK", totalBudget: "100", dailyBudget: "20", startDate: "2026-09-01", endDate: "2026-09-07" };
describe("ad draft planning", () => {
  it("accepts author supplied choices without inventing a provider or budget", () => {
    expect(adDraftSchema.parse(draft)).toEqual(draft);
    expect(isAdDraftConfig({ kind: "ad_draft", version: 999 })).toBe(true);
    expect(isAdDraftConfig({ kind: "campaign" })).toBe(false);
  });
  it("caps planned spend using exact decimals and inclusive calendar dates", () => {
    expect(calculateAdBudget(draft)).toMatchObject({ days: 7, maximumSpend: "100", limitedByTotal: true });
    expect(calculateAdBudget({ ...draft, totalBudget: "0.3", dailyBudget: "0.1", endDate: "2026-09-03" })).toMatchObject({ days: 3, maximumSpend: "0.3", limitedByTotal: false });
    expect(calculateAdBudget({ ...draft, dailyBudget: null })).toMatchObject({ maximumSpend: "100", dailyBudget: null });
  });
  it.each([
    { startDate: "2026-02-31" }, { endDate: "2026-08-31" }, { endDate: "2027-09-01" },
    { totalBudget: "0" }, { totalBudget: "-1" }, { dailyBudget: "1e3" }, { dailyBudget: "0" },
    { totalBudget: "9007199254740991" }, { totalBudget: "NaN" }, { currency: "" },
    { destinationUrl: "javascript:alert(1)" }, { destinationUrl: "https://user:password@example.com" }, { publish: true },
  ])("rejects invalid or executable input %j", patch => {
    expect(adDraftSchema.safeParse({ ...draft, ...patch }).success).toBe(false);
  });
  it("counts leap and timezone transition dates as calendar days", () => {
    expect(calculateAdBudget({ ...draft, startDate: "2028-02-28", endDate: "2028-03-01" }).days).toBe(3);
    expect(calculateAdBudget({ ...draft, startDate: "2026-03-28", endDate: "2026-03-30" }).days).toBe(3);
  });
});
