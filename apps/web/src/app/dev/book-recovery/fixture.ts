import type { RecoveryAdapter, RecoveryItem } from "@/features/book-recovery/contracts";

type Row = Omit<RecoveryItem, "deletedAt" | "preview"> & {
  owner: string; bookId: string; order: number; deletedAt: string | null; content: string; published: boolean;
};

/** Synthetic, memory-only transaction model. Never used by a production route. */
export function createRecoveryFixture() {
  let owner = "author";
  const common = { owner, edition: "English · original", revision: 1, deletedAt: "2026-09-22T08:00:00Z", published: false };
  const rows: Row[] = [
    { ...common, id: "book", kind: "book", title: "The lighthouse", bookTitle: "The lighthouse", bookId: "book", order: 0, content: "A synthetic manuscript about a lighthouse." },
    { ...common, id: "chapter", kind: "chapter", title: "The keeper", bookTitle: "The lighthouse", bookId: "book", order: 1, content: "The lighthouse keeper opened the door." },
    { ...common, id: "active-book", kind: "book", title: "The garden", bookTitle: "The garden", bookId: "active-book", order: 0, content: "An active synthetic manuscript.", deletedAt: null },
    { ...common, id: "conflict", kind: "chapter", title: "Earlier opening", bookTitle: "The garden", bookId: "active-book", order: 1, content: "This older opening must not replace the new opening." },
    { ...common, id: "active-chapter", kind: "chapter", title: "New opening", bookTitle: "The garden", bookId: "active-book", order: 1, content: "The new opening stays exactly as written.", deletedAt: null },
  ];
  const adapter: RecoveryAdapter = {
    async list() {
      return rows.filter((row) => row.owner === owner && row.deletedAt !== null).map((row) => ({
        id: row.id, kind: row.kind, title: row.title, bookTitle: row.bookTitle, edition: row.edition,
        deletedAt: row.deletedAt!, revision: row.revision, preview: row.content,
      }));
    },
    async restore(expected) {
      const row = rows.find((candidate) => candidate.id === expected.id && candidate.owner === owner);
      if (!row) throw new Error("This item is unavailable in your account.");
      if (!row.deletedAt || row.revision !== expected.revision || row.deletedAt !== expected.deletedAt) {
        throw new Error("This item changed in another session. Reload the trash before trying again.");
      }
      if (row.kind === "chapter") {
        const parent = rows.find((candidate) => candidate.id === row.bookId && candidate.owner === owner);
        if (!parent || parent.deletedAt) throw new Error("Restore the book first, then restore this chapter.");
        if (rows.some((candidate) => candidate.kind === "chapter" && candidate.bookId === row.bookId && candidate.edition === row.edition && candidate.order === row.order && !candidate.deletedAt)) {
          throw new Error("A chapter already uses this position. Nothing was replaced. Resolve the order conflict before restoring.");
        }
      }
      row.deletedAt = null;
      row.published = false;
      row.revision += 1;
    },
  };
  return {
    adapter,
    snapshot: () => structuredClone(rows),
    setOwner: (value: string) => { owner = value; },
    changeRevision: (id: string) => { const row = rows.find((candidate) => candidate.id === id); if (row) row.revision += 1; },
  };
}
