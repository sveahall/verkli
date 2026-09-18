"use client";

import { useCallback, useRef, useState } from "react";
import TranslationQualityCard from "@/app/(app-author)/author/books/[id]/editor/panels/TranslationQualityCard";
import TranslatePanel from "@/app/(app-author)/author/books/[id]/editor/panels/TranslatePanel";
import type { QualityReport } from "@/lib/ai/translation-quality/types";

const originalText = "Natten var tyst. Inte lugn. Tyst.\n\n– Kommer du? frågade Nora.\n– Nej.";
const translatedText = "The night was quiet. Not calm. Quiet.\n\n‘Are you coming?’ Nora asked.\n‘No.’";
const report: QualityReport = {
  status: "checks_passed", profile: { voice: "Restrained, intimate and deliberately spare.", rhythm: "Short fragments. Repetition creates tension; do not vary it for fluency.", dialogue: "Brief exchanges without added explanation.", preserve: ["The repeated word ‘tyst’", "Nora’s name", "Intentional sentence fragments"], glossary: [{ source: "Nora", target: "Nora" }] },
  issues: [], revisionCount: 1, reviewRounds: 2, model: "Prepared QA fixture", rubricVersion: "author-voice-v1", usage: { inputTokens: 0, outputTokens: 0 },
};

export default function TranslationQualityPreview() {
  const [scenario, setScenario] = useState<"pass" | "issues" | "unavailable">("issues");
  const [language, setLanguage] = useState("en");
  const [bookJobFlow, setBookJobFlow] = useState(false);
  const queuedJob = useRef<{ startedAt: number; failed: boolean; chapterId: string | null } | null>(null);
  const request = useCallback<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/translation-preview")) return Response.json({ originalText, previewText: translatedText });
    if (url.pathname.endsWith("/translate")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      queuedJob.current = { startedAt: Date.now(), failed: scenario === "unavailable", chapterId: typeof body.chapterId === "string" ? body.chapterId : null };
      return Response.json({ ok: true, jobId: "prepared-book-job" });
    }
    const completed = queuedJob.current !== null && Date.now() - queuedJob.current.startedAt >= 4000;
    if (url.searchParams.has("queueJobId")) return Response.json({ queue: { status: completed ? queuedJob.current?.failed ? "failed" : "completed" : "active", chapterId: queuedJob.current?.chapterId ?? null } });
    if (init?.method !== "POST") return Response.json({ jobs: completed ? [{
      id: "prepared-book-review", status: queuedJob.current?.failed ? "failed" : "completed", createdAt: new Date().toISOString(), stale: false,
      output: { formatVersion: 1, scope: queuedJob.current?.chapterId ? "chapter" : "book", sourceVersionId: "00000000-0000-4000-8000-000000000002", targetVersionId: "prepared-target", sourceHash: "prepared", targetHash: "prepared", status: queuedJob.current?.failed ? "failed" : "checks_passed", profile: report.profile, batches: [], checkedAt: new Date().toISOString(), error: queuedJob.current?.failed ? "Prepared worker failure. No quality approval was issued." : null },
    }] : [] });
    await new Promise((resolve) => setTimeout(resolve, 1400));
    if (scenario === "unavailable") return Response.json({ error: "The review could not be completed. No quality decision was made. Try again shortly." }, { status: 503 });
    const needsReview = scenario === "issues";
    return Response.json({ originalText, translatedText: needsReview ? translatedText.replace("Not calm.", "Peaceful.") : translatedText, report: { ...report, status: needsReview ? "needs_review" : "checks_passed", issues: needsReview ? [{ reviewer: "fidelity", severity: "major", segment: 0, sourceQuote: "Inte lugn.", targetQuote: "Peaceful.", explanation: "The translation reverses the meaning: the original explicitly says the night was not calm.", suggestion: "Use ‘Not calm.’ and keep the abrupt fragment." }] : [] } });
  }, [scenario]);

  return <main className="mx-auto max-w-6xl px-5 py-12 text-foreground sm:px-10">
    <a href="/author" className="text-sm text-muted-foreground">Verkli / Translation quality</a>
    <h1 className="mt-8 text-4xl font-medium tracking-tight">A translation you can inspect.</h1>
    <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Local QA preview with prepared examples. These controls test the actual review panel; they make no model requests and change no manuscripts. The production editor uses your saved text and real reviewers.</p>
    <div className="my-8 flex flex-wrap items-center gap-3">
      {([['issues', 'Unresolved issue'], ['pass', 'Checks passed'], ['unavailable', 'Provider unavailable']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={scenario === value} onClick={() => setScenario(value)} className={`rounded-full border border-border px-4 py-2 text-sm ${scenario === value ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>{label}</button>)}
      <button type="button" aria-pressed={bookJobFlow} onClick={() => { queuedJob.current = null; setBookJobFlow((current) => !current); }} className="rounded-full border border-border bg-card px-4 py-2 text-sm">Book job flow</button>
      <label className="ml-auto text-sm">Target <select aria-label="Target language" value={language} onChange={(e) => setLanguage(e.target.value)} className="ml-2 rounded-lg border border-border bg-card px-3 py-2"><option value="en">English</option><option value="fr">French (reset test)</option></select></label>
    </div>
    {bookJobFlow ? <TranslatePanel bookId="00000000-0000-4000-8000-000000000001" bookTitle="Prepared book job" authorDisplayName="QA fixture" bookLengthLabel="1 prepared chapter" sourceLanguage="sv" sourceVersionId="00000000-0000-4000-8000-000000000002" chapters={[{ id: "prepared-chapter", title: "Night" }]} selectedChapterId="prepared-chapter" request={request} /> : <TranslationQualityCard key={`${scenario}:${language}`} bookId="00000000-0000-4000-8000-000000000001" sourceVersionId="00000000-0000-4000-8000-000000000002" targetLanguage={language} request={request} />}
  </main>;
}
