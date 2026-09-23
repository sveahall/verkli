import { describe, expect, it } from "vitest";
import { buildLinePath } from "@/features/author-workspaces/analytics/AnalyticsCharts";

describe("AnalyticsCharts helpers", () => {
  it("builds a normalized SVG path across the chart width", () => {
    const path = buildLinePath(
      [
        { date: "2026-03-01", views: 10, reads: 4, purchases: 1 },
        { date: "2026-03-02", views: 20, reads: 8, purchases: 2 },
        { date: "2026-03-03", views: 30, reads: 12, purchases: 3 },
      ],
      (point) => point.reads,
      12
    );

    expect(path).toBe("0,66.66666666666667 50,33.33333333333334 100,0");
  });

  it("centers a single point on the chart", () => {
    const path = buildLinePath(
      [{ date: "2026-03-01", views: 10, reads: 5, purchases: 1 }],
      (point) => point.reads,
      5
    );

    expect(path).toBe("50,0");
  });
});
