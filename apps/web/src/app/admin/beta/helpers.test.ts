import { describe, it, expect } from "vitest";
import {
  evaluateKillCriteria,
  formatPercent,
  formatNumber,
  isAllZero,
  deriveLoadState,
  RETENTION_FLOOR_RATE,
  RETENTION_ELIGIBLE_FLOOR,
  type CohortMetrics,
} from "./helpers";

function cohort(overrides: Partial<CohortMetrics> = {}): CohortMetrics {
  return {
    waitlist_signups: 0,
    beta_grants: 0,
    first_publish: 0,
    first_read: 0,
    retention_7d: { rate: 0, returning: 0, eligible: 0, window_days: 7 },
    ...overrides,
  };
}

describe("evaluateKillCriteria", () => {
  it("does not warn on low retention when the eligible cohort is too small", () => {
    const result = evaluateKillCriteria(
      cohort({
        retention_7d: { rate: 0, returning: 0, eligible: 1, window_days: 7 },
      })
    );
    expect(result.lowRetention).toBe(false);
    expect(result.warnings.find((w) => w.includes("Retention"))).toBeUndefined();
  });

  it("warns on low retention when eligible meets the floor and rate is below threshold", () => {
    const result = evaluateKillCriteria(
      cohort({
        retention_7d: {
          rate: RETENTION_FLOOR_RATE - 0.05,
          returning: 1,
          eligible: RETENTION_ELIGIBLE_FLOOR + 2,
          window_days: 7,
        },
      })
    );
    expect(result.lowRetention).toBe(true);
    expect(result.warnings.some((w) => /Retention 7d/i.test(w))).toBe(true);
  });

  it("does not warn when retention sits exactly at the floor", () => {
    const result = evaluateKillCriteria(
      cohort({
        retention_7d: {
          rate: RETENTION_FLOOR_RATE,
          returning: 2,
          eligible: 10,
          window_days: 7,
        },
      })
    );
    expect(result.lowRetention).toBe(false);
  });

  it("warns about zero publishes when at least one user has been granted beta", () => {
    const result = evaluateKillCriteria(
      cohort({ beta_grants: 1, first_publish: 0 })
    );
    expect(result.zeroPublish).toBe(true);
    expect(result.warnings.some((w) => /no authors have published/i.test(w))).toBe(
      true
    );
  });

  it("does not warn about zero publishes when nobody has been granted yet", () => {
    const result = evaluateKillCriteria(
      cohort({ beta_grants: 0, first_publish: 0 })
    );
    expect(result.zeroPublish).toBe(false);
  });

  it("returns no warnings when the cohort is healthy", () => {
    const result = evaluateKillCriteria(
      cohort({
        beta_grants: 20,
        first_publish: 5,
        first_read: 30,
        retention_7d: { rate: 0.45, returning: 9, eligible: 20, window_days: 7 },
      })
    );
    expect(result.lowRetention).toBe(false);
    expect(result.zeroPublish).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("formatPercent / formatNumber", () => {
  it("formatPercent renders one decimal", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(0.123)).toBe("12.3%");
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("formatPercent handles non-finite values", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formatNumber uses thousand separators", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(1_000_000)).toBe("1,000,000");
  });
});

describe("isAllZero", () => {
  it("treats a fresh cohort as empty", () => {
    expect(isAllZero(cohort())).toBe(true);
  });

  it("treats any non-zero metric as non-empty", () => {
    expect(isAllZero(cohort({ waitlist_signups: 1 }))).toBe(false);
    expect(isAllZero(cohort({ beta_grants: 1 }))).toBe(false);
    expect(isAllZero(cohort({ first_publish: 1 }))).toBe(false);
    expect(isAllZero(cohort({ first_read: 1 }))).toBe(false);
    expect(
      isAllZero(
        cohort({
          retention_7d: { rate: 0, returning: 0, eligible: 1, window_days: 7 },
        })
      )
    ).toBe(false);
  });
});

describe("deriveLoadState", () => {
  it("returns loading while the request is in flight", () => {
    expect(deriveLoadState({ status: "loading" })).toEqual({ kind: "loading" });
  });

  it("returns an error on network failure", () => {
    const state = deriveLoadState({ status: "error" });
    expect(state.kind).toBe("error");
  });

  it("returns access-denied error on 401/403", () => {
    expect(
      deriveLoadState({ status: "fetched", httpStatus: 401 })
    ).toEqual({ kind: "error", message: "Access denied — admin role required." });
    expect(
      deriveLoadState({ status: "fetched", httpStatus: 403 })
    ).toEqual({ kind: "error", message: "Access denied — admin role required." });
  });

  it("returns a generic error on 5xx", () => {
    const state = deriveLoadState({ status: "fetched", httpStatus: 503 });
    expect(state.kind).toBe("error");
    expect((state as { message: string }).message).toMatch(/503/);
  });

  it("flags missing cohort block as an error", () => {
    const state = deriveLoadState({
      status: "fetched",
      httpStatus: 200,
      body: { since: "x", author: [], reader: [] },
    });
    expect(state.kind).toBe("error");
    expect((state as { message: string }).message).toMatch(/cohort/);
  });

  it("returns empty when the cohort is all zero", () => {
    const state = deriveLoadState({
      status: "fetched",
      httpStatus: 200,
      body: { since: "x", author: [], reader: [], cohort: cohort() },
    });
    expect(state.kind).toBe("empty");
  });

  it("returns ready when at least one cohort metric is non-zero", () => {
    const state = deriveLoadState({
      status: "fetched",
      httpStatus: 200,
      body: {
        since: "x",
        author: [],
        reader: [],
        cohort: cohort({ waitlist_signups: 4 }),
      },
    });
    expect(state.kind).toBe("ready");
    expect((state as { cohort: CohortMetrics }).cohort.waitlist_signups).toBe(4);
  });
});
