import { describe, expect, it } from "vitest";
import {
  ALL_TOOLS,
  TOOL_META,
  TOOL_ORDER,
  getInitialTool,
  getToolHref,
} from "./bookEditor.shared";

describe("TOOL_ORDER (author stepper flow)", () => {
  // Money-bug regression guard. `pricing` used to be missing from TOOL_ORDER,
  // so the panel was reachable only by hand-typing ?panel=pricing. An author
  // who followed the stepper never met a price field and published a free book
  // without ever being warned.
  it("contains the pricing step", () => {
    expect(TOOL_ORDER).toContain("pricing");
  });

  it("puts pricing before publish — a price is set before the book ships", () => {
    const pricingIndex = TOOL_ORDER.indexOf("pricing");
    const publishIndex = TOOL_ORDER.indexOf("publish");

    expect(pricingIndex).toBeGreaterThanOrEqual(0);
    expect(publishIndex).toBeGreaterThanOrEqual(0);
    expect(pricingIndex).toBeLessThan(publishIndex);
  });

  it("starts at the manuscript and ends at review", () => {
    expect(TOOL_ORDER[0]).toBe("edit");
    expect(TOOL_ORDER[TOOL_ORDER.length - 1]).toBe("review");
  });

  it("has label metadata for every step", () => {
    for (const tool of TOOL_ORDER) {
      expect(TOOL_META[tool]?.label).toBeTruthy();
      expect(TOOL_META[tool]?.shortLabel).toBeTruthy();
    }
  });
});

describe("ALL_TOOLS", () => {
  it("lists every stepper tool", () => {
    for (const tool of TOOL_ORDER) {
      expect(ALL_TOOLS).toContain(tool);
    }
  });

  it("has no duplicates — it spreads TOOL_ORDER and must not re-list its tools", () => {
    expect(new Set(ALL_TOOLS).size).toBe(ALL_TOOLS.length);
  });

  it("resolves every tool to a panel URL", () => {
    for (const tool of ALL_TOOLS) {
      const href = getToolHref("book-1", tool);
      expect(href.startsWith("/author/books/book-1")).toBe(true);
    }
  });
});

describe("getInitialTool", () => {
  it("defaults to the first step of the flow", () => {
    expect(getInitialTool(undefined, undefined)).toBe("edit");
  });

  it("honours a requested tool that is visible", () => {
    expect(getInitialTool(undefined, "pricing")).toBe("pricing");
  });

  it("falls back when the requested tool is not visible", () => {
    expect(getInitialTool(["cover", "production"], "pricing")).toBe("cover");
  });
});
