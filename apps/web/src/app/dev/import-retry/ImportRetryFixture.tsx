"use client";

import { useState } from "react";
import { ToastProvider } from "@/components/ui/toast";
import type { UnifiedJob } from "@/hooks/useBookJobs";
import { useJobRetry } from "@/app/(app-author)/author/books/[id]/editor/hooks/useJobRetry";
import { BookEditorStatusBanners } from "@/app/(app-author)/author/books/[id]/editor/components/BookEditorStatusBanners";

const fixtureId = "00000000-0000-0000-0000-000000000001";
const noop = () => {};
const translation = { checkTranslationQueueHealth: async () => false, translateTargetLanguage: "en" as const,
  setTranslateTargetLanguage: noop, setLastRequestedTargetLanguage: noop,
  setTranslateMessage: noop, startTranslationPoll: noop };

function Fixture() {
  const [chapter, setChapter] = useState("Chapter 1");
  const [draft, setDraft] = useState("My unsaved manuscript stays here.");
  const [jobs, setJobs] = useState<UnifiedJob[]>(() => [{ id: fixtureId, kind: "import", status: "failed",
    language: "en", bookVersionId: fixtureId, progress: 0, meta: {}, error: "Import interrupted.",
    createdAt: new Date().toISOString(), startedAt: null, finishedAt: new Date().toISOString() }]);
  const refetchBookJob = async () => {
    const response = await fetch(`/api/books/${fixtureId}/jobs`);
    if (!response.ok) throw new Error("Could not refresh status.");
    const data = await response.json();
    setJobs(data.jobs);
  };
  const { handleJobRetry, importRetry } = useJobRetry({ bookId: fixtureId, activeVersionId: fixtureId,
    activeChapterId: chapter, audiobook: { handleGenerateAudiobook: async () => {} },
    translation, refetchBookJob });

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Import retry preview</h1>
      <p className="text-sm text-muted-foreground">Development fixture. Run with the import-retry Playwright HTTP mocks and a local server without production credentials. No real book is loaded.</p>
      <BookEditorStatusBanners jobLoading={false} jobError={null} jobsForBanner={jobs}
        billingPastDue={false} billingProActive={false} onJobRetry={handleJobRetry} importRetry={importRetry} />
      <label className="block">Chapter
        <select aria-label="Chapter" value={chapter} onChange={(event) => setChapter(event.target.value)} className="ml-3 rounded border p-2">
          <option>Chapter 1</option><option>Chapter 2</option>
        </select>
      </label>
      <label className="block">Unsaved draft
        <textarea aria-label="Unsaved draft" value={draft} onChange={(event) => setDraft(event.target.value)} className="mt-2 min-h-40 w-full rounded border p-3" />
      </label>
      <button type="button" onClick={() => void refetchBookJob().catch(noop)} className="rounded border px-4 py-2">Refresh status</button>
    </main>
  );
}

export default function ImportRetryFixture() {
  return <ToastProvider><Fixture /></ToastProvider>;
}
