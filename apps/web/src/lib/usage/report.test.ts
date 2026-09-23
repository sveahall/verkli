import { describe, it, expect } from "vitest";
import { summarizeByUser, summarizeByPipeline, summarizeByDay, type UsageRow } from "./report";

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  user_id: "user-1",
  occurred_at: "2026-09-22T10:00:00Z",
  kind: "ai_call",
  provider: "openai",
  model: "gpt-6-astra",
  pipeline: "editorial",
  quantity: 1000,
  unit: "input_tokens",
  cost_usd: 0.25,
  meta: {},
  ...over,
});

describe("summarizeByUser", () => {
  it("sums cost across every priced event", () => {
    const [u] = summarizeByUser([row(), row({ cost_usd: 0.75 })]);
    expect(u.costUsd).toBeCloseTo(1.0, 6);
  });

  it("counts unpriced events separately so a low cost is not mistaken for cheap", () => {
    // An unpriced model contributes 0 to cost. Without this counter a user
    // running an unpriced model looks free rather than unmeasured.
    const [u] = summarizeByUser([row({ cost_usd: null, meta: { price_missing: true } })]);
    expect(u.costUsd).toBe(0);
    expect(u.unpricedEvents).toBe(1);
  });

  it("takes the most recent storage snapshot per bucket, never the sum", () => {
    // Snapshots are readings, not increments. Summing them would report a user
    // who was measured twice as storing twice as much.
    const rows = [
      row({ kind: "storage_snapshot", unit: "bytes", quantity: 100, cost_usd: null,
            occurred_at: "2026-09-20T00:00:00Z", meta: { bucket: "audiobooks" } }),
      row({ kind: "storage_snapshot", unit: "bytes", quantity: 300, cost_usd: null,
            occurred_at: "2026-09-22T00:00:00Z", meta: { bucket: "audiobooks" } }),
    ];
    expect(summarizeByUser(rows)[0].storageBytes).toBe(300);
  });

  it("adds storage across different buckets", () => {
    const rows = [
      row({ kind: "storage_snapshot", unit: "bytes", quantity: 100, cost_usd: null,
            meta: { bucket: "audiobooks" } }),
      row({ kind: "storage_snapshot", unit: "bytes", quantity: 50, cost_usd: null,
            meta: { bucket: "book_covers" } }),
    ];
    expect(summarizeByUser(rows)[0].storageBytes).toBe(150);
  });

  it("sums egress, which unlike storage is cumulative", () => {
    const rows = [
      row({ kind: "egress_grant", unit: "bytes", quantity: 100, cost_usd: null }),
      row({ kind: "egress_grant", unit: "bytes", quantity: 200, cost_usd: null }),
    ];
    expect(summarizeByUser(rows)[0].egressBytes).toBe(300);
  });

  it("counts jobs and their total runtime", () => {
    const rows = [
      row({ kind: "job", unit: "ms", quantity: 1500, cost_usd: null }),
      row({ kind: "job", unit: "ms", quantity: 500, cost_usd: null }),
    ];
    const [u] = summarizeByUser(rows);
    expect(u.jobCount).toBe(2);
    expect(u.jobMs).toBe(2000);
  });

  it("separates users and orders the most expensive first", () => {
    const out = summarizeByUser([
      row({ user_id: "cheap", cost_usd: 0.1 }),
      row({ user_id: "dear", cost_usd: 9.0 }),
    ]);
    expect(out.map((u) => u.userId)).toEqual(["dear", "cheap"]);
  });

  it("returns nothing for no rows rather than a zero row", () => {
    expect(summarizeByUser([])).toEqual([]);
  });
});

describe("summarizeByPipeline", () => {
  it("groups cost and event counts by pipeline, dearest first", () => {
    const out = summarizeByPipeline([
      row({ pipeline: "tts", cost_usd: 5 }),
      row({ pipeline: "editorial", cost_usd: 1 }),
      row({ pipeline: "tts", cost_usd: 2 }),
    ]);
    expect(out[0]).toMatchObject({ pipeline: "tts", costUsd: 7, events: 2 });
    expect(out[1]).toMatchObject({ pipeline: "editorial", costUsd: 1, events: 1 });
  });

  it("labels a null pipeline rather than dropping the row", () => {
    const out = summarizeByPipeline([row({ pipeline: null, cost_usd: 1 })]);
    expect(out[0].pipeline).toBe("(none)");
  });
});

describe("summarizeByDay", () => {
  it("buckets by calendar day in chronological order", () => {
    const out = summarizeByDay([
      row({ occurred_at: "2026-09-22T23:00:00Z", cost_usd: 2 }),
      row({ occurred_at: "2026-09-21T01:00:00Z", cost_usd: 1 }),
      row({ occurred_at: "2026-09-22T01:00:00Z", cost_usd: 3 }),
    ]);
    expect(out).toEqual([
      { day: "2026-09-21", costUsd: 1, events: 1 },
      { day: "2026-09-22", costUsd: 5, events: 2 },
    ]);
  });
});
