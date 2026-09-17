"use client";
import { useMemo, useRef, useState } from "react";
import WholeBookAnalysisPanel from "@/app/(app-author)/author/books/[id]/editor/panels/WholeBookAnalysisPanel";
import type { BookAnalysisResult } from "@/lib/editorial/book-analysis-run-schema";
import { bookId, versionId, fixtureChapters, fixtureReport } from "./fixture";

function PreparedAnalysis({ mode }: { mode: string }) {
  const [edited, setEdited] = useState(false);
  const [edition, setEdition] = useState(versionId);
  const jobs = useRef(new Map<string, BookAnalysisResult>());
  const allowanceReset = useRef(false);
  const request = useMemo<typeof fetch>(() => async (input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const requestedEdition = body?.versionId ?? new URL(String(input), "http://localhost").searchParams.get("versionId") ?? versionId;
    let current = jobs.current.get(requestedEdition) ?? null;
    const initial = (): BookAnalysisResult => ({ jobId: crypto.randomUUID(), status: mode === "stuck" ? "processing" : "pending", createdAt: "2026-09-17T12:00:00Z",
      completedParts: 0, totalParts: 3, emptyChapters: 0, chapters: fixtureChapters.map(({ id, title, order }) => ({ id, title, order })), report: null, error: null, stale: false });
    if (!body) {
      if (!current && mode === "stuck") { current = initial(); jobs.current.set(requestedEdition, current); }
      return Response.json({ analysis: current });
    }
    if (body.action === "abandon" && current) {
      current.status = "failed"; current.error = "Stopped by you. Requests already sent may still count towards your AI allowance.";
      return Response.json({ analysis: current });
    }
    if (mode === "budget" && current?.completedParts === 1 && !allowanceReset.current) {
      current.error = "This analysis exceeds your remaining daily editorial AI allowance. Your completed parts are saved; continue this analysis after the daily reset.";
      return Response.json({ error: current.error }, { status: 429 });
    }
    if (mode === "unavailable") return Response.json({ error: "Editorial AI is not configured. Please contact support." }, { status: 503 });
    await new Promise((resolve) => setTimeout(resolve, mode === "slow" ? 1600 : 400));
    if (body.action === "start") {
      current = initial();
    } else if (current) {
      if (mode === "failure" && current.completedParts === 1) { current.status = "failed"; current.error = "The AI response could not be verified. No complete report was produced."; return Response.json({ error: current.error }, { status: 502 }); }
      if (current.completedParts === 3) { current.status = "completed"; current.report = fixtureReport; }
      else current.completedParts += 1;
    }
    if (current) jobs.current.set(requestedEdition, current);
    return Response.json({ analysis: current });
  }, [mode]);
  const chapters = edited ? fixtureChapters.map((chapter, index) => index === 0 ? { ...chapter, content: "An edited opening. " + chapter.content } : chapter) : fixtureChapters;
  return <><div className="my-4 flex flex-wrap gap-3"><button className="min-h-11 rounded-full border border-border px-4 text-sm" onClick={() => setEdited((value) => !value)}>Change manuscript</button>
    <button className="min-h-11 rounded-full border border-border px-4 text-sm" onClick={() => setEdition((value) => value === versionId ? "22222222-2222-4222-8222-222222222223" : versionId)}>Switch edition</button>
    {mode === "budget" && <button className="min-h-11 rounded-full border border-border px-4 text-sm" onClick={() => { allowanceReset.current = true; }}>Reset daily allowance</button>}
    <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">Read the controlled manuscript</summary><div className="grid gap-4 py-4">{chapters.map((chapter) => <article key={chapter.id}><h2 className="font-medium">{chapter.order + 1}. {chapter.title}</h2><p className="mt-2 max-w-3xl leading-7 text-muted-foreground">{chapter.content}</p></article>)}</div></details></div>
    <WholeBookAnalysisPanel bookId={bookId} versionId={edition} chapters={mode === "empty" ? [] : chapters.map((chapter) => ({ ...chapter, book_version_id: edition }))} saveBlocked={mode === "conflict"} request={request} />
  </>;
}
export default function BookAnalysisPreview() {
  const [mode, setMode] = useState("ready");
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
    <p>Development preview · prepared cross-chapter findings · no model or database calls</p>
    <div className="flex flex-wrap gap-3"><label className="flex items-center gap-2">State<select className="min-h-11 rounded-xl border border-border bg-card px-3 text-base" value={mode} onChange={(event) => setMode(event.target.value)}>{["ready", "slow", "stuck", "failure", "budget", "unavailable", "empty", "conflict"].map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
    </div><PreparedAnalysis key={mode} mode={mode} /></main>;
}
