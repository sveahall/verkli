import { describe, it, expect, beforeEach } from "vitest";
import type { CatalogRow } from "@/lib/billing/catalog";
import {
  resolveRolePlanFromPriceIdsWithCatalog,
  clearCatalogCache,
  getStripeMode,
  rowMatchesMode,
  selectPriceIdFromCatalog,
} from "@/lib/billing/catalog";

const PLUS_READER = "price_1SyunUAddvXwS9Pwvebprjjd";
const PRO_AUTHOR = "price_1Syup9AddvXwS9PwrM8vP9pu";

const STUB_CATALOG: CatalogRow[] = [
  { provider: "stripe", role: "reader", plan_key: "plus", price_id: PLUS_READER, is_active: true, interval: "month" as const, livemode: null },
  { provider: "stripe", role: "author", plan_key: "pro", price_id: PRO_AUTHOR, is_active: true, interval: "month" as const, livemode: null },
];

function row(over: Partial<CatalogRow> = {}): CatalogRow {
  return {
    provider: "stripe",
    role: "author",
    plan_key: "pro",
    price_id: "price_x",
    is_active: true,
    interval: "month",
    livemode: null,
    ...over,
  };
}

describe("billing catalog", () => {
  beforeEach(() => {
    clearCatalogCache();
  });

  describe("resolveRolePlanFromPriceIdsWithCatalog", () => {
    it("returns reader plus for Plus price id", () => {
      const result = resolveRolePlanFromPriceIdsWithCatalog([PLUS_READER], STUB_CATALOG);
      expect(result).toEqual({ role: "reader", planKey: "plus" });
    });

    it("returns author pro for Pro price id", () => {
      const result = resolveRolePlanFromPriceIdsWithCatalog([PRO_AUTHOR], STUB_CATALOG);
      expect(result).toEqual({ role: "author", planKey: "pro" });
    });

    it("returns null for unknown price id", () => {
      const result = resolveRolePlanFromPriceIdsWithCatalog(
        ["price_unknown_xyz"],
        STUB_CATALOG
      );
      expect(result).toBeNull();
    });

    it("returns null for empty price ids", () => {
      expect(resolveRolePlanFromPriceIdsWithCatalog([], STUB_CATALOG)).toBeNull();
    });

    it("returns single role when multiple price ids match same role (pro wins over plus)", () => {
      const catalogWithBoth: CatalogRow[] = [
        ...STUB_CATALOG,
        { provider: "stripe", role: "author", plan_key: "plus", price_id: "price_author_plus", is_active: true, interval: "month" as const, livemode: null },
      ];
      const result = resolveRolePlanFromPriceIdsWithCatalog(
        [PRO_AUTHOR, "price_author_plus"],
        catalogWithBoth
      );
      expect(result).toEqual({ role: "author", planKey: "pro" });
    });

    it("returns null when price ids match both reader and author (data bug)", () => {
      const result = resolveRolePlanFromPriceIdsWithCatalog(
        [PLUS_READER, PRO_AUTHOR],
        STUB_CATALOG
      );
      expect(result).toBeNull();
    });

    it("is case-insensitive on price_id", () => {
      const result = resolveRolePlanFromPriceIdsWithCatalog(
        [PLUS_READER.toUpperCase()],
        STUB_CATALOG
      );
      expect(result).toEqual({ role: "reader", planKey: "plus" });
    });
  });

  describe("getStripeMode", () => {
    it("reads live and test from the key prefix", () => {
      expect(getStripeMode({ STRIPE_SECRET_KEY: "sk_live_abc" })).toBe("live");
      expect(getStripeMode({ STRIPE_SECRET_KEY: "sk_test_abc" })).toBe("test");
      expect(getStripeMode({ STRIPE_SECRET_KEY: "rk_live_abc" })).toBe("live");
      expect(getStripeMode({ STRIPE_SECRET_KEY: "rk_test_abc" })).toBe("test");
    });

    it("returns null when no key is configured, so nothing gets filtered out", () => {
      expect(getStripeMode({})).toBeNull();
      expect(getStripeMode({ STRIPE_SECRET_KEY: "   " })).toBeNull();
      expect(getStripeMode({ STRIPE_SECRET_KEY: "pk_live_abc" })).toBeNull();
    });
  });

  describe("rowMatchesMode", () => {
    it("keeps only rows from the key's own mode", () => {
      expect(rowMatchesMode(row({ livemode: true }), "live")).toBe(true);
      expect(rowMatchesMode(row({ livemode: false }), "test")).toBe(true);
    });

    it("rejects a cross-mode row — this is the production outage", () => {
      // A live key with a test price id is what Stripe answers `No such price`
      // to, surfacing as a 500 on every subscription checkout.
      expect(rowMatchesMode(row({ livemode: false }), "live")).toBe(false);
      expect(rowMatchesMode(row({ livemode: true }), "test")).toBe(false);
    });

    it("keeps rows that predate the livemode column", () => {
      // Excluding these would empty the catalog wherever the migration has not
      // run yet, taking checkout down rather than protecting it.
      expect(rowMatchesMode(row({ livemode: null }), "live")).toBe(true);
      expect(rowMatchesMode(row({ livemode: null }), "test")).toBe(true);
    });

    it("keeps every row when the mode is unknown", () => {
      expect(rowMatchesMode(row({ livemode: true }), null)).toBe(true);
      expect(rowMatchesMode(row({ livemode: false }), null)).toBe(true);
    });
  });

  describe("selectPriceIdFromCatalog", () => {
    it("returns the price id for an exact role/plan/interval match", () => {
      expect(selectPriceIdFromCatalog(STUB_CATALOG, "author", "pro", "month")).toBe(PRO_AUTHOR);
      expect(selectPriceIdFromCatalog(STUB_CATALOG, "reader", "plus", "month")).toBe(PLUS_READER);
    });

    it("returns null when the plan has no row for that interval", () => {
      expect(selectPriceIdFromCatalog(STUB_CATALOG, "author", "pro", "year")).toBeNull();
    });

    it("refuses to guess when two rows match the same plan", () => {
      // This is the shape the livemode migration makes possible: one live row
      // and one test row for the same plan. Picking whichever came back first
      // would decide at random whether the price id matches the Stripe key,
      // so a 500 that names the problem beats an intermittent one.
      const ambiguous: CatalogRow[] = [
        row({ price_id: "price_live", livemode: true }),
        row({ price_id: "price_test", livemode: false }),
      ];
      expect(selectPriceIdFromCatalog(ambiguous, "author", "pro", "month")).toBeNull();
    });

    it("is fine with two rows for the same plan on different intervals", () => {
      const monthAndYear: CatalogRow[] = [
        row({ price_id: "price_m", interval: "month" }),
        row({ price_id: "price_y", interval: "year" }),
      ];
      expect(selectPriceIdFromCatalog(monthAndYear, "author", "pro", "month")).toBe("price_m");
      expect(selectPriceIdFromCatalog(monthAndYear, "author", "pro", "year")).toBe("price_y");
    });

    it("defaults to the monthly row when no interval is given", () => {
      const monthAndYear: CatalogRow[] = [
        row({ price_id: "price_m", interval: "month" }),
        row({ price_id: "price_y", interval: "year" }),
      ];
      expect(selectPriceIdFromCatalog(monthAndYear, "author", "pro")).toBe("price_m");
    });
  });
});
