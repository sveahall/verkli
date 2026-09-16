"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, LoaderCircle, MessageSquareText, ShieldCheck } from "lucide-react";
import type { QualityReport } from "@/lib/ai/translation-quality/types";
import type { SavedTranslationQuality } from "@/lib/translation-quality-report";
import { getLanguageLabel } from "@/lib/languages";

type Sample = { originalText: string; translatedText: string; report: QualityReport };

export function QualityFindings({ report }: { report: QualityReport }) {
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <span className="rounded-full border border-border bg-muted px-3 py-1.5 text-sm font-medium">
        {report.status === "needs_review" ? "Needs your attention" : "Automated checks passed"}
      </span>
      <span className="text-xs text-muted-foreground">{report.revisionCount === 1 ? "One correction round completed" : "No correction round needed"}</span>
    </div>
    <p className="text-sm leading-relaxed text-muted-foreground">
      {report.status === "needs_review" ? "Substantive issues remain after correction. Review the passages below before using this translation." : "The reviewers found no remaining major issues. Read the result in context before publishing."}
    </p>
    <details className="group rounded-xl border border-border p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">The voice we are preserving <ChevronDown size={16} className="transition-transform group-open:rotate-180" /></summary>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        {[["Voice", report.profile.voice], ["Rhythm", report.profile.rhythm], ["Dialogue", report.profile.dialogue]].map(([label, value]) => <div key={label}><dt className="font-medium">{label}</dt><dd className="mt-1 leading-relaxed text-muted-foreground">{value}</dd></div>)}
        <div><dt className="font-medium">Keep intact</dt><dd className="mt-1 text-muted-foreground">{report.profile.preserve.join(" · ") || "No additional constraints identified in this sample."}</dd></div>
      </dl>
      {report.profile.glossary.length > 0 && <ul className="mt-4 space-y-1 border-t border-border pt-4 text-sm">{report.profile.glossary.map((term, i) => <li key={i}>{term.source} <span className="text-muted-foreground">→ {term.target}</span></li>)}</ul>}
    </details>
    {report.issues.length > 0 ? <ul className="space-y-3">{report.issues.map((issue, index) => <li key={index} className="rounded-xl border border-border p-4">
      <div className="mb-3 flex flex-wrap gap-2 text-xs font-medium"><span>{issue.reviewer === "fidelity" ? "Meaning & accuracy" : "Author voice & style"}</span><span className="text-muted-foreground">· {issue.severity} · passage {issue.segment + 1}</span></div>
      <div className="grid gap-3 sm:grid-cols-2"><blockquote className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed"><span className="mb-1 block text-xs text-muted-foreground">Original</span>{issue.sourceQuote}</blockquote><blockquote className="border-l-2 border-border pl-3 text-sm leading-relaxed"><span className="mb-1 block text-xs text-muted-foreground">Translation</span>{issue.targetQuote}</blockquote></div>
      <p className="mt-4 text-sm leading-relaxed">{issue.explanation}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{issue.suggestion}</p>
    </li>)}</ul> : <p className="flex items-center gap-2 text-sm"><Check size={16} aria-hidden="true" /> No remaining issues reported by either reviewer.</p>}
    <p className="text-xs leading-relaxed text-muted-foreground">Separate meaning and style reviews · {report.model} · Rubric {report.rubricVersion}. Both reviewers currently use the same model. Automated checks are not a human editorial sign-off.</p>
  </div>;
}

