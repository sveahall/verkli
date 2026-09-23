import { describe, it, expect } from "vitest";
import { rollupRows, type RollupInput } from "./rollup";

const row = (over: Partial<RollupInput> = {}): RollupInput => ({
  user_id: "user-1",
  occurred_at: "2026-09-22T10:00:00Z",
  pipeline: "tts",
  provider: "elevenlabs",
  unit: "chars",
  quantity: 100,
  cost_usd: 0.5,
  ...over,
});

describe("rollupRows", () => {
  it("groups by user, day, pipeline, provider and unit", () => {
    const out = rollupRows([row(), row({ quantity: 50, cost_usd: 0.25 })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      user_id: "user-1",
      day: "2026-09-22",
      pipeline: "tts",
      provider: "elevenlabs",
      unit: "chars",
      quantity_sum: 150,
      cost_usd_sum: 0.75,
      event_count: 2,
    });
  });

  it("keeps different days apart", () => {
    const out = rollupRows([row(), row({ occurred_at: "2026-09-23T01:00:00Z" })]);
    expect(out.map((r) => r.day).sort()).toEqual(["2026-09-22", "2026-09-23"]);
  });

  it("keeps different units apart, because they cannot be added", () => {
    // 1000 input_tokens plus 1000 chars is not 2000 of anything.
    const out = rollupRows([row({ unit: "input_tokens" }), row({ unit: "chars" })]);
    expect(out).toHaveLength(2);
  });

  it("treats a null pipeline or provider as empty string, matching the primary key", () => {
    // usage_daily's PK columns are NOT NULL with a '' default, so a null here
    // must collapse the same way or the upsert splits into phantom rows.
    const out = rollupRows([row({ pipeline: null, provider: null })]);
    expect(out[0]).toMatchObject({ pipeline: "", provider: "" });
  });

  it("counts an unpriced event without inflating cost", () => {
    const out = rollupRows([row({ cost_usd: null })]);
    expect(out[0].cost_usd_sum).toBe(0);
    expect(out[0].event_count).toBe(1);
  });

  it("returns nothing for no input", () => {
    expect(rollupRows([])).toEqual([]);
  });
});
