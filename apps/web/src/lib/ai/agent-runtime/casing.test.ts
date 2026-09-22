import { describe, expect, it } from "vitest";
import { transferCasing } from "./casing";

describe("transferCasing", () => {
  it("carries the two unambiguous patterns across", () => {
    expect(transferCasing("Johan", "jonas")).toBe("Jonas");
    expect(transferCasing("JOHAN", "jonas")).toBe("JONAS");
    expect(transferCasing("johan", "jonas")).toBe("jonas");
    // A lowercase match does not force the replacement down: the model already
    // wrote the word the way it belongs, and a lowercase name was a typo.
    expect(transferCasing("johan", "Jonas")).toBe("Jonas");
  });

  it("raises the first letter even when punctuation comes first", () => {
    expect(transferCasing("Johan", '"jonas"')).toBe('"Jonas"');
  });

  it("leaves anything it cannot read confidently exactly as written", () => {
    // Mixed case is a deliberate spelling, not a pattern to imitate.
    expect(transferCasing("jOhAn", "Jonas")).toBe("Jonas");
    expect(transferCasing("McDonald", "o'brien")).toBe("o'brien");
    // A single letter carries no pattern: "I" → "we", not "We".
    expect(transferCasing("I", "we")).toBe("we");
    expect(transferCasing("42", "45")).toBe("45");
  });

  it("uses Unicode case, so Swedish behaves like everything else", () => {
    expect(transferCasing("ÅKE", "östen")).toBe("ÖSTEN");
    expect(transferCasing("Åke", "östen")).toBe("Östen");
  });
});
