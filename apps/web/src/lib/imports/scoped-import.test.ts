import { describe, expect, it } from "vitest";
import { parseRightsConfirmed, validateImportFileContents } from "@/lib/imports/scoped-import";

describe("validateImportFileContents", () => {
  it("rejects non-docx files that are otherwise allowed", () => {
    const textBuffer = Buffer.from("plain text", "utf8");
    expect(validateImportFileContents("book.txt", textBuffer)).toBeNull();
  });

  it("rejects pages archive renamed to docx", () => {
    const fakePagesArchive = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("Index/Document.iwa Metadata/DocumentIdentifier", "utf8"),
    ]);

    const error = validateImportFileContents("book.docx", fakePagesArchive);
    expect(error).toMatch(/Apple Pages/i);
  });

  it("accepts docx-like zip payload with main document part", () => {
    const fakeDocx = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("[Content_Types].xml word/document.xml", "utf8"),
    ]);

    expect(validateImportFileContents("book.docx", fakeDocx)).toBeNull();
  });
});

describe("parseRightsConfirmed", () => {
  it("accepts true-ish checkbox values", () => {
    expect(parseRightsConfirmed("true")).toBe(true);
    expect(parseRightsConfirmed("on")).toBe(true);
    expect(parseRightsConfirmed("1")).toBe(true);
  });

  it("rejects missing or false values", () => {
    expect(parseRightsConfirmed(null)).toBe(false);
    expect(parseRightsConfirmed("false")).toBe(false);
    expect(parseRightsConfirmed("0")).toBe(false);
  });
});
