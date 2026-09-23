import { describe, it, expect } from "vitest";
import { findCostAlerts, type DailySpend } from "./alerts";

const spend = (over: Partial<DailySpend> = {}): DailySpend => ({
  userId: "user-1",
  day: "2026-09-22",
  costUsd: 1,
  ...over,
});

const limits = { platformDailyUsd: 50, userDailyUsd: 10 };

describe("findCostAlerts", () => {
  it("is quiet when nothing crosses a threshold", () => {
    expect(findCostAlerts([spend({ costUsd: 5 }), spend({ userId: "u2", costUsd: 5 })], limits)).toEqual([]);
  });

  it("flags a single user over their daily ceiling", () => {
    const [alert] = findCostAlerts([spend({ costUsd: 12.5 })], limits);
    expect(alert).toMatchObject({ kind: "user", userId: "user-1", costUsd: 12.5, limitUsd: 10 });
  });

  it("flags the platform total even when no single user stands out", () => {
    // Ten users at $6 each is $60 — under the per-user ceiling, over the
    // platform one. Watching only per-user misses exactly this shape.
    const rows = Array.from({ length: 10 }, (_, i) => spend({ userId: `u${i}`, costUsd: 6 }));
    const alerts = findCostAlerts(rows, limits);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "platform", costUsd: 60, limitUsd: 50 });
  });

  it("reports both when one user blows through both ceilings alone", () => {
    const alerts = findCostAlerts([spend({ costUsd: 80 })], limits);
    expect(alerts.map((a) => a.kind).sort()).toEqual(["platform", "user"]);
  });

  it("sums a user's rows across the day before comparing", () => {
    const rows = [spend({ costUsd: 6 }), spend({ costUsd: 6 })];
    const [alert] = findCostAlerts(rows, limits);
    expect(alert).toMatchObject({ kind: "user", costUsd: 12 });
  });

  it("keeps users on different days apart", () => {
    const rows = [spend({ costUsd: 6 }), spend({ day: "2026-09-21", costUsd: 6 })];
    expect(findCostAlerts(rows, limits)).toEqual([]);
  });

  it("orders the dearest alert first", () => {
    const rows = [spend({ userId: "small", costUsd: 11 }), spend({ userId: "big", costUsd: 40 })];
    const alerts = findCostAlerts(rows, limits).filter((a) => a.kind === "user");
    expect(alerts.map((a) => a.userId)).toEqual(["big", "small"]);
  });

  it("never fires on zero spend, which is what an unpriced model looks like", () => {
    // Every cost is null until the price book is filled. A threshold that
    // fires on 0 would cry wolf on day one and be muted before it mattered.
    expect(findCostAlerts([spend({ costUsd: 0 })], { platformDailyUsd: 0, userDailyUsd: 0 })).toEqual([]);
  });
});
