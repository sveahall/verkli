"use client";

import { useEffect, useRef, useState } from "react";
import { getLanguageLabel } from "@/lib/languages";
import type { SavedTranslationQuality } from "@/lib/translation-quality-report";
import { QualityFindings } from "./TranslationQualityCard";

type Chapter = { id: string; title: string | null; order: number | null; text: string };
type Edition = { id: string; language_code: string; status: string; chapters: Chapter[] };
export type SavedComparison = { source: Edition; target: Edition | null; fingerprints?: { source: string; target: string; chapters: Array<{ sourceChapterId: string; source: string; target: string }> } };

// The storage contract pairs translations by chapter order. Never guess when an
// order is missing/duplicated, or hide target-only chapters after an author edit.
export function pairSavedChapters(source: Chapter[], target: Chapter[]) {
  const used = new Set<string>();
  const pairs: Array<{ source: Chapter | null; target: Chapter | null }> = source.map((chapter) => {
    const matches = chapter.order === null ? [] : target.filter((item) => item.order === chapter.order);
    const match = matches.length === 1 && source.filter((item) => item.order === chapter.order).length === 1 ? matches[0] : null;
    if (match) used.add(match.id);
    return { source: chapter, target: match };
  });
  return [...pairs, ...target.filter((chapter) => !used.has(chapter.id)).map((chapter) => ({ source: null, target: chapter }))];
}

export function savedReportMatchesText(data: SavedComparison, job: SavedTranslationQuality): boolean | null {
  const output = job.output;
  if (!output || !data.fingerprints || !output.targetHash) return null;
  if (output.sourceVersionId !== data.source.id || output.targetVersionId !== data.target?.id) return false;
  const hashes = output.scope === "book" ? data.fingerprints : data.fingerprints.chapters.find((chapter) => chapter.sourceChapterId === output.batches[0]?.chapterId);
  return !!hashes && output.sourceHash === hashes.source && output.targetHash === hashes.target;
}

