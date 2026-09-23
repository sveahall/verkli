import { describe, expect, it } from "vitest";
import {
  AUTHOR_LINE_MAX,
  FLAP_TEXT_MAX,
  applyProfileToCoverCopy,
  authorLineFromProfile,
  normalizeCoverCopy,
} from "./cover-copy";

describe("normalizeCoverCopy", () => {
  it("returns an empty cover when the column is missing", () => {
    expect(normalizeCoverCopy(null)).toEqual({
      authorLine: "",
      dustJacket: false,
      flapText: "",
    });
  });

  it("keeps a dust jacket and clips text to the print limits", () => {
    const copy = normalizeCoverCopy({
      authorLine: "a".repeat(AUTHOR_LINE_MAX + 40),
      dustJacket: true,
      flapText: "b".repeat(FLAP_TEXT_MAX + 40),
    });

    expect(copy.dustJacket).toBe(true);
    expect(copy.authorLine).toHaveLength(AUTHOR_LINE_MAX);
    expect(copy.flapText).toHaveLength(FLAP_TEXT_MAX);
  });

  it("treats anything other than true as a standard cover", () => {
    expect(normalizeCoverCopy({ dustJacket: "yes" }).dustJacket).toBe(false);
  });
});

describe("authorLineFromProfile", () => {
  it("collapses a short bio into one line", () => {
    expect(authorLineFromProfile("NN är professor.\n\nVid Stockholms universitet.")).toBe(
      "NN är professor. Vid Stockholms universitet."
    );
  });

  it("cuts a long bio on a word boundary", () => {
    const bio = `${"ord ".repeat(80)}slut`;
    const line = authorLineFromProfile(bio);
    expect(line.endsWith("…")).toBe(true);
    expect(line.length).toBeLessThanOrEqual(AUTHOR_LINE_MAX);
    expect(line.endsWith(" …")).toBe(false);
  });
});

describe("applyProfileToCoverCopy", () => {
  it("fills the back-cover line and seeds an empty flap", () => {
    const next = applyProfileToCoverCopy(
      { authorLine: "", dustJacket: true, flapText: "  " },
      "NN är professor i medeltidens arkeologi."
    );

    expect(next.authorLine).toBe("NN är professor i medeltidens arkeologi.");
    expect(next.flapText).toBe("NN är professor i medeltidens arkeologi.");
    expect(next.dustJacket).toBe(true);
  });

  it("leaves a flap the author already wrote", () => {
    const next = applyProfileToCoverCopy(
      { authorLine: "old", dustJacket: false, flapText: "Längre text på fliken." },
      "Kort profil."
    );

    expect(next.authorLine).toBe("Kort profil.");
    expect(next.flapText).toBe("Längre text på fliken.");
  });
});
