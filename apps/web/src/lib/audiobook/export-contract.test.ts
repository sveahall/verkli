import { describe, expect, it } from "vitest";
import { encodeExportMetadata, exportFormatSchema, exportMetadataSchema } from "./export-contract";
describe("audio export contract", () => {
  it("escapes metadata syntax while preserving Unicode", () => {
    const value = encodeExportMetadata({ title: "Vägen; hem=ja #1\\2", author: "Örn", narrator: "Synthetic tone", language: "swe" }, [{ id: "one", title: "Återkomst", startSample: 0, endSample: 108000 }]);
    expect(value).toContain("title=Vägen\\; hem\\=ja \\#1\\\\2");
    expect(value).toContain("TIMEBASE=1/48000\nSTART=0\nEND=108000\ntitle=Återkomst");
  });
  it("rejects unsupported output and metadata line injection", () => {
    expect(exportFormatSchema.safeParse("wav").success).toBe(false);
    expect(exportMetadataSchema.safeParse({ title: "Book\n[CHAPTER]", author: "Author", narrator: "Voice", language: "swe" }).success).toBe(false);
  });
});
