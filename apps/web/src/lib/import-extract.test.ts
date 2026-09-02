import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  extractFromTxt,
  runExtract,
  repairImportedChapterTitles,
  repairOrphanedLeadingPeriods,
  splitIntoChaptersHeuristic,
  stripDecorativeChars,
} from "./import-extract";

describe("import-extract", () => {
  it("splits front matter into separate sections and removes standalone page markers", () => {
    const source = `
Inget kan stoppa

Johan Stael von Holstein

Innehåll

Förord 8

Kapitel ett 10

Förord

Det här är förordet.

8

Det fortsätter här.

Kapitel ett

Det här är kapitel ett med löptext som är tillräckligt lång för att klassas som riktigt innehåll.
`;

    const chapters = splitIntoChaptersHeuristic(source);
    const titles = chapters.map((chapter) => chapter.title);

    expect(titles).toContain("Innehållsförteckning");
    expect(titles).toContain("Förord");
    expect(titles).toContain("Kapitel ett");

    const forord = chapters.find((chapter) => chapter.title === "Förord");
    expect(forord?.sourceText).not.toMatch(/(?:^|\n\n)8(?:\n\n|$)/);
  });

  it("normalizes merged chapter headings from OCR-like docx text", () => {
    const source = `
Kapitel fyragjorde för andra elever

Det här är ett kapitel med tillräckligt mycket text för att splitten ska vara stabil och ge en tydlig titel.
`;

    const chapters = splitIntoChaptersHeuristic(source);
    expect(chapters[0]?.title).toBe("Kapitel fyra");
  });

  it("does not collapse OCR-misspelled thirty-series headings into 'Kapitel tre'", () => {
    const source = `
Kapitel tretioettDen nästa

Det här är ett kapitel med tillräckligt mycket text för att splitten ska vara stabil och ge en tydlig titel.

Kapitel tretiotvåDen nästa

Det här är ett kapitel med tillräckligt mycket text för att splitten ska vara stabil och ge en tydlig titel.
`;

    const chapters = splitIntoChaptersHeuristic(source);
    const titles = chapters.map((chapter) => chapter.title.toLowerCase());

    expect(titles[0]).toContain("tretio");
    expect(titles[1]).toContain("tretio");
    expect(titles).not.toContain("kapitel tre");
  });

  it("renumbers chapter titles when one broken title is duplicated many times", () => {
    const source = Array.from({ length: 6 }, (_, index) => {
      return `
Kapitel treDen avsnitt ${index + 1}

Det här är ett långt textstycke som gör att kapitel-splittningen blir stabil och inte faller tillbaka till chunking. ${"Mer text ".repeat(120)}
`;
    }).join("\n\n");

    const chapters = splitIntoChaptersHeuristic(source);
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      "Kapitel 1",
      "Kapitel 2",
      "Kapitel 3",
      "Kapitel 4",
      "Kapitel 5",
      "Kapitel 6",
    ]);
  });

  it("repairs duplicated imported chapter titles in existing data", () => {
    const repaired = repairImportedChapterTitles([
      "Inledning",
      "Kapitel tre",
      "Kapitel tre",
      "Kapitel tre",
      "Kapitel tre",
      "Kapitel tre",
      "Kapitel tre",
    ]);

    expect(repaired).toEqual([
      "Inledning",
      "Kapitel 1",
      "Kapitel 2",
      "Kapitel 3",
      "Kapitel 4",
      "Kapitel 5",
      "Kapitel 6",
    ]);
  });

  it("converts chapter word labels into numeric labels", () => {
    const repaired = repairImportedChapterTitles([
      "Introduction",
      "Förord",
      "Kapitel ett",
      "Kapitel två",
      "Kapitel tre",
      "Kapitel fyra",
    ]);

    expect(repaired).toEqual([
      "Introduction",
      "Förord",
      "Kapitel 1",
      "Kapitel 2",
      "Kapitel 3",
      "Kapitel 4",
    ]);
  });

  it("strips decorative Unicode characters", () => {
    expect(stripDecorativeChars("■Hr W")).toBe("Hr W");
    expect(stripDecorativeChars("★ Chapter One ★")).toBe("Chapter One");
    expect(stripDecorativeChars("● Item")).toBe("Item");
  });

  it("removes orphaned leading periods from paragraph splits", () => {
    expect(repairOrphanedLeadingPeriods(". en sådan mamma")).toBe("en sådan mamma");
    expect(repairOrphanedLeadingPeriods("First paragraph.\n\n. andra stycket")).toBe(
      "First paragraph.\n\nandra stycket"
    );
    // Should NOT remove period when followed by uppercase (normal sentence)
    expect(repairOrphanedLeadingPeriods(". A normal sentence")).toBe(". A normal sentence");
  });

  it("infers a book title from txt when metadata title is missing", async () => {
    const buffer = Buffer.from(
      `
Inget kan stoppa

Förord

Det här är inledningen.

Kapitel ett

Det här är första kapitlet.
`,
      "utf8"
    );

    const result = await extractFromTxt(buffer);
    expect(result.title).toBe("Inget kan stoppa");
  });

  describe("runExtract drops a title-only front matter chapter", () => {
    const dirs: string[] = [];

    afterAll(async () => {
      await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
    });

    async function extractTxt(body: string) {
      const dir = await mkdtemp(path.join(tmpdir(), "verkli-extract-"));
      dirs.push(dir);
      const file = path.join(dir, "manuscript.txt");
      await writeFile(file, body, "utf8");
      return runExtract(file);
    }

    // The shape a real .txt import produced on 2026-09-02: the title line became
    // both the book title and a chapter whose entire body was that same line, so
    // the author's first chapter was a page containing only the title and the
    // real chapter 1 was numbered 2.
    it("does not turn the title line into its own chapter", async () => {
      const result = await extractTxt(
        [
          "Den sista färjan",
          "",
          "Kapitel 1",
          "",
          "Regnet började precis när Mira nådde hamnen. Havet såg ut som mörkt glas.",
          "",
          "Den sista färjan skulle gå om tio minuter.",
        ].join("\n")
      );

      expect(result.title).toBe("Den sista färjan");
      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].title).toBe("Kapitel 1");
      expect(result.chapters[0].sourceText).toContain("Regnet började");
      // The line is gone as a chapter, not merely renamed.
      expect(
        result.chapters.some((c) => c.sourceText.trim() === "Den sista färjan")
      ).toBe(false);
    });

    // The guard is an exact match on purpose: prose that happens to open with
    // the title is the book, not a title page.
    it("keeps a chapter that only begins with the title", async () => {
      const result = await extractTxt(
        [
          "Den sista färjan",
          "",
          "Den sista färjan lämnade kajen klockan sju, och Mira var inte ombord.",
        ].join("\n")
      );

      expect(
        result.chapters.some((c) => c.sourceText.includes("lämnade kajen"))
      ).toBe(true);
    });

    // The common real shape: a title page is a title with credits under it, so
    // its text is never equal to the title. Probed against the real extractor
    // 2026-09-02 and it reproduced the junk chapter.
    it("drops a title page carrying a byline", async () => {
      const result = await extractTxt(
        [
          "Den sista färjan",
          "",
          "av Svea Hallinder",
          "",
          "Kapitel 1",
          "",
          "Regnet började precis när Mira nådde hamnen.",
          "",
          "Havet såg ut som mörkt glas.",
        ].join("\n")
      );

      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].title).toBe("Kapitel 1");
      expect(
        result.chapters.some((c) => c.sourceText.includes("Svea Hallinder"))
      ).toBe(false);
    });

    it("drops a title page carrying a name and a copyright line", async () => {
      const result = await extractTxt(
        [
          "Den sista färjan",
          "",
          "Svea Hallinder",
          "© 2026 Verkli",
          "",
          "Kapitel 1",
          "",
          "Regnet började precis när Mira nådde hamnen.",
        ].join("\n")
      );

      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].sourceText).toContain("Regnet började");
    });

    // The outer net: length. Whatever a long leading block looks like, it is
    // content, so it survives even when its first line is exactly the title.
    it("keeps a long leading chapter whose first line is the title", async () => {
      const prose =
        "Hon hade väntat på den här dagen i sjutton år, och nu när den äntligen kom kände hon ingenting alls, bara en tunn och likgiltig trötthet som låg över allting";
      const result = await extractTxt(
        ["Den sista färjan", "", prose, "", "Kapitel 1", "", "Regnet började."].join("\n")
      );

      expect(result.chapters.some((c) => c.sourceText.includes("sjutton år"))).toBe(
        true
      );
    });

    it("leaves a manuscript without a title page alone", async () => {
      const result = await extractTxt(
        [
          "Kapitel 1",
          "",
          "Det regnade den dagen också, men ingen tänkte på det.",
        ].join("\n")
      );

      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].sourceText).toContain("Det regnade");
    });
  });
});
