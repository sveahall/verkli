import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CoverCopyCard from "./CoverCopyCard";
import type { CoverCopy } from "@/lib/cover-copy";

const empty: CoverCopy = { authorLine: "", dustJacket: false, flapText: "" };

describe("CoverCopyCard", () => {
  it("offers a profile fetch and a dust jacket choice", () => {
    const html = renderToStaticMarkup(
      <CoverCopyCard
        value={empty}
        profileBio="NN är professor i medeltidens arkeologi."
        bookTitle="Runor"
        authorName="NN"
        coverUrl={null}
        saveState="idle"
        onChange={() => {}}
      />
    );

    expect(html).toContain("Fetch from profile");
    expect(html).toContain("Dust jacket");
    expect(html).toContain("Author line");
    expect(html).not.toContain("Flap text");
  });

  it("shows the flap note when a dust jacket is selected", () => {
    const html = renderToStaticMarkup(
      <CoverCopyCard
        value={{ ...empty, dustJacket: true, authorLine: "Kort rad." }}
        profileBio=""
        bookTitle="Runor"
        authorName="NN"
        coverUrl={null}
        saveState="saved"
        onChange={() => {}}
      />
    );

    expect(html).toContain("Flap text");
    expect(html).toContain("Back flap");
    expect(html).toContain("Saved");
    expect(html).toContain("/author/profile");
  });
});
