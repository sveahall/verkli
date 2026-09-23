"use client";

import { useEffect, useRef, useState } from "react";
import TranslatePanel from "@/app/(app-author)/author/books/[id]/editor/panels/TranslatePanel";
import BookWorkflowHeader from "@/app/(app-author)/author/books/[id]/BookWorkflowHeader";
import AiAssistantPanel from "@/app/(app-author)/author/books/[id]/editor/panels/AiAssistantPanel";
import AgentCompanion from "@/features/ai-team/AgentCompanion";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import type { SupportedLanguage } from "@/lib/languages";
import { ToastProvider } from "@/components/ui/toast";

const bookId = "00000000-0000-4000-8000-000000000041";
const chapterId = "00000000-0000-4000-8000-000000000042";
const originalText = "The last ferry left at six.\n\nMira stood at the edge of the harbour, watching its lights disappear into the mist. In her pocket was a letter she had carried for seventeen years. She knew every fold, every faded word.\n\nTonight, for the first time, she was going to answer it.";
const previews: Record<string, string> = {
  sv: "Den sista färjan gick klockan sex.\n\nMira stod vid hamnkanten och såg dess ljus försvinna i dimman. I fickan låg ett brev som hon hade burit med sig i sjutton år. Hon kände varje veck, varje bleknat ord.\n\nI kväll skulle hon för första gången besvara det.",
  fr: "Le dernier ferry était parti à six heures.\n\nMira se tenait au bord du port, regardant ses lumières disparaître dans la brume. Dans sa poche, une lettre qu’elle portait depuis dix-sept ans. Elle en connaissait chaque pli, chaque mot effacé.\n\nCe soir, pour la première fois, elle allait y répondre.",
  ar: "غادرت العبّارة الأخيرة في السادسة.\n\nوقفت ميرا عند حافة الميناء، تراقب أضواءها وهي تختفي في الضباب. في جيبها رسالة حملتها طوال سبعة عشر عاماً.\n\nهذه الليلة، وللمرة الأولى، كانت ستردّ عليها.",
};

const sourceLanguages: Record<string, SupportedLanguage> = { "swedish-edition": "sv", "dutch-edition": "nl", "polish-edition": "pl" };

