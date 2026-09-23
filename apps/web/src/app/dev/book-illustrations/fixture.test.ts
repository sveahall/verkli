import { describe, expect, it } from "vitest";
import { createIllustrationFixture } from "./fixture";
import type { IllustrationApproval } from "@/features/book-illustrations/contracts";
const request = (): IllustrationApproval => ({
  chapterId: "harbour", expectedChapterRevision: "1", expectedIllustrationRevision: null,
  profileId: "ink", expectedProfileRevision: "1", placement: "half-page", alt: "A small boat beside the harbour.",
  file: new File(["synthetic"], "harbour.png", { type: "image/png" }), width: 800, height: 600,
});
describe("illustration memory adapter", () => {
  it("approves only the requested chapter without changing text", async () => {
    const fixture = createIllustrationFixture();
    const before = fixture.adapter.snapshot();
    await fixture.adapter.approve(request());
    const after = fixture.adapter.snapshot();
    expect(after.chapters.map((chapter) => chapter.excerpt)).toEqual(before.chapters.map((chapter) => chapter.excerpt));
    expect(after.chapters[0].illustration?.alt).toBe(request().alt);
    expect(after.chapters[1].illustration).toBeNull();
  });
  it("rejects stale chapter, profile and prior illustration revisions", async () => {
    for (const field of ["expectedChapterRevision", "expectedProfileRevision", "expectedIllustrationRevision"] as const) {
      const fixture = createIllustrationFixture();
      await expect(fixture.adapter.approve({ ...request(), [field]: "old" })).rejects.toThrow("changed");
      expect(fixture.adapter.snapshot().chapters[0].illustration).toBeNull();
    }
  });
  it("keeps the original on failure and rejects an unknown chapter", async () => {
    const fixture = createIllustrationFixture();
    const original = await fixture.adapter.approve(request());
    fixture.setFailure(true);
    await expect(fixture.adapter.approve({ ...request(), expectedIllustrationRevision: original.revision, alt: "New image" })).rejects.toThrow("Synthetic");
    expect(fixture.adapter.snapshot().chapters[0].illustration).toEqual(original);
    fixture.setFailure(false);
    await expect(fixture.adapter.approve({ ...request(), chapterId: "other" })).rejects.toThrow("available");
  });
  it("rejects empty alternative text and never mutates through snapshots", async () => {
    const fixture = createIllustrationFixture();
    await expect(fixture.adapter.approve({ ...request(), alt: "   " })).rejects.toThrow("alternative text");
    fixture.adapter.snapshot().profiles[0].name = "Changed externally";
    expect(fixture.adapter.snapshot().profiles[0].name).toBe("Ink & sea");
  });
});
