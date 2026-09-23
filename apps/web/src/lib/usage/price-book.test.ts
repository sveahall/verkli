import { describe, it, expect } from "vitest";
import { priceFor, computeCost } from "./price-book";
import type { PriceRow } from "./types";

const row = (over: Partial<PriceRow> = {}): PriceRow => ({
  version: "2026-09",
  provider: "openai",
  model: "gpt-6-astra",
  unit: "input_tokens",
  usd_per_unit: 0.0000025,
  effective_from: "2026-09-01T00:00:00Z",
  effective_to: null,
  ...over,
});

describe("priceFor", () => {
  it("finds the row matching provider, model and unit", () => {
    const found = priceFor([row()], "openai", "gpt-6-astra", "input_tokens", new Date("2026-09-22"));
    expect(found?.version).toBe("2026-09");
  });

  it("returns null when no row matches the model", () => {
    const found = priceFor([row()], "openai", "some-other-model", "input_tokens", new Date("2026-09-22"));
    expect(found).toBeNull();
  });

  it("does not price one unit with another unit's rate", () => {
    const found = priceFor([row()], "openai", "gpt-6-astra", "output_tokens", new Date("2026-09-22"));
    expect(found).toBeNull();
  });

  it("ignores rows that expired before the event", () => {
    const expired = row({ effective_to: "2026-09-10T00:00:00Z" });
    expect(priceFor([expired], "openai", "gpt-6-astra", "input_tokens", new Date("2026-09-22"))).toBeNull();
  });

  it("ignores rows that start after the event", () => {
    const future = row({ effective_from: "2026-10-01T00:00:00Z" });
    expect(priceFor([future], "openai", "gpt-6-astra", "input_tokens", new Date("2026-09-22"))).toBeNull();
  });

  it("picks the newest applicable row when versions overlap", () => {
    const older = row({ version: "2026-08", effective_from: "2026-08-01T00:00:00Z", usd_per_unit: 0.000005 });
    const newer = row({ version: "2026-09", effective_from: "2026-09-01T00:00:00Z", usd_per_unit: 0.0000025 });
    const found = priceFor([older, newer], "openai", "gpt-6-astra", "input_tokens", new Date("2026-09-22"));
    expect(found?.version).toBe("2026-09");
  });

  it("prices a historical event with the rate that was live at the time", () => {
    const older = row({ version: "2026-08", effective_from: "2026-08-01T00:00:00Z", effective_to: "2026-09-01T00:00:00Z", usd_per_unit: 0.000005 });
    const newer = row({ version: "2026-09", effective_from: "2026-09-01T00:00:00Z", usd_per_unit: 0.0000025 });
    const found = priceFor([older, newer], "openai", "gpt-6-astra", "input_tokens", new Date("2026-08-15"));
    expect(found?.version).toBe("2026-08");
  });
});

describe("computeCost", () => {
  it("multiplies quantity by the unit price", () => {
    expect(computeCost(row(), 40_000)).toEqual({ costUsd: 0.1, priceVersion: "2026-09" });
  });

  it("returns a null cost when the unit is unpriced, so quantity is still kept", () => {
    expect(computeCost(null, 40_000)).toEqual({ costUsd: null, priceVersion: null });
  });

  it("does not lose sub-cent precision", () => {
    const { costUsd } = computeCost(row({ usd_per_unit: 0.0000001 }), 3);
    expect(costUsd).toBeCloseTo(0.0000003, 10);
  });
});