export default function TranslationQualityCard({ bookId, sourceVersionId, targetLanguage, request = fetch }: { bookId: string; sourceVersionId: string | null; targetLanguage: string; request?: typeof fetch }) {
  const [guidance, setGuidance] = useState("");
  const [sample, setSample] = useState<Sample | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<SavedTranslationQuality[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(Boolean(sourceVersionId));
  const [historyRevision, setHistoryRevision] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const endpoint = `/api/books/${bookId}/translation-quality`;

  const refreshReports = useCallback(() => {
    controller.current?.abort();
    setBusy(false); setSample(null); setError(null);
    setHistoryLoading(true);
    setHistoryRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    function onTranslationUpdated(event: Event) {
      const detail = (event as CustomEvent<{ bookId?: string; targetLanguage?: string }>).detail;
      if (detail?.bookId === bookId && detail.targetLanguage === targetLanguage) refreshReports();
    }
    window.addEventListener("translation-quality-updated", onTranslationUpdated);
    return () => window.removeEventListener("translation-quality-updated", onTranslationUpdated);
  }, [bookId, targetLanguage, refreshReports]);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const res = await request(`${endpoint}?scope=book&targetLanguage=${encodeURIComponent(targetLanguage)}&sourceVersionId=${encodeURIComponent(sourceVersionId ?? "")}`, { signal: abort.signal, cache: "no-store" });
        if (!res.ok) throw new Error("History unavailable");
        const body = await res.json();
        if (!abort.signal.aborted) { setJobs(body.jobs ?? []); setHistoryError(false); }
      } catch { if (!abort.signal.aborted) setHistoryError(true); }
      finally { if (!abort.signal.aborted) setHistoryLoading(false); }
    }
    if (sourceVersionId) void load();
    return () => abort.abort();
  }, [endpoint, sourceVersionId, targetLanguage, request, historyRevision]);

  async function reviewSample() {
    if (!sourceVersionId || busy) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setSample(null); setError(null);
    try {
      const res = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceVersionId, targetLanguage, authorGuidance: guidance }), signal: abort.signal });
      const body = await res.json();
      if (abort.signal.aborted) return;
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not complete the review.");
      setSample(body);
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not complete the review. Try again.");
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }

  const bookJobs = jobs.filter((job) => job.output?.formatVersion === 1 && (job.output.scope === "book" || job.output.scope === "chapter") && Array.isArray(job.output.batches));
  return <section aria-labelledby="translation-quality-title" className="overflow-hidden rounded-2xl border border-border bg-card text-foreground">
    <div className="grid gap-8 p-6 lg:grid-cols-[1fr_1.3fr] lg:p-8">
      <div>
        <ShieldCheck className="mb-5 text-primary" size={26} strokeWidth={1.5} aria-hidden="true" />
        <h3 id="translation-quality-title" className="text-2xl font-medium tracking-tight">Your words. Still yours.</h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Try a reviewed translation into {getLanguageLabel(targetLanguage)}. One reviewer checks meaning against your original. Another checks voice, rhythm and unwanted rewriting.</p>
        <ol className="mt-6 space-y-3 text-sm">{["Translate with your voice in mind", "Check meaning and author style", "Correct once, then check again"].map((label, index) => <li key={label} className="flex items-center gap-3"><span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{index + 1}</span>{label}</li>)}</ol>
      </div>
      <div className="flex flex-col justify-center">
        <label htmlFor="translation-voice-guidance" className="text-sm font-medium">What should we preserve? <span className="font-normal text-muted-foreground">Optional</span></label>
        <textarea id="translation-voice-guidance" value={guidance} disabled={busy} maxLength={2000} onChange={(event) => { setGuidance(event.target.value); setSample(null); }} placeholder="For example: keep the short sentences and intentional repetition. Leave character names unchanged." className="mt-3 min-h-28 w-full resize-y rounded-xl border border-border bg-background p-4 text-base sm:text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">This guidance applies to the sample only. Book jobs infer a shared profile from your manuscript.</p>
        <button type="button" onClick={() => void reviewSample()} disabled={busy || !sourceVersionId} className="mt-5 flex w-fit items-center gap-3 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={16} /> : <MessageSquareText size={16} />} {busy ? "Translating & reviewing…" : "Review a sample"} {!busy && <ArrowRight size={16} />}</button>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{!sourceVersionId ? "Select a manuscript version to begin." : "Reviews up to 4,000 characters from your saved manuscript. This can take a couple of minutes. A sample result does not certify the whole book."}</p>
      </div>
    </div>
    <div aria-live="polite" aria-busy={busy}>
      {error && <p role="alert" className="mx-6 mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {busy && <p className="border-t border-border p-6 text-sm text-muted-foreground">The reviewers compare the translation with your source. If a correction is needed, both reviewers check it again before you see the result.</p>}
      {sample && <div className="space-y-6 border-t border-border p-6 lg:p-8"><p className="text-xs leading-relaxed text-muted-foreground">This sample is a snapshot of your saved manuscript when the review started. Later edits are not included. Save your changes and request a new sample to review them.</p><QualityFindings report={sample.report} /><div className="grid gap-6 border-t border-border pt-6 md:grid-cols-2"><div><h4 className="mb-3 text-sm font-medium">Original sample</h4><p className="whitespace-pre-wrap font-serif text-lg leading-8">{sample.originalText}</p></div><div><h4 className="mb-3 text-sm font-medium">Reviewed translation</h4><p className="whitespace-pre-wrap font-serif text-lg leading-8">{sample.translatedText}</p></div></div></div>}
    </div>
    <div className="border-t border-border px-6 py-5 lg:px-8" aria-busy={historyLoading}><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-medium">Saved book reviews</h4><button type="button" onClick={refreshReports} disabled={historyLoading || busy || !sourceVersionId} className="min-h-11 rounded-full border border-border px-4 py-2 text-xs font-medium transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60">{historyLoading ? "Refreshing reports…" : "Refresh reports"}</button></div><p className="mt-2 text-xs text-muted-foreground">{historyLoading ? "Loading the latest saved reports…" : historyError ? "Could not load saved reports. Use Refresh reports to try again." : bookJobs.length === 0 ? "No book review yet for this language and source version. Older translations have not been retroactively reviewed." : "Reports describe the manuscript at the time of translation. Later edits require a new review."}</p>{bookJobs.map((job) => <details key={job.id} className="mt-4 rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm">{job.output?.scope === "chapter" ? "Chapter" : "Book"} review · {job.stale ? "text changed — review outdated" : job.stale === null && job.output?.targetHash ? "freshness could not be verified" : job.output?.status.replaceAll("_", " ")} · {new Date(job.createdAt).toLocaleDateString()}</summary><p className="mt-3 text-sm text-muted-foreground">{job.output?.error}</p>{job.output?.batches.map((batch, i) => <details key={i} className="mt-4 border-t border-border pt-4"><summary className="mb-3 cursor-pointer text-sm font-medium">{batch.chapterTitle} · Part {batch.batchIndex + 1}</summary><QualityFindings report={batch.report} /></details>)}</details>)}</div>
  </section>;
}
