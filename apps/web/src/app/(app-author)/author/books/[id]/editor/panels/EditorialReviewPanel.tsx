"use client";

import { useEffect, useRef, useState } from "react";
import { applyCorrection, reviewText } from "@/lib/editorial/content";
import type { ReviewMode, ReviewResult } from "@/lib/editorial/review-schema";

type Chapter = { id: string; title: string; content: string | null; book_version_id: string };
export type ApplyReview = (chapterId: string, expectedContent: string | null, nextContent: Record<string, unknown> | string) => Promise<string>;
type Props = {
  bookId: string;
  chapters: Chapter[];
  activeVersionId: string | null;
  bookVersions: { id: string; language_code: string }[];
  onApplyReview: ApplyReview;
  saveBlocked: boolean;
};
type Decision = "accepted" | "rejected";
const buttonClass = "min-h-11 rounded-lg border border-border px-3 py-2 text-base sm:text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-muted";
const keyFor = (result: ReviewResult) => `${result.chapterId}:${result.part}`;

export default function EditorialReviewPanel({ bookId, chapters, activeVersionId, bookVersions, onApplyReview, saveBlocked }: Props) {
  const available = chapters.filter((chapter) => !activeVersionId || chapter.book_version_id === activeVersionId);
  const nonempty = available.filter((chapter) => reviewText(chapter.content).trim());
  const [mode, setMode] = useState<ReviewMode>("proofread");
  const [chapterId, setChapterId] = useState(nonempty[0]?.id ?? "");
  const selectedChapterId = nonempty.some((chapter) => chapter.id === chapterId) ? chapterId : nonempty[0]?.id ?? "";
  const [sourceVersionId, setSourceVersionId] = useState(bookVersions.find((version) => version.id !== activeVersionId)?.id ?? "");
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ chapterId: string; before: string; after: string; decisionKey: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const expected = useRef(new Map<string, string | null>());
  useEffect(() => () => controller.current?.abort(), []);

  async function run(all: boolean) {
    if (controller.current || saveBlocked) return;
    const targets = all ? nonempty : nonempty.filter((chapter) => chapter.id === selectedChapterId);
    if (!targets.length) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(null); setResults([]); setDecisions({}); setUndo(null); expected.current.clear();
    let finished = 0;
    try {
      for (const chapter of targets) {
        let partCount = 1;
        for (let part = 0; part < partCount; part += 1) {
          setProgress(`Reviewing chapter ${finished + 1} of ${targets.length}: ${chapter.title} · part ${part + 1}`);
          const response = await fetch(`/api/books/${bookId}/editorial/review`, {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
            body: JSON.stringify({ mode, chapterId: chapter.id, part, ...(mode === "translation" ? { sourceVersionId } : {}) }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The review could not be completed.");
          const result = payload as ReviewResult;
          if (expected.current.has(chapter.id) && expected.current.get(chapter.id) !== result.originalContent) {
            throw new Error("The chapter changed during review. Run a new review before applying suggestions.");
          }
          expected.current.set(chapter.id, result.originalContent);
          partCount = result.partCount;
          setResults((previous) => [...previous, result]);
        }
        finished += 1;
      }
      setProgress(`Review complete: ${finished} of ${targets.length} ${targets.length === 1 ? "chapter" : "chapters"}, including every text part.${available.length > nonempty.length && all ? ` ${available.length - nonempty.length} empty chapters skipped.` : ""}`);
    } catch (cause) {
      setProgress(`Review incomplete: ${finished} of ${targets.length} chapters completed. Results below cover only the displayed parts.`);
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "The review failed. Please try again.");
    } finally { controller.current = null; setBusy(false); }
  }

  async function accept(result: ReviewResult, index: number) {
    if (applying || busy || saveBlocked) return;
    setApplying(true); setError(null);
    try {
      const before = expected.current.get(result.chapterId) ?? null;
      const correction = result.report.corrections[index];
      const next = applyCorrection(before, correction.original, correction.replacement);
      const after = await onApplyReview(result.chapterId, before, next);
      expected.current.set(result.chapterId, after);
      const decisionKey = `${keyFor(result)}:${index}`;
      setDecisions((previous) => ({ ...previous, [decisionKey]: "accepted" }));
      setUndo({ chapterId: result.chapterId, before: before!, after, decisionKey });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The correction could not be saved."); }
    finally { setApplying(false); }
  }

  async function undoLast() {
    if (!undo || applying || saveBlocked) return;
    setApplying(true); setError(null);
    try {
      const restored = await onApplyReview(undo.chapterId, undo.after, undo.before);
      expected.current.set(undo.chapterId, restored);
      setDecisions((previous) => { const next = { ...previous }; delete next[undo.decisionKey]; return next; });
      setUndo(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The change could not be undone."); }
    finally { setApplying(false); }
  }

  function download() {
    const blob = new Blob([JSON.stringify({ reviewedAt: new Date().toISOString(), bookId, mode, coverage: progress, results, decisions }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `editorial-review-${bookId}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const disabled = busy || applying || saveBlocked;
  return (
    <section aria-label="Editorial review" className="min-w-0 space-y-4 [overflow-wrap:anywhere] rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Manuscript & translation review</h2>
        <p className="mt-1 text-sm text-muted-foreground">AI suggestions for your saved text. You choose which changes to accept. Download your report before leaving this page; review decisions are kept for this session.</p>
      </div>
      {!nonempty.length ? <p className="text-sm text-muted-foreground">Add and save a chapter before starting a review.</p> : <>
        <div className="flex flex-wrap gap-3">
          <label className="grid min-w-0 max-w-full gap-1 text-sm">Review type<select className={`${buttonClass} min-w-0 max-w-full`} value={mode} disabled={disabled} onChange={(event) => { setMode(event.target.value as ReviewMode); setResults([]); setProgress(""); setUndo(null); setError(null); }}>
            <option value="proofread">Proofreading · spelling & grammar</option>
            <option value="analysis">Manuscript analysis · chapter by chapter</option>
            <option value="translation">Translation · compare with source</option>
          </select></label>
          <label className="grid min-w-0 max-w-full gap-1 text-sm">Chapter<select className={`${buttonClass} min-w-0 max-w-full`} value={selectedChapterId} disabled={disabled} onChange={(event) => setChapterId(event.target.value)}>{nonempty.map((chapter, index) => <option key={chapter.id} value={chapter.id}>{index + 1}. {chapter.title}</option>)}</select></label>
          {mode === "translation" && <label className="grid min-w-0 max-w-full gap-1 text-sm">Compare against version<select className={`${buttonClass} min-w-0 max-w-full`} value={sourceVersionId} disabled={disabled} onChange={(event) => { setSourceVersionId(event.target.value); setResults([]); setProgress(""); setUndo(null); }}>
            <option value="">Choose source language</option>{bookVersions.filter((version) => version.id !== activeVersionId).map((version) => <option key={version.id} value={version.id}>{version.language_code.toUpperCase()}</option>)}
          </select></label>}
        </div>
        {mode === "translation" && <p className="text-sm text-muted-foreground">The current version is the translation. Source chapters are matched by chapter position; confirm that both versions have the same chapter order. Each pair is read in full, up to 80,000 characters combined.</p>}
        {mode === "analysis" && <p className="text-sm text-muted-foreground">Checks characters, pacing, plot clarity and voice in each chapter. Long chapters are read in parts. Cross-chapter continuity still needs an editorial overview.</p>}
        {saveBlocked && <p role="status" className="text-sm">Wait until your manuscript has saved before reviewing or accepting changes.</p>}
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass} disabled={disabled || !chapterId || (mode === "translation" && !sourceVersionId)} onClick={() => void run(false)}>Review chapter</button>
          {mode !== "translation" && <button className={buttonClass} disabled={disabled} onClick={() => void run(true)}>Review all chapters ({nonempty.length})</button>}
          {busy && <button className={buttonClass} onClick={() => controller.current?.abort()}>Stop review</button>}
          {!!results.length && <button className={buttonClass} onClick={download}>Download review</button>}
          {undo && <button className={buttonClass} disabled={disabled} onClick={() => void undoLast()}>Undo last accepted change</button>}
        </div>
      </>}
      {progress && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{progress}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
      {results.map((result) => {
        const isStale = !available.some((chapter) => chapter.id === result.chapterId && chapter.content === expected.current.get(result.chapterId));
        return <article key={keyFor(result)} className="space-y-3 border-t border-border pt-4">
        <h3 className="font-semibold">{result.chapterTitle} · part {result.part + 1} of {result.partCount}</h3>
        {isStale && <p role="status" className="text-sm text-muted-foreground">This chapter changed after review. Run a new review before accepting suggestions.</p>}
        <p className="whitespace-pre-wrap text-sm">{result.report.summary}</p>
        {result.sourceText && <details className="text-sm"><summary className="cursor-pointer font-medium">Compare source and reviewed translation</summary><div className="mt-3 grid gap-4 md:grid-cols-2"><div><h4 className="font-semibold">Source</h4><p className="max-h-80 overflow-auto whitespace-pre-wrap">{result.sourceText}</p></div><div><h4 className="font-semibold">Reviewed translation</h4><p className="max-h-80 overflow-auto whitespace-pre-wrap">{result.reviewedText}</p></div></div></details>}
        {result.report.findings.map((finding, index) => <div key={index} className="rounded-lg bg-muted/40 p-3 text-sm"><p className="font-medium capitalize">{finding.category} · {finding.severity}</p>{finding.quote && <blockquote className="my-2 border-l-2 border-border pl-3">{finding.quote}</blockquote>}<p>{finding.explanation}</p></div>)}
        {!result.report.corrections.length && <p className="text-sm text-muted-foreground">No direct text corrections suggested in this part.</p>}
        {result.report.corrections.map((correction, index) => {
          const decisionKey = `${keyFor(result)}:${index}`;
          const decision = decisions[decisionKey];
          return <div key={index} className="space-y-2 rounded-xl border border-border p-3 text-sm"><div className="grid gap-3 md:grid-cols-2"><div><p className="font-medium text-muted-foreground">Original</p><p className="whitespace-pre-wrap">{correction.original}</p></div><div><p className="font-medium text-muted-foreground">Suggested change</p><p className="whitespace-pre-wrap">{correction.replacement || "(Remove this text)"}</p></div></div><p className="text-muted-foreground">{correction.reason}</p>{decision ? <p role="status" className="font-medium">{decision === "accepted" ? "Accepted and saved" : "Rejected · text unchanged"}</p> : <div className="flex gap-2"><button className={buttonClass} disabled={disabled || isStale} onClick={() => void accept(result, index)}>Accept change</button><button className={buttonClass} disabled={disabled} onClick={() => setDecisions((previous) => ({ ...previous, [decisionKey]: "rejected" }))}>Reject</button></div>}</div>;
        })}
      </article>; })}
    </section>
  );
}
