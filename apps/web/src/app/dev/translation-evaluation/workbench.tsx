"use client";

import { useRef, useState } from "react";
import { parseEvaluationReport, type EvaluationReport } from "@/lib/ai/translation-quality/evaluation";
import { EVALUATION_CASES } from "@/lib/ai/translation-quality/evaluation-corpus";

export default function EvaluationWorkbench({ recordedReport }: { recordedReport: string | null }) {
  const [selected, setSelected] = useState(EVALUATION_CASES[0].id);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const sample = EVALUATION_CASES.find((item) => item.id === selected)!;
  const result = report?.results.find((item) => item.caseId === selected);
  const labels = { matched: "Decision matched", missed: "Expected issue missed", overflagged: "Acceptable prose flagged", error: "Review failed" };
  async function loadReport(file?: File, saved?: string) {
    const current = ++request.current;
    setReport(null); setError(""); setLoading(Boolean(file || saved));
    if (!file && !saved) return;
    try {
      if (file && file.size > 2_000_000) throw new Error("Too large");
      const parsed = await parseEvaluationReport(saved ?? await file!.text());
      if (current === request.current) setReport(parsed);
    } catch {
      if (current === request.current) setError("Cannot load this report. Choose valid JSON from this corpus, smaller than 2 MB. Previous results have been cleared.");
    } finally { if (current === request.current) setLoading(false); }
  }
  return <main className="mx-auto max-w-7xl space-y-8 px-5 py-12 text-foreground">
    <header className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">Verkli · Quality workbench · Development only</p>
      <h1 className="font-display text-4xl">Does the review protect the story?</h1>
      <p className="text-muted-foreground">Compare the source, a prepared translation and the reviewers’ findings. These original test passages have provisional expectations; bilingual editorial review is still required.</p>
    </header>
    <section aria-label="Evaluation report" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <label className="block space-y-2 text-sm font-medium">Load a local evaluation report
        <input type="file" accept=".json,application/json" onChange={(event) => { void loadReport(event.target.files?.[0]); event.target.value = ""; }} className="block max-w-full text-sm file:mr-4 file:min-h-11 file:rounded-full file:border-0 file:bg-primary file:px-4 file:text-primary-foreground" />
      </label>
      {recordedReport && <button type="button" className="btn-primary" onClick={() => void loadReport(undefined, recordedReport)}>Load recorded model run</button>}
      <p className="text-sm text-muted-foreground">The file stays in this browser. This page makes no model requests.</p>
      {loading && <p role="status">Checking report…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {report && <div className="space-y-3" aria-live="polite">
        <p className="text-sm">{report.mode === "live" ? "Recorded model run" : "Prepared test run — no model evidence"} · {new Date(report.createdAt).toLocaleString()}</p>
        <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {[["Decision matches", report.summary.matched], ["Missed defects", report.summary.missed], ["Overflagged", report.summary.overflagged], ["Errors", report.summary.errors], ["Not run", report.summary.notRun]].map(([label, count]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="text-2xl tabular-nums">{count}</dd></div>)}
        </dl>
        <p className="text-xs text-muted-foreground">Decision matches compare provisional labels, not the correctness of each diagnosis. Read the evidence before accepting a finding.</p>
      </div>}
    </section>
    <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Evaluation cases" className="space-y-2">
        {EVALUATION_CASES.map((item, index) => <button key={item.id} type="button" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)} className={`w-full rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${item.id === selected ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card hover:bg-accent"}`}>
          <span className="mr-2 text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>{item.title}<span className="mt-1 block text-xs text-muted-foreground">{item.expectedBlocking ? "Altered candidate" : "Reference candidate"}</span>
        </button>)}
      </nav>
      <section aria-labelledby="case-title" className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="case-title" className="font-display text-2xl">{sample.title}</h2><span className="rounded-full border border-border px-3 py-1 text-sm">{result ? labels[result.outcome] : "Not run"}</span></div>
        <div className="grid gap-4 md:grid-cols-2">
          {[{ label: `Original · ${sample.sourceLanguage}`, texts: sample.texts }, { label: `Candidate · ${sample.targetLanguage}`, texts: sample.translations }].map((column) => <article key={column.label} className="min-w-0 rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-5 text-sm text-muted-foreground">{column.label}</h3>
            {column.texts.map((text, index) => <p key={index} className="mb-4 whitespace-pre-wrap break-words font-serif text-xl leading-relaxed">{text}</p>)}
          </article>)}
        </div>
        <aside className="space-y-2 rounded-2xl border border-border bg-accent p-5 text-accent-foreground"><h3 className="font-medium">Expected: {sample.expectedBlocking ? "flag a material issue" : "preserve this translation"}</h3><p className="text-sm leading-relaxed">{sample.rationale}</p><p className="text-xs">This expectation is shown to you, never sent to the reviewers.</p></aside>
        {!result ? <p className="text-sm text-muted-foreground">No model review has been loaded for this case. A test passage is not a quality approval.</p> : result.review ? <section aria-label="Reviewer findings" className="space-y-4">
          <h3 className="font-display text-xl">What the reviewers found</h3>
          <p className="break-words text-xs text-muted-foreground">{result.review.model} · {result.review.rubricVersion} · {(result.elapsedMs / 1000).toFixed(1)}s · {result.review.usage.inputTokens.toLocaleString()} input / {result.review.usage.outputTokens.toLocaleString()} output tokens</p>
          {result.review.issues.length === 0 && <p className="rounded-xl border border-border p-4 text-sm">No findings reported. {sample.expectedBlocking ? "The expected defect was missed." : "A bilingual editor still needs to validate this judgment."}</p>}
          {result.review.issues.map((issue, index) => <article key={index} className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h4 className="text-sm font-medium">{issue.reviewer} · {issue.severity} · Segment {issue.segment + 1}</h4>
            <blockquote className="space-y-2 break-words border-l-2 border-primary pl-4 text-sm"><p>Original: {issue.sourceQuote}</p><p>Candidate: {issue.targetQuote}</p></blockquote>
            <p className="text-sm">{issue.explanation}</p><p className="text-sm text-muted-foreground">Suggested correction: {issue.suggestion}</p>
          </article>)}
        </section> : <p role="alert" className="rounded-xl border border-border p-4 text-sm">The review failed. No quality decision was made. Reported token totals exclude unavailable usage.</p>}
      </section>
    </div>
  </main>;
}
