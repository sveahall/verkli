import type { CandidateAdapter, CandidateIntent, SavedCandidate } from "@/features/illustration-candidates/contracts";
import { loadLocalImage } from "@/features/book-illustrations/local-image";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const chapters = [{ id: id(3), title: "The harbour", version: 4 }, { id: id(4), title: "Across the water", version: 2 }];

// Development-only memory adapter. It never imports a server repository or writes storage.
export function createCandidateFixture() {
  const saved = new Map<string, { chapterId: string; intent: string; candidate: SavedCandidate }>();
  const versions = new Map(chapters.map((chapter) => [chapter.id, chapter.version]));
  let failNext = false; let delay = false; let disposed = false;
  const adapters = chapters.map((chapter): CandidateAdapter => ({
    contextId: `local-demo:${chapter.id}`,
    async list() { return { scope: { bookId: id(1), editionId: id(2), chapterId: chapter.id, chapterTitle: chapter.title, chapterVersion: versions.get(chapter.id)! }, candidates: [...saved.values()].filter((item) => item.chapterId === chapter.id).map((item) => item.candidate).reverse().slice(0, 25) }; },
    async save(intent: CandidateIntent, file: File) {
      // Deliberately ignore abort to exercise late server-response isolation in the caller.
      if (delay) await new Promise((resolve) => setTimeout(resolve, 1200));
      if (disposed) throw new Error("Demo session ended.");
      if (failNext) { failNext = false; throw new Error("Private image storage is unavailable. Your local proposal is still here; retry when it is available."); }
      const old = saved.get(intent.requestId);
      if (old) { if (old.intent !== JSON.stringify(intent)) throw new Error("The request changed. Review your proposal."); return old.candidate; }
      if (intent.expectedChapterVersion !== versions.get(chapter.id)) throw new Error("The chapter changed. Reload candidates and review your proposal.");
      const image = await loadLocalImage(file);
      if (disposed) { image.dispose(); throw new Error("Demo session ended."); }
      const candidate: SavedCandidate = { id: intent.requestId, version: saved.size + 1, createdAt: new Date().toISOString(), alt: intent.alt, placement: intent.placement, styleSnapshot: intent.styleSnapshot, width: image.width, height: image.height, sourceChapterVersion: intent.expectedChapterVersion, imageUrl: image.url };
      saved.set(intent.requestId, { chapterId: chapter.id, intent: JSON.stringify(intent), candidate });
      return candidate;
    },
  }));
  return { chapters, adapters, activate: () => { disposed = false; }, failNext: () => { failNext = true; }, delay: (value: boolean) => { delay = value; }, advance: (index: number) => { const chapter = chapters[index]; versions.set(chapter.id, versions.get(chapter.id)! + 1); }, dispose: () => { disposed = true; for (const item of saved.values()) URL.revokeObjectURL(item.candidate.imageUrl); saved.clear(); } };
}
