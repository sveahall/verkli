import { describe, expect, it } from "vitest";
import { splitIntoChaptersHeuristic } from "@/lib/import-extract";

describe("splitIntoChaptersHeuristic", () => {
  it("preserves intro and splits chapter headings", () => {
    const text = [
      "This is the opening text before explicit chapters.",
      "",
      "Chapter 1",
      "First chapter body line.",
      "",
      "Chapter 2",
      "Second chapter body line.",
    ].join("\n");

    const chapters = splitIntoChaptersHeuristic(text);

    expect(chapters).toHaveLength(3);
    expect(chapters[0].title).toBe("Introduction");
    expect(chapters[1].title).toBe("Chapter 1");
    expect(chapters[2].title).toBe("Chapter 2");
  });

  it("supports swedish chapter headings", () => {
    const text = [
      "Kapitel 1",
      "Detta ar en testtext i forsta kapitlet.",
      "",
      "Kapitel 2",
      "Detta ar text for andra kapitlet.",
    ].join("\n");

    const chapters = splitIntoChaptersHeuristic(text);

    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe("Kapitel 1");
    expect(chapters[1].title).toBe("Kapitel 2");
  });

  it("supports chapter headings with written numbers", () => {
    const text = [
      "Kapitel tjugosex",
      "Detta ar kapitel tjugosex.",
      "",
      "Kapitel tjugosju",
      "Detta ar kapitel tjugosju.",
    ].join("\n");

    const chapters = splitIntoChaptersHeuristic(text);

    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe("Kapitel tjugosex");
    expect(chapters[1].title).toBe("Kapitel tjugosju");
  });

  it("separates front matter sections before chapter headings", () => {
    const text = [
      "Min boktitel",
      "",
      "Förord",
      "Tack till alla som hjalpt.",
      "",
      "Innehåll",
      "Kapitel 1 8",
      "Kapitel 2 16",
      "",
      "Kapitel 1",
      "Riktig kapiteltext startar har.",
    ].join("\n");

    const chapters = splitIntoChaptersHeuristic(text);

    expect(chapters.length).toBeGreaterThanOrEqual(3);
    expect(chapters[0].title).toBe("Introduction");
    expect(chapters.some((chapter) => chapter.title === "Förord")).toBe(true);
    expect(chapters.some((chapter) => chapter.title === "Innehållsförteckning")).toBe(true);
  });

  it("chunks long text when no headings are present", () => {
    const paragraph = `${"Long paragraph text ".repeat(90).trim()}.`;
    const text = Array.from({ length: 140 }, (_, index) => `${index + 1}. ${paragraph}`).join("\n\n");

    const chapters = splitIntoChaptersHeuristic(text);

    expect(chapters.length).toBeGreaterThan(1);
    expect(chapters[0].title).toBe("Chapter 1");
    expect(chapters.every((chapter) => chapter.sourceText.trim().length > 0)).toBe(true);
    expect(Math.max(...chapters.map((chapter) => chapter.sourceText.length))).toBeLessThan(20_000);
  });
});
