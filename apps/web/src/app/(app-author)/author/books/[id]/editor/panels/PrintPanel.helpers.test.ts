import { describe, expect, it } from "vitest";
import {
  buildCpiMasteringPreview,
  buildPrintChecklist,
  buildPrintFileStem,
  estimatePrintInteriorPages,
  extractIsbnCandidate,
  normalizePrintOnDemandSettings,
} from "./PrintPanel.helpers";

describe("print panel helpers", () => {
  it("extracts a 13-digit ISBN from URL-like metadata", () => {
    expect(
      extractIsbnCandidate("https://example.com/books/978-91-1234567-8", null, undefined)
    ).toBe("9789112345678");
  });

  it("estimates interior pages with minimum and even rounding", () => {
    expect(estimatePrintInteriorPages(120, 1)).toBe(24);
    expect(estimatePrintInteriorPages(19200, 12)).toBe(68);
  });

  it("creates a stable file stem from unicode-heavy titles", () => {
    expect(buildPrintFileStem("Äventyr i Åre!", "123e4567-e89b-12d3-a456-426614174000")).toBe(
      "aventyr-i-are"
    );
  });

  it("builds mastering XML with placeholders when metadata is missing", () => {
    const xml = buildCpiMasteringPreview({
      title: "Inget kan stoppa oss nu!",
      author: "Lasse",
      isbn: null,
      totalExtent: 0,
      fileStem: "inget-kan-stoppa-oss-nu",
    });

    expect(xml).toContain("<ISBN>[set-isbn]</ISBN>");
    expect(xml).toContain("<TotalExtent>[set-total-extent]</TotalExtent>");
    expect(xml).toContain("<FileName>inget-kan-stoppa-oss-nu_Cover.pdf</FileName>");
  });

  it("flags missing ISBN in the checklist", () => {
    const checklist = buildPrintChecklist({
      isbn: null,
      hasCoverImage: true,
      hasInteriorContent: true,
      totalExtent: 48,
      isPublished: false,
    });

    expect(checklist[0]?.status).toBe("missing");
    expect(checklist[4]?.status).toBe("review");
  });

  it("normalizes persisted print-on-demand settings", () => {
    expect(
      normalizePrintOnDemandSettings({
        enabled: true,
        formats: ["hardcover", "invalid", "softcover"],
        editionLimit: "limited",
        limitCount: "250",
        isbn: "978-91-1234567-8",
      })
    ).toEqual({
      enabled: true,
      formats: ["softcover", "hardcover"],
      editionLimit: "limited",
      limitCount: 250,
      isbn: "9789112345678",
      softcoverPriceMinor: null,
      hardcoverPriceMinor: null,
      priceCurrency: "SEK",
    });
  });

  it("falls back to safe defaults for malformed print-on-demand settings", () => {
    expect(
      normalizePrintOnDemandSettings({
        enabled: true,
        formats: [],
        editionLimit: "limited",
        limitCount: 0,
        isbn: "not-an-isbn",
      })
    ).toEqual({
      enabled: true,
      formats: ["softcover"],
      editionLimit: "limited",
      limitCount: 100,
      isbn: null,
      softcoverPriceMinor: null,
      hardcoverPriceMinor: null,
      priceCurrency: "SEK",
    });
  });
});
