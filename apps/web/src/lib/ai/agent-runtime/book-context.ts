/**
 * Loading a whole book for the agent, and pinning it.
 *
 * Every position the agent works with — a match at character 412 of chapter 3 —
 * is only meaningful against the exact stored text it was measured from. So a
 * chapter is loaded with a hash of its stored content, and that hash travels
 * with the plan. At apply time a chapter whose hash has moved is skipped, not
 * guessed at: the author typed in it since the plan was made, and the offsets
 * now point somewhere else.
 *
 * Server-only: parsing legacy HTML chapters pulls in cheerio.
 */

import { createHash } from "node:crypto";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chapterSchema } from "@/lib/tiptap-schema";
import { toTiptapContent } from "@/lib/tiptap-content";
import { htmlToTiptapDoc } from "@/lib/tiptap-content-html";
import { getBookAsOwner } from "@/lib/books/service";

/** Matches the whole-book analysis ceiling, for the same reason: a book with
 * more chapters than this is a data problem, not a manuscript. */
const MAX_CHAPTERS = 1000;

export class AgentBookError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AgentBookError";
    this.status = status;
  }
}

export type AgentChapter = {
  id: string;
  title: string;
  order: number;
  hash: string;
  /** Read together with the content, and used as the compare-and-swap key on
   * write — the same guard the editor's own autosave uses. */
  updatedAt: string;
  versionNumber: number;
  /** null when the stored content could not be parsed into this schema. */
  doc: ProseMirrorNode | null;
  unreadable: string | null;
};

export type AgentBook = {
  bookId: string;
  versionId: string;
  bookTitle: string;
  chapters: AgentChapter[];
};

/** Pins one chapter's stored content. Truncated: this is a change detector, not a signature. */
export function hashChapterContent(content: string): string {
  return createHash("sha256").update(content ?? "", "utf8").digest("hex").slice(0, 32);
}

/**
 * The stored chapter as a document in the editor's own schema.
 *
 * Three storage generations live in this column: Tiptap JSON, raw HTML from
 * early imports, and plain text from before that. All three have to become the
 * same kind of document here, or the agent would silently see an empty chapter
 * for the older two.
 */
export function parseChapterDocument(content: string | null): ProseMirrorNode {
  const value = toTiptapContent(content);
  if (typeof value === "string") {
    const json = value.trim() ? htmlToTiptapDoc(value) : { type: "doc", content: [{ type: "paragraph" }] };
    return ProseMirrorNode.fromJSON(chapterSchema, json);
  }
  return ProseMirrorNode.fromJSON(chapterSchema, value);
}

type ChapterRow = { id: string; title: string | null; order: number; content: string | null; updated_at: string; version_number: number };

function toAgentChapter(row: ChapterRow): AgentChapter {
  const base = {
    id: row.id,
    title: row.title?.trim() || "Untitled chapter",
    order: row.order,
    hash: hashChapterContent(row.content ?? ""),
    updatedAt: row.updated_at,
    versionNumber: row.version_number,
  };
  try {
    return { ...base, doc: parseChapterDocument(row.content), unreadable: null };
  } catch (error) {
    // One unreadable chapter must not cost the author the other eleven. It is
    // reported to the model so it can say so, rather than quietly counting zero
    // matches in it.
    console.warn("[agent.book-context] chapter could not be parsed", {
      chapterId: row.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return { ...base, doc: null, unreadable: "This chapter's stored format could not be read, so it was left out." };
  }
}

/** The book, its edition and every chapter in reading order. Ownership enforced. */
export async function loadAgentBook(
  supabase: SupabaseClient,
  bookId: string,
  userId: string,
  versionId?: string | null,
): Promise<AgentBook> {
  const owned = await getBookAsOwner<{ id: string; author_id: string; title: string | null; deleted_at: string | null }>(
    supabase, bookId, userId, "id, author_id, title, deleted_at",
  );
  if (!owned.ok) {
    throw new AgentBookError(
      owned.error === "database_error" ? "Could not verify this book. Try again." : "This book is not available in your account.",
      owned.error === "database_error" ? 503 : 404,
    );
  }
  if (owned.data.deleted_at) throw new AgentBookError("This book is not available in your account.", 404);

  const versions = supabase.from("book_versions").select("id, book_id").eq("book_id", bookId);
  const { data: version, error: versionError } = versionId
    ? await versions.eq("id", versionId).maybeSingle()
    : await versions.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (versionError) throw new AgentBookError("Could not load this edition. Try again.", 503);
  if (!version) throw new AgentBookError("This edition is not available in this book.", 404);

  const { data: rows, error } = await supabase
    .from("chapters")
    .select("id, title, content, order, updated_at, version_number")
    .eq("book_id", bookId)
    .eq("book_version_id", version.id)
    .is("deleted_at", null)
    .order("order")
    .order("id")
    .limit(MAX_CHAPTERS + 1);

  // A partial manuscript is worse than none: the agent would report "no other
  // occurrences" about chapters it never received.
  if (error || !rows) throw new AgentBookError("Could not load all chapters, so nothing was searched. Try again.", 503);
  if (rows.length > MAX_CHAPTERS) throw new AgentBookError("This edition has too many chapters for the assistant to work across.", 422);

  return {
    bookId: owned.data.id,
    versionId: version.id,
    bookTitle: owned.data.title?.trim() || "Untitled book",
    chapters: (rows as ChapterRow[]).map(toAgentChapter),
  };
}
