import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  extractFromHtml,
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

  it("splits a heading-less manuscript into chapters instead of one giant chapter", async () => {
    // Manuscripts styled with bold/manual formatting instead of Word Heading
    // styles come out of mammoth as a flat run of <p> with no <h1>-<h3> at all.
    const ordinals = ["ett", "två", "tre", "fyra"];
    const body = ordinals
      .map(
        (ordinal) =>
          `<p>Kapitel ${ordinal}</p><p>${"Det här är brödtext i kapitlet. ".repeat(40)}</p>`
      )
      .join("");
    const buffer = Buffer.from(
      `<html><body><p>Inget kan stoppa</p>${body}</body></html>`,
      "utf8"
    );

    const result = await extractFromHtml(buffer);

    expect(result.chapters.length).toBeGreaterThan(1);
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(
      expect.arrayContaining(ordinals.map((ordinal) => `Kapitel ${ordinal}`))
    );
  });

  it("keeps rich formatting when splitting a heading-less manuscript", async () => {
    const buffer = Buffer.from(
      `<html><body><p>Kapitel ett</p><p>Han sa <strong>aldrig</strong> ett ord.</p>` +
        `<p>Kapitel två</p><p>Sedan gick <em>allt</em> fel.</p></body></html>`,
      "utf8"
    );

    const result = await extractFromHtml(buffer);

    expect(result.chapters).toHaveLength(2);
    // Block-level detection exists so the rich path stays in play; a plain-text
    // fallback would have dropped every mark.
    expect(result.chapters.every((chapter) => chapter.tiptapContent)).toBe(true);
    expect(JSON.stringify(result.chapters[0].tiptapContent)).toContain("bold");
    expect(JSON.stringify(result.chapters[1].tiptapContent)).toContain("italic");
  });

  it("opens a chapter on a heading that has body text run into it", async () => {
    const buffer = Buffer.from(
      `<html><body><p>Kapitel ett</p><p>Slutet på första kapitlet.</p>` +
        `<p>Kapitel två</p><p>Slutet på andra kapitlet.</p>` +
        `<p>Kapitel tre</p><p>Slutet på tredje kapitlet.</p>` +
        `<p>Kapitel fyragjorde för andra elever. Eftersom ingen sa att ”så kan det vara”, gav</p>` +
        `<p>han upp till slut.</p></body></html>`,
      "utf8"
    );

    const result = await extractFromHtml(buffer);

    expect(result.chapters.map((chapter) => chapter.title)).toEqual([
      "Kapitel ett",
      "Kapitel två",
      "Kapitel tre",
      "Kapitel fyra",
    ]);
    // The damaged heading carries real prose, so the block has to stay.
    expect(result.chapters[3].sourceText).toContain("gjorde för andra elever");
  });

  it("opens a chapter on a bare heading whose ordinal slipped into the next block", async () => {
    const buffer = Buffer.from(
      `<html><body><p>Kapitel ett</p><p>Första kapitlet.</p>` +
        `<p>Kapitel två</p><p>Andra kapitlet.</p>` +
        `<p>Kapitel tre</p><p>Tredje kapitlet.</p>` +
        `<p>Kapitel</p><p>fyra</p><p>Fjärde kapitlet.</p></body></html>`,
      "utf8"
    );

    const result = await extractFromHtml(buffer);

    expect(result.chapters).toHaveLength(4);
    expect(result.chapters[3].sourceText).toContain("Fjärde kapitlet.");
  });

  it("does not break a chapter on prose that merely starts with a chapter word", async () => {
    // Only one intact heading, so heading repair stays off and the prose
    // paragraph below is read as prose, not as a chapter opening.
    const buffer = Buffer.from(
      `<html><body><p>Kapitel ett</p>` +
        `<p>Kapitel tre var det svåraste jag skrivit. Jag satt i månader med det.</p>` +
        `<p>Sedan blev det ändå bra.</p></body></html>`,
      "utf8"
    );

    const result = await extractFromHtml(buffer);

    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].sourceText).toContain("det svåraste jag skrivit");
  });

  it("keeps a long single-chapter document as one chapter", async () => {
    const buffer = Buffer.from(
      `<html><body><h1>En novell</h1><p>${"Det här är en lång novell. ".repeat(1200)}</p></body></html>`,
      "utf8"
    );

    const result = await extractFromHtml(buffer);

    expect(result.chapters).toHaveLength(1);
  });

  describe("runExtract drops a title-only front matter chapter", () => {
    const dirs: string[] = [];

    afterAll(async () => {
      await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
    });

    async function extractFile(body: string, ext: ".txt" | ".html") {
      const dir = await mkdtemp(path.join(tmpdir(), "verkli-extract-"));
      dirs.push(dir);
      const file = path.join(dir, `manuscript${ext}`);
      await writeFile(file, body, "utf8");
      return runExtract(file);
    }

    const extractTxt = (body: string) => extractFile(body, ".txt");

    // A publisher's title page is too long for dropTitleOnlyFrontMatter to
    // remove, so it survives as chapter 1. Before, it reached the author
    // labelled "Untitled", which reads like the import failed.
    it("names a surviving title page instead of leaving it Untitled", async () => {
      const colophon =
        "Ekerlids Förlag, Gamla Brogatan 26, 113 90 Stockholm. " +
        "Tredje tryckning. © Författaren och Ekerlids Förlag. " +
        "Omslag: Thomas Jansson. Omslagsbild: Simon Cederquist. " +
        "Grafisk form: Anna Linden. Tryckt hos Fälth & Hässler, oktober 1999. ISBN 91-88595-19-6.";
      expect(colophon.length).toBeGreaterThan(200);

      const result = await extractFile(
        `<html><body><p>Inget kan stoppa</p><p>${colophon}</p>` +
          `<p>Kapitel ett</p><p>Första kapitlet.</p>` +
          `<p>Kapitel två</p><p>Andra kapitlet.</p></body></html>`,
        ".html"
      );

      expect(result.chapters[0].title).toBe("Titelsida");
      expect(result.chapters[0].sourceText).toContain("ISBN 91-88595-19-6");
    });

    it("leaves a leading block alone when it does not open with the book title", async () => {
      const result = await extractFile(
        `<html><body><p>Det här är en riktig inledning som inte är en titelsida alls. ` +
          `Den handlar om hur boken kom till och är skriven av författaren själv. ` +
          `Den är lång nog att överleva, och den öppnar inte med bokens titel.</p>` +
          `<p>Kapitel ett</p><p>Första kapitlet.</p></body></html>`,
        ".html"
      );

      expect(result.chapters[0].title).not.toBe("Titelsida");
    });

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

    // The regression that matters most. An earlier version of this fix tested
    // only the chapter body, and deleted this entire chapter — the body happens
    // to look like a title page, and "Nightfall" is what the title inference
    // picks. A chapter with a heading of its own is a chapter, whatever it
    // holds. Found in review 2026-09-02, before it reached an author.
    it("never drops a chapter that has a heading of its own", async () => {
      const result = await extractTxt(
        [
          "Kapitel 1",
          "",
          "Nightfall",
          "",
          "Mara ran",
          "",
          "Kapitel 2",
          "",
          "At dawn, she returned.",
        ].join("\n")
      );

      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0].title).toBe("Kapitel 1");
      expect(result.chapters[0].sourceText).toContain("Mara ran");
    });

    // An author's own introduction canonicalizes to the same "Inledning" label
    // the splitter invents, so it can only be told apart by its content.
    it("keeps a real introduction chapter", async () => {
      const result = await extractTxt(
        [
          "Den sista färjan",
          "",
          "Inledning",
          "",
          "Den här boken handlar om havet, om väntan och om allt det som aldrig blev sagt.",
          "",
          "Kapitel 1",
          "",
          "Regnet började.",
        ].join("\n")
      );

      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0].title).toBe("Inledning");
      expect(result.chapters[0].sourceText).toContain("handlar om havet");
    });

    // Semantic HTML and DOCX put the title in the chapter's heading rather than
    // its body, so the body-only test missed these entirely.
    it("drops an html title page whose heading is the book title", async () => {
      const result = await extractFile(
        "<h1>Nightfall</h1><p>by Ada Author</p><h1>Chapter 1</h1>" +
          "<p>Mara ran through the rain and did not look back at all.</p>",
        ".html"
      );

      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].title).toBe("Chapter 1");
      expect(result.chapters.some((c) => c.sourceText.includes("Ada Author"))).toBe(
        false
      );
    });

    // Second data-loss regression, found in review the same day. Testing only
    // that every line was "short and unpunctuated" deleted terse and poetic
    // prose, which is indistinguishable from a name by length. Both of these
    // lost their first chapter before an explicit credit marker was required.
    it("keeps a short poetic first chapter whose heading is the book title", async () => {
      const result = await extractFile(
        "<title>Nightfall</title><h1>Nightfall</h1><p>Mara ran</p>" +
          "<p>The bells followed her</p><h1>Chapter 2</h1><p>At dawn.</p>",
        ".html"
      );

      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0].sourceText).toContain("Mara ran");
    });

    it("keeps a short poetic prologue that has no heading", async () => {
      const result = await extractTxt(
        [
          "Nightfall",
          "",
          "Mara ran",
          "",
          "The bells followed her through the dark",
          "",
          "Kapitel 2",
          "",
          "At dawn.",
        ].join("\n")
      );

      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0].sourceText).toContain("Mara ran");
    });

    // A decision, not an oversight: a title page carrying only a bare name is
    // kept, because a bare name cannot be told from terse prose. A redundant
    // page costs the author one click; a deleted chapter costs them writing.
    it("keeps a title page that carries only a bare name", async () => {
      const result = await extractTxt(
        [
          "Den sista färjan",
          "",
          "Svea Hallinder",
          "",
          "Kapitel 1",
          "",
          "Regnet började precis.",
          "",
          "Kapitel 2",
          "",
          "Slut.",
        ].join("\n")
      );

      expect(result.chapters.some((c) => c.sourceText.includes("Svea Hallinder"))).toBe(
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
