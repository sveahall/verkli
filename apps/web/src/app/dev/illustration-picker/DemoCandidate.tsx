"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import CandidatePanel from "@/features/illustration-candidates/CandidatePanel";
import { loadLocalImage } from "@/features/book-illustrations/local-image";
import type { CandidateAdapter, CandidateScopeKey, SavedCandidate } from "@/features/illustration-candidates/contracts";
import { pickerUrl } from "@/features/illustration-picker/contracts";

function createDemo(scope: CandidateScopeKey, title: string) {
  const candidates = new Map<string, SavedCandidate>(); let active = true;
  const adapter: CandidateAdapter = {
    contextId: `picker-demo:${scope.bookId}:${scope.editionId}:${scope.chapterId}`,
    async list() { return { scope: { ...scope, chapterTitle: title, chapterVersion: 4 }, candidates: [...candidates.values()].reverse() }; },
    async save(intent, file, signal) {
      const old = candidates.get(intent.requestId); if (old) return old;
      const image = await loadLocalImage(file, signal);
      if (!active || signal?.aborted) { image.dispose(); throw new Error("The local demo session ended."); }
      const candidate: SavedCandidate = { id: intent.requestId, version: candidates.size + 1, createdAt: new Date().toISOString(), alt: intent.alt, placement: intent.placement, styleSnapshot: intent.styleSnapshot, width: image.width, height: image.height, sourceChapterVersion: 4, imageUrl: image.url };
      candidates.set(candidate.id, candidate); return candidate;
    },
  };
  return { adapter, activate: () => { active = true; }, dispose: () => { active = false; for (const candidate of candidates.values()) URL.revokeObjectURL(candidate.imageUrl); candidates.clear(); } };
}
export default function DemoCandidate({ scope, title }: { scope: CandidateScopeKey; title: string }) {
  const [demo] = useState(() => createDemo(scope, title));
  useEffect(() => { demo.activate(); return () => demo.dispose(); }, [demo]);
  return <div className="space-y-6"><div className="mx-auto max-w-6xl rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><p><strong>Local demo — simulated saving only.</strong> Images disappear when you leave this chapter or reload. No database, storage or AI calls.</p><Link className="mt-3 inline-flex rounded-lg border px-3 py-2" href={pickerUrl("/dev/illustration-picker", { book: scope.bookId, edition: scope.editionId })}>Choose another chapter</Link></div><CandidatePanel adapter={demo.adapter} /></div>;
}
