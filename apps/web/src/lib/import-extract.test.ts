import { describe, expect, it } from "vitest";
import {
  extractFromTxt,
  repairImportedChapterTitles,
  splitIntoChaptersHeuristic,
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
});
