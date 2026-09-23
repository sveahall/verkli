import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WholeBookAnalysisPanel from "./WholeBookAnalysisPanel";
import { bookId, versionId, fixtureChapters, fixtureReport } from "@/app/dev/book-analysis/fixture";
import { bookAnalysisReportSchema } from "@/lib/editorial/book-analysis-schema";

describe("whole-book analysis interface", () => {
  it("offers distinct whole-book work with no automatic manuscript edits", () => {
    const html = renderToStaticMarkup(<WholeBookAnalysisPanel bookId={bookId} versionId={versionId} chapters={fixtureChapters} saveBlocked={false} />);
    expect(html).toContain("Analyse whole book"); expect(html).toContain("3 chapters with text");
    expect(html).toContain("Your manuscript stays unchanged."); expect(html).toContain("editorial AI allowance");
    expect(html).not.toContain("Whole-book report"); expect(html).not.toContain("Apply change");
  });
  it("blocks new work while manuscript saving is conflicted", () => {
    const html = renderToStaticMarkup(<WholeBookAnalysisPanel bookId={bookId} versionId={versionId} chapters={fixtureChapters} saveBlocked />);
    expect(html).toContain("Finish saving or resolve the manuscript conflict");
    expect(html).toMatch(/disabled="">Analyse whole book/);
  });
  it("keeps controlled findings tied to distinct original chapters", () => {
    expect(bookAnalysisReportSchema.safeParse(fixtureReport).success).toBe(true);
    for (const finding of fixtureReport.findings) {
      expect(new Set(finding.evidence.map((item) => item.chapterId)).size).toBeGreaterThanOrEqual(2);
      for (const citation of finding.evidence) expect(fixtureChapters.find((chapter) => chapter.id === citation.chapterId)?.content).toContain(citation.quote);
    }
    expect(fixtureReport.findings.map((finding) => finding.category)).toEqual(["timeline", "characters", "perspective"]);
  });
});
