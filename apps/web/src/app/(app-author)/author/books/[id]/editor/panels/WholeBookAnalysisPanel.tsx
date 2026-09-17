"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, BookOpen, Pause, RefreshCw } from "lucide-react";
import { reviewText } from "@/lib/editorial/content";
import type { BookAnalysisResult } from "@/lib/editorial/book-analysis-run-schema";
import { BOOK_ANALYSIS_CATEGORIES, type AnalysisCategory } from "@/lib/editorial/book-analysis-schema";
import styles from "./WholeBookAnalysisPanel.module.css";

type Chapter = { id: string; title: string; content: string | null; order: number; book_version_id: string };
export type WholeBookAnalysisProps = { bookId: string; versionId: string | null; chapters: Chapter[]; saveBlocked: boolean; request?: typeof fetch };
const labels: Record<AnalysisCategory, string> = { plot: "Plot", timeline: "Timeline", perspective: "Perspective", characters: "Characters" };

export default function WholeBookAnalysisPanel(props: WholeBookAnalysisProps) {
  return <EditionAnalysisPanel key={`${props.bookId}:${props.versionId}`} {...props} />;
}

function EditionAnalysisPanel({ bookId, versionId, chapters, saveBlocked, request = fetch }: WholeBookAnalysisProps) {
  const [analysis, setAnalysis] = useState<BookAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [category, setCategory] = useState<AnalysisCategory | "all">("all");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const stop = useRef(false);
  const generation = useRef(0);
  const versionChapters = useMemo(() => chapters.filter((chapter) => chapter.book_version_id === versionId).sort((a, b) => a.order - b.order), [chapters, versionId]);
  const sourceKey = JSON.stringify(versionChapters.map(({ id, title, content, order }) => [id, title, content, order]));
  const nonempty = versionChapters.filter((chapter) => reviewText(chapter.content)).length;
  const stale = Boolean(analysis && (analysis.stale || (loadedKey !== null && loadedKey !== sourceKey)));
  const endpoint = `/api/books/${encodeURIComponent(bookId)}/editorial/book-analysis`;
  const load = useCallback(async () => {
    if (!versionId) { setLoading(false); return; }
    const token = ++generation.current;
    setLoading(true); setError(null);
    try {
      const res = await request(`${endpoint}?versionId=${encodeURIComponent(versionId)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the saved analysis.");
      if (token !== generation.current) return;
      setAnalysis(data.analysis); setLoadedKey(sourceKey);
    } catch (value) { if (token === generation.current) setError(value instanceof Error ? value.message : "Could not load your analysis."); }
    finally { if (token === generation.current) setLoading(false); }
  }, [endpoint, request, sourceKey, versionId]);
  // Read once for this edition. Text edits invalidate the existing result instead
  // of replacing the on-screen report while the author is working.
  useEffect(() => {
    void load();
    return () => { stop.current = true; generation.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, versionId, request]);
  useEffect(() => { if (stale || saveBlocked) stop.current = true; }, [stale, saveBlocked]);

  async function advance(create: boolean) {
    if (!versionId || running || saveBlocked) return;
    stop.current = false; setPaused(false); setRunning(true); setError(null);
    const token = ++generation.current;
    let current = create ? null : analysis;
    setLoadedKey(sourceKey);
    try {
      while (!stop.current) {
        const body = current ? { action: "advance", versionId, jobId: current.jobId, expectedPart: current.completedParts } : { action: "start", versionId };
        const res = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "The analysis did not complete. Refresh its status before continuing.");
        if (token !== generation.current) return;
        current = data.analysis as BookAnalysisResult;
        setAnalysis(current);
        if (current.status !== "pending" || current.stale) break;
      }
      if (stop.current && token === generation.current) setPaused(true);
    } catch (value) { if (token === generation.current) setError(value instanceof Error ? value.message : "Connection interrupted. Refresh to check whether the current part was saved."); }
    finally { if (token === generation.current) setRunning(false); }
  }
  async function abandon() {
    if (!versionId || !analysis || running || loading) return;
    const token = ++generation.current;
    setLoading(true); setError(null);
    try {
      const res = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "abandon", versionId, jobId: analysis.jobId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not stop the analysis. Refresh its status.");
      if (token !== generation.current) return;
      setAnalysis(data.analysis); setPaused(false);
    } catch (value) { if (token === generation.current) setError(value instanceof Error ? value.message : "Could not stop the analysis. Refresh its status."); }
    finally { if (token === generation.current) setLoading(false); }
  }
  function download() {
    if (!analysis?.report) return;
    const file = new Blob([JSON.stringify({ ...analysis, stale }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file); const link = document.createElement("a");
    link.href = url; link.download = `book-analysis-${analysis.jobId}.json`; link.click(); URL.revokeObjectURL(url);
  }
  const report = analysis?.status === "completed" ? analysis.report : null;
  const findings = report?.findings.filter((finding) => category === "all" || finding.category === category) ?? [];
  const progress = analysis ? Math.round((analysis.completedParts + (report ? 1 : 0)) / (analysis.totalParts + 1) * 100) : 0;
  return <section className={styles.panel} aria-labelledby="whole-book-heading">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Edith / Editorial overview</p><h2 id="whole-book-heading">The story between your chapters.</h2>
        <p className={styles.intro}>Read the manuscript as a whole. Follow plot, time, perspective and characters across chapters, with the passages behind each observation.</p></div>
      <BookOpen size={28} aria-hidden className={styles.mark} />
    </header>
    <div className={styles.toolbar}>
      <div><strong>{nonempty} {nonempty === 1 ? "chapter" : "chapters"} with text</strong><span>{versionChapters.length - nonempty > 0 ? ` · ${versionChapters.length - nonempty} empty` : ""}</span>
        <p>Uses your editorial AI allowance. Your manuscript stays unchanged.</p></div>
      <div className={styles.actions}>
        {running ? <button type="button" className={styles.secondary} onClick={() => { stop.current = true; setPaused(true); }}><Pause size={16} />{paused ? "Pausing after this part…" : "Pause after this part"}</button>
          : <button type="button" className={styles.primary} disabled={loading || saveBlocked || nonempty < 2 || !versionId || analysis?.status === "processing"} onClick={() => void advance(!(analysis?.status === "pending" && !stale))}>
            {analysis?.status === "pending" && !stale ? "Continue analysis" : report || stale || analysis?.status === "failed" ? "Analyse again" : "Analyse whole book"}<ArrowRight size={16} /></button>}
        <button type="button" className={styles.secondary} disabled={running || loading} onClick={() => void load()} aria-label="Refresh analysis status"><RefreshCw size={16} /></button>
      </div>
    </div>
    {!running && analysis && (analysis.status === "pending" || analysis.status === "processing") && <div className={styles.notice}>
      <p>If this run is stuck, stop it before starting a new analysis. Requests already sent may still finish and use your allowance. A new analysis has its own cost.</p>
      <button type="button" className={styles.secondary} disabled={loading} onClick={() => void abandon()}>Stop this analysis</button>
    </div>}
    {saveBlocked && <p className={styles.notice} role="status">Finish saving or resolve the manuscript conflict before starting an analysis.</p>}
    {loading && <p className={styles.notice} role="status">Loading your saved analysis…</p>}
    {error && <div className={styles.error} role="alert"><strong>Analysis needs attention</strong><p>{error}</p><p>No new complete report is available. Refresh the status before retrying.</p></div>}
    {stale && <p className={styles.notice} role="status">This report belongs to an earlier manuscript. Analyse again to include your latest changes.</p>}
    {!loading && !analysis && !error && <div className={styles.empty}><p>{nonempty < 2 ? "Add text to at least two chapters to compare how your story develops." : "Start with the full picture."}</p><span>Chapters are read in parts, then considered together. This is an editorial aid, not a professional sign-off.</span></div>}
    {analysis && !report && <div className={styles.progress} aria-live="polite">
      <div><strong>{analysis.status === "failed" ? "Analysis incomplete" : paused ? "Paused between parts" : analysis.completedParts === analysis.totalParts ? "Bringing the chapters together" : "Reading the manuscript"}</strong><span>{analysis.completedParts} of {analysis.totalParts} parts read</span></div>
      <progress value={progress} max={100} aria-label="Whole-book analysis progress" />
      <p>{analysis.error || (analysis.status === "processing" && !running ? "A part is still processing. Refresh to check its status; no new model work is started by refreshing." : "A whole-book report appears only after every part and the final synthesis are complete.")}</p>
    </div>}
    {report && <div className={styles.report}>
      <div className={styles.reportTop}><p>{stale ? "Earlier analysis" : "Whole-book report"} · {analysis!.totalParts} parts read</p><button type="button" className={styles.secondary} onClick={download}><ArrowDownToLine size={16} />Download report</button></div>
      <p className={styles.summary}>{report.summary}</p>
      <div className={styles.areas}>{report.areas.map((area) => <div key={area.category}><h3>{labels[area.category]}</h3><p>{area.summary}</p></div>)}</div>
      <div className={styles.filters} role="group" aria-label="Filter editorial observations">
        {(["all", ...BOOK_ANALYSIS_CATEGORIES] as const).map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item === "all" ? "All observations" : labels[item]}</button>)}
      </div>
      {findings.length === 0 ? <p className={styles.notice}>No cross-chapter issue was identified{category !== "all" ? ` for ${labels[category].toLowerCase()}` : " in this analysis"}. This does not guarantee the manuscript is error-free.</p>
        : <div className={styles.findings}>{findings.map((finding, index) => <article key={`${finding.category}-${index}`}>
          <div className={styles.findingMeta}><span>{labels[finding.category]}</span><span>{finding.severity === "important" ? "Worth checking" : "Consider"}</span></div>
          <h3>{finding.title}</h3><p>{finding.explanation}</p>
          <div className={styles.evidence}>{finding.evidence.map((citation, citationIndex) => {
            const chapter = versionChapters.find((item) => item.id === citation.chapterId);
            const savedChapter = analysis!.chapters.find((item) => item.id === citation.chapterId);
            const text = reviewText(chapter?.content ?? null); const position = text.indexOf(citation.quote);
            return <details key={`${citation.chapterId}-${citationIndex}`}><summary>{savedChapter ? `${savedChapter.order + 1}. ${savedChapter.title}` : "Chapter reference"}<span>Read passage</span></summary>
              <blockquote>{citation.quote}</blockquote>
              {position >= 0 && <p className={styles.context}>{position > 120 && "…"}{text.slice(Math.max(0, position - 120), position)}<mark>{citation.quote}</mark>{text.slice(position + citation.quote.length, position + citation.quote.length + 120)}{position + citation.quote.length + 120 < text.length && "…"}</p>}
              {position < 0 && <p className={styles.context}>This passage is no longer present in the current chapter.</p>}
            </details>;
          })}</div>
        </article>)}</div>}
      <p className={styles.footer}>AI observations can miss context. Review the passages and decide what belongs in your story.</p>
    </div>}
  </section>;
}