export default function TranslationStudioPreview() { return <ToastProvider><Preview /></ToastProvider>; }
function Preview() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("ready");
  const [edition, setEdition] = useState("preview-edition");
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<Array<{ path: string; body: unknown }>>([]);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    const nativeFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      if (!url.pathname.startsWith("/api/") && url.origin === location.origin && (!init?.method || init.method === "GET")) return nativeFetch(input, init);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      setRequests((items) => [...items, { path: url.pathname + url.search, body }]);
      // Every API and external request is intercepted: no providers, payments or database writes.
      if (url.origin !== location.origin) return Response.json({ error: "PREVIEW_ONLY" }, { status: 403 });
      const responseMode = modeRef.current;
      if (url.pathname.endsWith("/saved-translation")) {
        const language = url.searchParams.get("targetLanguage") ?? "sv";
        const sourceId = url.searchParams.get("sourceVersionId") ?? "preview-edition";
        await new Promise((resolve) => setTimeout(resolve, responseMode === "slow" ? 2500 : 200));
        if (responseMode === "failure") return Response.json({ error: "SIMULATED_FAILURE" }, { status: 503 });
        if (responseMode === "oversized") return Response.json({ error: "This book is too large for the comparison view. Open its chapters in Write." }, { status: 422 });
        const sourceLanguage = sourceLanguages[sourceId] ?? "en";
        if (sourceLanguage === language) return Response.json({ error: "Choose a different target language." }, { status: 400 });
        const source = { id: sourceId, language_code: sourceLanguage, status: "done", chapters: [{ id: chapterId, title: "The harbour", order: 0, text: sourceId === "other-edition" ? "Another source edition." : sourceLanguage === "en" ? originalText : previews[sourceLanguage] ?? `[${sourceLanguage} synthetic source text]` }, { id: "chapter-two", title: "The letter", order: 1, text: "The letter was still unopened." }] };
        return Response.json({ source, target: responseMode === "unavailable" ? null : { id: `saved-${language}`, language_code: language, status: "done", chapters: responseMode === "empty" ? [] : [{ id: "translated-one", title: "Saved opening", order: 0, text: previews[language] ?? `[${language} synthetic saved text]` }, { id: "translated-two", title: "Saved letter", order: 1, text: `[${language} saved chapter two]` }] }, fingerprints: { source: sourceId === "other-edition" ? "different-source" : "source-hash", target: "target-hash", chapters: [] } });
      }
      if (url.pathname.endsWith("/translation-quality") && (!init?.method || init.method === "GET")) {
        if (responseMode === "report-failure") return Response.json({ error: "SIMULATED_REPORT_FAILURE" }, { status: 503 });
        const language = url.searchParams.get("targetLanguage") ?? "sv";
        const sourceId = url.searchParams.get("sourceVersionId") ?? "preview-edition";
        const report = { status: "needs_review", profile: { voice: "Restrained", rhythm: "Short sentences", dialogue: "None", preserve: ["Names"], glossary: [] }, issues: [{ reviewer: "fidelity", severity: "major", segment: 0, sourceQuote: "The letter was still unopened.", targetQuote: "Brevet var öppnat.", explanation: "Synthetic historical finding: the negation was lost.", suggestion: "Keep the letter unopened." }], revisionCount: 1, reviewRounds: 2, model: "synthetic fixture", rubricVersion: "fixture", usage: { inputTokens: 0, outputTokens: 0 } };
        return Response.json({ jobs: [{ id: "saved-report", status: "completed", createdAt: "2026-09-20T12:00:00Z", trusted: false, stale: responseMode === "edited", output: { formatVersion: 1, scope: "book", sourceVersionId: sourceId, targetVersionId: `saved-${language}`, sourceHash: "source-hash", targetHash: responseMode === "edited" ? "old-target" : "target-hash", status: "needs_review", profile: report.profile, batches: [{ chapterId, chapterTitle: "The letter", batchIndex: 0, sourceHash: "", targetHash: "", segmentOffset: 0, report }], checkedAt: "2026-09-20T12:00:00Z", error: null } }] });
      }
      if (url.pathname.endsWith("/translation-preview")) {
        await new Promise((resolve) => setTimeout(resolve, responseMode === "slow" ? 2500 : 350));
        if (responseMode === "failure") return Response.json({ error: "SIMULATED_FAILURE" }, { status: 503 });
        const language = url.searchParams.get("targetLanguage") ?? "sv";
        return Response.json({ originalText: responseMode === "empty" ? "" : originalText, previewText: ["empty", "unavailable"].includes(responseMode) ? "" : previews[language] ?? `[${language.toUpperCase()} fixture] ${originalText}`, previewUnavailable: responseMode === "unavailable" });
      }
      if (url.pathname.endsWith("/translate")) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        return responseMode === "submit-error" ? Response.json({ error: "Translation service is temporarily unavailable. Please try again." }, { status: 503 }) : Response.json({ ok: true });
      }
      if (url.pathname.endsWith("/ai/chat")) return Response.json({ persistence: "temporary", content: "Tell me the phrase you want to work on. We can compare its meaning and rhythm with your original. This is a simulated conversation for the design preview.", source: "llm", actions: [], context: { chapterId, chapterText: originalText } });
      return Response.json({ error: "PREVIEW_ONLY" }, { status: 403 });
    };
    const frame = requestAnimationFrame(() => setReady(true));
    return () => { cancelAnimationFrame(frame); window.fetch = nativeFetch; };
  }, []);
  return <main className="mx-auto w-full max-w-[1480px] p-4 sm:p-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>Design preview · synthetic manuscript · no external actions</p>
      <div className="flex flex-wrap items-center gap-3">
        <label>State <select aria-label="State" className="min-h-11 rounded-xl border border-border bg-card px-3 text-base" value={mode} onChange={(event) => setMode(event.target.value)}>{["ready", "slow", "failure", "unavailable", "empty", "submit-error", "paid", "billing", "no-chapter", "report-failure", "edited", "oversized"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Source edition <select aria-label="Source edition" value={edition} onChange={(event) => setEdition(event.target.value)}><option value="preview-edition">Original edition</option><option value="other-edition">Other edition</option><option value="swedish-edition">Swedish edition</option><option value="dutch-edition">Dutch edition</option><option value="polish-edition">Polish edition</option></select></label>
        <button type="button" className="min-h-11 rounded-full border border-border px-4" onClick={() => document.documentElement.classList.toggle("dark")}>Toggle theme</button>
      </div>
    </div>
    {ready && <WorkspaceLayout header={<h1 className="font-display text-xl">The last ferry</h1>} asideOpen={open} onAsideClose={() => setOpen(false)} asideLabel="Talk to Alma"
      aside={<AiAssistantPanel initialTemporary bookId={bookId} chapterId={chapterId} chapterTitle="The harbour" activeTool="translate" variant="dock" onClose={() => setOpen(false)} getDraftText={() => originalText} />}
      main={<div className="@container/book-panel overflow-hidden rounded-3xl border border-border bg-card">
        <BookWorkflowHeader bookId={bookId} activeTool="translate" tools={["edit", "cover", "audiobook", "translate", "pricing", "publish", "review"]} compact bare />
        <div className="p-4 sm:p-7"><AgentCompanion agent="alma" onTalk={() => setOpen(true)} />
          <TranslatePanel key={mode} bookId={bookId} bookTitle="The last ferry" authorDisplayName="Mira Holm" bookLengthLabel="3 chapters" sourceLanguage={sourceLanguages[edition] ?? "en"} sourceVersionId={edition} isProLocked={mode === "paid"} billingLoading={mode === "billing"} selectedChapterId={mode === "no-chapter" ? null : chapterId} chapters={[{ id: chapterId, title: "The harbour" }, { id: "chapter-two", title: "The letter" }, { id: "chapter-three", title: "A crossing" }]} hideTitle />
        </div>
      </div>} />}
    <details className="mt-6 text-sm"><summary className="min-h-11 cursor-pointer">Fixture request evidence</summary><pre className="overflow-auto" data-testid="requests">{JSON.stringify(requests, null, 2)}</pre></details>
  </main>;
}