export function SavedComparisonText({ data }: { data: SavedComparison }) {
  const [selected, setSelected] = useState(0);
  if (!data.target) return <p role="status">No saved translation for this language yet. Opening this view has not started a translation.</p>;
  const pairs = pairSavedChapters(data.source.chapters, data.target.chapters);
  const pair = pairs[selected] ?? pairs[0];
  return <div className="space-y-5">
    <div className="text-xs text-muted-foreground"><p>Source edition: {data.source.id}</p><p>Saved {getLanguageLabel(data.target.language_code)} edition: {data.target.id}</p></div>
    {data.target.status === "translating" && <p role="status">A translation is running. This view shows only text already saved. Refresh after it finishes.</p>}
    {data.target.chapters.length === 0 && <p role="status">This edition has no saved chapters yet.</p>}
    {pair && <>
      <label className="block text-sm font-medium">Chapter comparison
        <select className="mt-2 block min-h-11 w-full rounded-xl border border-border bg-background px-3" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
          {pairs.map((item, index) => <option key={index} value={index}>{index + 1}. {item.source?.title || item.target?.title || "Untitled chapter"}{!item.source ? " · translation only" : !item.target ? " · no matching translation" : ""}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Chapters are matched by saved position. If chapters were moved or removed, check their titles and meaning. This is current saved text; unsaved editor changes are not included.</p>
      <div className="grid gap-6 md:grid-cols-2">
        {[{ chapter: pair.source, language: data.source.language_code, label: "Current saved original", missing: "No matching original at this position." }, { chapter: pair.target, language: data.target.language_code, label: "Current saved translation", missing: "No matching translation at this position." }].map(({ chapter, language, label, missing }) => <div key={label} className="min-w-0 rounded-xl border border-border p-4">
          <h4 className="text-sm font-medium">{label} · {getLanguageLabel(language)}</h4>
          <p className="mt-2 text-xs text-muted-foreground">{chapter?.title}</p>
          <p dir="auto" lang={language} className="mt-4 whitespace-pre-wrap break-words font-serif text-lg leading-8">{chapter ? chapter.text || "This chapter has no saved text." : missing}</p>
        </div>)}
      </div>
    </>}
  </div>;
}

export async function savedTranslationError(response: Response): Promise<string> {
  if (response.status === 401) return "Your session expired. Sign in again to open the saved translation.";
  if ([400, 404, 422].includes(response.status)) {
    const body = await response.json().catch(() => null);
    if (typeof body?.error === "string" && body.error.trim() && body.error.length <= 500) return body.error;
  }
  return "Could not load the saved translation. Try again. Your manuscript has not changed.";
}

export default function SavedTranslationComparison({ bookId, sourceVersionId, targetLanguage, request = fetch }: { bookId: string; sourceVersionId: string | null; targetLanguage: string; request?: typeof fetch }) {
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<SavedComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<SavedTranslationQuality[]>([]);
  const [reportError, setReportError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function load() {
    if (!sourceVersionId) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setOpened(true); setBusy(true); setData(null); setError(null); setReports([]); setReportError(false);
    const query = new URLSearchParams({ sourceVersionId, targetLanguage });
    try {
      const response = await request(`/api/books/${bookId}/saved-translation?${query}`, { signal: abort.signal, cache: "no-store" });
      if (!response.ok) throw new Error(await savedTranslationError(response));
      const saved: SavedComparison = await response.json();
      if (abort.signal.aborted) return;
      setData(saved);
      if (saved.target) {
        try {
          const result = await request(`/api/books/${bookId}/translation-quality?scope=book&${query}`, { signal: abort.signal, cache: "no-store" });
          if (!result.ok) throw new Error("Reports unavailable");
          const body = await result.json();
          if (!abort.signal.aborted) setReports((body.jobs ?? []).filter((job: SavedTranslationQuality) => job.output?.formatVersion === 1 && job.output.sourceVersionId === sourceVersionId && job.output.targetVersionId === saved.target?.id && ["book", "chapter"].includes(job.output.scope)));
        } catch { if (!abort.signal.aborted) setReportError(true); }
      }
    } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the saved translation. Try again."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }

  return <section aria-labelledby="saved-translation-title" className="space-y-5 rounded-2xl border border-border bg-card p-6 lg:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h3 id="saved-translation-title" className="text-xl font-medium">Read your saved translation</h3><p className="mt-2 text-sm text-muted-foreground">Compare {getLanguageLabel(targetLanguage)} with your original. No new translation or charge.</p></div>
      <button type="button" disabled={!sourceVersionId || busy} onClick={() => void load()} className="min-h-11 rounded-full border border-border px-5 py-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-60">{busy ? "Loading saved translation…" : opened ? "Refresh saved translation" : "Open saved translation"}</button>
    </div>
    {!sourceVersionId && <p className="text-sm text-muted-foreground">Select a source manuscript edition first.</p>}
    <div aria-live="polite" aria-busy={busy} className="space-y-5">
      {busy && <p role="status">Loading current saved text and review history…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data && <SavedComparisonText data={data} />}
      {data?.target && !busy && <div className="space-y-4 border-t border-border pt-5">
        <h4 className="text-sm font-medium">Saved review findings for this edition</h4>
        <p className="text-xs text-muted-foreground">The latest available reports (up to 10) are historical snapshots, not a human literary sign-off. Findings may refer to text that has since changed. A chapter report does not certify the whole book.</p>
        {reportError ? <p role="alert">The saved text loaded, but its reports could not be loaded. Refresh saved translation to retry.</p> : reports.length === 0 ? <p>No saved review found for these editions. This does not mean the translation passed review.</p> : reports.map((job) => <details key={job.id} className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm">{job.output?.scope === "chapter" ? "Chapter" : "Book"} report · {savedReportMatchesText(data, job) === false ? "Text changed since review" : savedReportMatchesText(data, job) === null ? "Freshness not verified" : "Displayed text matches review"} · {new Date(job.createdAt).toLocaleDateString()}</summary>
          <p className="my-3 text-sm">{job.trusted !== true ? "Review provenance could not be verified. " : ""}Saved outcome: {job.output?.status.replaceAll("_", " ")}. {job.output?.error}</p>
          {job.output?.batches.map((batch, index) => <details key={index} className="mt-4 border-t border-border pt-4"><summary className="mb-3 cursor-pointer text-sm">{batch.chapterTitle} · Part {batch.batchIndex + 1} · Historical findings</summary><QualityFindings report={batch.report} /></details>)}
        </details>)}
      </div>}
    </div>
  </section>;
}
