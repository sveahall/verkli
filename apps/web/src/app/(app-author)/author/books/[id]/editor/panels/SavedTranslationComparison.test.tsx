import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SavedTranslationQuality } from "@/lib/translation-quality-report";
import { pairSavedChapters, savedTranslationError, SavedComparisonText, savedReportMatchesText, type SavedComparison } from "./SavedTranslationComparison";
const chapter = (id: string, order: number | null) => ({ id, title: id, order, text: `<script>${id}</script>` });
const data: SavedComparison = { source: { id: "source", language_code: "en", status: "done", chapters: [chapter("original", 0)] }, target: { id: "target", language_code: "ar", status: "done", chapters: [chapter("translation", 0)] }, fingerprints: { source: "s", target: "t", chapters: [{ sourceChapterId: "original", source: "cs", target: "ct" }] } };

describe("saved comparison", () => {
  it.each([400, 404, 422])("keeps controlled status %s guidance visible", async (status) => {
    const message = "This book is too large for the comparison view. Open its chapters in Write.";
    expect(await savedTranslationError(Response.json({ error: message }, { status }))).toBe(message);
  });
  it("does not show untrusted server details or malformed errors", async () => {
    expect(await savedTranslationError(Response.json({ error: "internal secret" }, { status: 503 }))).not.toContain("internal secret");
    expect(await savedTranslationError(new Response("malformed", { status: 422 }))).toContain("Try again");
    expect(await savedTranslationError(Response.json({}, { status: 401 }))).toContain("session expired");
  });
  it("matches by position rather than array index and retains target-only chapters", () => {
    const pairs = pairSavedChapters([chapter("s0", 0), chapter("s2", 2)], [chapter("t2", 2), chapter("t3", 3)]);
    expect(pairs.map((pair) => [pair.source?.id, pair.target?.id])).toEqual([["s0", undefined], ["s2", "t2"], [undefined, "t3"]]);
  });
  it.each([null, 0])("does not guess when chapter positions are ambiguous: %s", (order) => {
    expect(pairSavedChapters([chapter("s1", order), chapter("s2", order)], [chapter("t1", order)])).toHaveLength(3);
  });
  it("labels exact editions and current text, preserves RTL and escapes manuscript HTML", () => {
    const html = renderToStaticMarkup(<SavedComparisonText data={data} />);
    expect(html).toContain("Source edition: source"); expect(html).toContain("Arabic edition: target");
    expect(html).toContain("Current saved original"); expect(html).toContain("unsaved editor changes are not included");
    expect(html).toContain('dir="auto" lang="ar"'); expect(html).toContain("&lt;script&gt;translation&lt;/script&gt;");
  });
  it("distinguishes a missing edition from an empty saved edition", () => {
    expect(renderToStaticMarkup(<SavedComparisonText data={{ ...data, target: null }} />)).toContain("No saved translation for this language yet");
    expect(renderToStaticMarkup(<SavedComparisonText data={{ ...data, target: { ...data.target!, chapters: [] } }} />)).toContain("This edition has no saved chapters yet");
  });
  it("checks report freshness against the displayed snapshot, not a later database read", () => {
    const job = { output: { scope: "book", sourceVersionId: "source", targetVersionId: "target", sourceHash: "s", targetHash: "t" }, stale: false } as SavedTranslationQuality;
    expect(savedReportMatchesText(data, job)).toBe(true);
    expect(savedReportMatchesText(data, { ...job, output: { ...job.output!, targetHash: "later-text" } })).toBe(false);
    expect(savedReportMatchesText(data, { ...job, output: { ...job.output!, targetVersionId: "other" } })).toBe(false);
    expect(savedReportMatchesText({ ...data, fingerprints: undefined }, job)).toBeNull();
  });
  it("does not use a chapter's report to certify the whole edition", () => {
    const job = { output: { scope: "chapter", sourceVersionId: "source", targetVersionId: "target", sourceHash: "cs", targetHash: "ct", batches: [{ chapterId: "original" }] } } as SavedTranslationQuality;
    expect(savedReportMatchesText(data, job)).toBe(true);
    expect(savedReportMatchesText(data, { ...job, output: { ...job.output!, scope: "book" } })).toBe(false);
  });
});
