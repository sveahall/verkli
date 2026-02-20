import { describe, it, expect, beforeEach } from "vitest";
import type { CatalogRow } from "@/lib/billing/catalog";
import {
  resolveRolePlanFromPriceIdsWithCatalog,
  clearCatalogCache,
} from "@/lib/billing/catalog";

const PLUS_READER = "price_1SyunUAddvXwS9Pwvebprjjd";
const PRO_AUTHOR = "price_1Syup9AddvXwS9PwrM8vP9pu";

const STUB_CATALOG: CatalogRow[] = [
  { provider: "stripe", role: "reader", plan_key: "plus", price_id: PLUS_READER, is_active: true },
  { provider: "stripe", role: "author", plan_key: "pro", price_id: PRO_AUTHOR, is_active: true },
];

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
        { provider: "stripe", role: "author", plan_key: "plus", price_id: "price_author_plus", is_active: true },
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
});
